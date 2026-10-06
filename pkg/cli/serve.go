package cli

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/collector"
	"github.com/go-go-golems/docker-metrics/pkg/docker"
	"github.com/go-go-golems/docker-metrics/pkg/hub"
	"github.com/go-go-golems/docker-metrics/pkg/httpapi"
	"github.com/go-go-golems/docker-metrics/pkg/runtime"
	"github.com/go-go-golems/docker-metrics/pkg/store"
	"github.com/spf13/cobra"
)

func newServeCmd() *cobra.Command {
	flags := &commonFlags{}
	var (
		listen           string
		staticDir        string
		noDefaultDash    bool
		allowMutations   bool
	)
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Run the daemon (HTTP API, WebSocket, Prometheus, dashboards)",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			log := newLogger()
			clients, err := flags.buildClients(ctx)
			if err != nil {
				return err
			}
			sources := make([]collector.Source, len(clients))
			for i, c := range clients {
				sources[i] = c
			}

			st := store.NewMemory(flags.capacity)
			h := hub.New(log)
			col := collector.New(st, flags.collectorConfig(), log, sources...)

			hostsFn := func() []httpapi.HostInfo {
				out := make([]httpapi.HostInfo, 0, len(clients))
				for _, c := range clients {
					ep := c.Endpoint()
					out = append(out, httpapi.HostInfo{
						Name:      ep.Name,
						URI:       ep.URI,
						Version:   c.ServerVersion(),
						Connected: true,
					})
				}
				return out
			}

			mgr := runtime.NewManager(st)
			srv := httpapi.New(httpapi.Config{
				Store:            st,
				Manager:          mgr,
				Hub:              h,
				Log:              log,
				Hosts:            hostsFn,
				StaticDir:        staticDir,
				DefaultDashboard: !noDefaultDash,
				AllowMutations:   allowMutations,
			})
			col.OnEvent(func(ev docker.Event) {
				srv.RecordEvent(ev.Action, "docker event", ev.Actor.Attributes["name"], "")
				h.Event(ev.Action, ev.Actor.Attributes["name"], "", ev.Time)
			})

			// Collector runs for the lifetime of the server.
			go func() {
				if err := col.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
					log.Warn("collector stopped", "err", err)
				}
			}()
			// Give the list loop a moment, then start the live fleet stream.
			go func() {
				select {
				case <-ctx.Done():
					return
				case <-time.After(300 * time.Millisecond):
				}
				if err := srv.StartDefaultDashboard(ctx); err != nil {
					log.Warn("default dashboard failed", "err", err)
				}
			}()

			httpSrv := &http.Server{Addr: listen, Handler: srv.Handler()}
			go func() {
				<-ctx.Done()
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				_ = httpSrv.Shutdown(shutdownCtx)
			}()

			log.Info("docker-metrics listening", "addr", listen, "hosts", len(clients))
			if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		},
	}
	flags.register(cmd)
	cmd.Flags().StringVar(&listen, "listen", "127.0.0.1:8080", "HTTP listen address")
	cmd.Flags().StringVar(&staticDir, "static-dir", "web/dist", "directory with the built frontend (empty to use the fallback page)")
	cmd.Flags().BoolVar(&noDefaultDash, "no-default-dashboard", false, "do not start the built-in live fleet stream")
	cmd.Flags().BoolVar(&allowMutations, "allow-mutations", false, "allow dashboards to restart/stop/start containers")
	return cmd
}

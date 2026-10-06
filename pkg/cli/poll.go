package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/collector"
	"github.com/go-go-golems/docker-metrics/pkg/docker"
	"github.com/go-go-golems/docker-metrics/pkg/store"
	"github.com/spf13/cobra"
)

// commonFlags holds flags shared by commands that talk to Docker.
type commonFlags struct {
	hosts         []string
	statsInterval time.Duration
	listInterval  time.Duration
	timeout       time.Duration
	concurrency   int
	capacity      int
}

func (f *commonFlags) register(cmd *cobra.Command) {
	cmd.Flags().StringArrayVar(&f.hosts, "host", nil, "Docker host (repeatable): unix:///var/run/docker.sock, tcp://host:2375, ssh://user@host")
	cmd.Flags().DurationVar(&f.statsInterval, "stats-interval", time.Second, "how often to poll container stats")
	cmd.Flags().DurationVar(&f.listInterval, "list-interval", 5*time.Second, "how often to refresh the container list")
	cmd.Flags().DurationVar(&f.timeout, "request-timeout", 5*time.Second, "per-request timeout")
	cmd.Flags().IntVar(&f.concurrency, "concurrency", 16, "max concurrent stats requests per host")
	cmd.Flags().IntVar(&f.capacity, "capacity", 3600, "samples retained per container")
}

// buildClients creates one Docker client per host flag (default: local socket).
func (f *commonFlags) buildClients(ctx context.Context) ([]*docker.Client, error) {
	hosts := f.hosts
	if len(hosts) == 0 {
		hosts = []string{""}
	}
	var clients []*docker.Client
	for _, h := range hosts {
		ep, err := docker.ParseHost(h)
		if err != nil {
			return nil, err
		}
		cl, err := docker.NewClient(ep)
		if err != nil {
			return nil, fmt.Errorf("connect %s: %w", ep.URI, err)
		}
		if _, err := cl.Negotiate(ctx); err != nil {
			return nil, fmt.Errorf("docker %s: %w", ep.Name, err)
		}
		clients = append(clients, cl)
	}
	return clients, nil
}

// buildSources is buildClients adapted to the collector.Source interface.
func (f *commonFlags) buildSources(ctx context.Context) ([]collector.Source, error) {
	clients, err := f.buildClients(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]collector.Source, len(clients))
	for i, c := range clients {
		out[i] = c
	}
	return out, nil
}

func (f *commonFlags) collectorConfig() collector.Config {
	return collector.Config{
		ListInterval:  f.listInterval,
		StatsInterval: f.statsInterval,
		StatsTimeout:  f.timeout,
		Concurrency:   f.concurrency,
	}
}

func newLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func newPollCmd() *cobra.Command {
	flags := &commonFlags{}
	var (
		once   bool
		output string
	)
	cmd := &cobra.Command{
		Use:   "poll",
		Short: "Poll Docker metrics and print them",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			log := newLogger()
			sources, err := flags.buildSources(ctx)
			if err != nil {
				return err
			}
			st := store.NewMemory(flags.capacity)
			col := collector.New(st, flags.collectorConfig(), log, sources...)
			if once {
				col.PollOnce(ctx)
				return printStore(st, output)
			}
			go col.Run(ctx)
			tick := time.NewTicker(maxDuration(flags.statsInterval, time.Second))
			defer tick.Stop()
			for {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-tick.C:
					if err := printStore(st, output); err != nil {
						return err
					}
				}
			}
		},
	}
	flags.register(cmd)
	cmd.Flags().BoolVar(&once, "once", false, "poll once and exit")
	cmd.Flags().StringVar(&output, "output", "table", "output format: table or json")
	return cmd
}

type row struct {
	Host     string  `json:"host"`
	Name     string  `json:"name"`
	State    string  `json:"state"`
	CPU      float64 `json:"cpu"`
	MemMB    float64 `json:"memMB"`
	LimitMB  float64 `json:"limitMB"`
	RxPerSec float64 `json:"rxPerSec"`
	TxPerSec float64 `json:"txPerSec"`
	PIDs     int     `json:"pids"`
	Restarts int     `json:"restarts"`
}

func printStore(st store.Store, format string) error {
	containers := st.Containers()
	sort.Slice(containers, func(i, j int) bool {
		if containers[i].Host != containers[j].Host {
			return containers[i].Host < containers[j].Host
		}
		return containers[i].Name < containers[j].Name
	})
	rows := make([]row, 0, len(containers))
	for _, ct := range containers {
		s := st.Samples(ct.Host, ct.Name, 2)
		r := row{Host: ct.Host, Name: ct.Name, State: ct.State, Restarts: ct.Restarts}
		if len(s) > 0 {
			last := s[len(s)-1]
			r.CPU = last.CPU * 100
			r.MemMB = float64(last.Mem) / 1e6
			r.LimitMB = float64(last.Limit) / 1e6
			r.PIDs = last.PIDs
			if len(s) == 2 {
				prev := s[0]
				dt := float64(last.T - prev.T)
				if dt > 0 {
					r.RxPerSec = float64(last.Rx-prev.Rx) / dt
					r.TxPerSec = float64(last.Tx-prev.Tx) / dt
				}
			}
		}
		rows = append(rows, r)
	}
	if format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		return enc.Encode(rows)
	}
	fmt.Printf("%-8s %-16s %-11s %7s %9s %9s %10s %10s %6s %8s\n",
		"HOST", "NAME", "STATE", "CPU%", "MEM_MB", "LIM_MB", "RX_B/s", "TX_B/s", "PIDS", "RESTARTS")
	for _, r := range rows {
		fmt.Printf("%-8s %-16s %-11s %7.2f %9.1f %9.1f %10.0f %10.0f %6d %8d\n",
			r.Host, r.Name, r.State, r.CPU, r.MemMB, r.LimitMB, r.RxPerSec, r.TxPerSec, r.PIDs, r.Restarts)
	}
	return nil
}

func maxDuration(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}

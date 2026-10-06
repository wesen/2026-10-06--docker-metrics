package cli

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/collector"
	"github.com/go-go-golems/docker-metrics/pkg/runtime"
	"github.com/go-go-golems/docker-metrics/pkg/store"
	"github.com/spf13/cobra"
)

func newCheckCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "check <file.js>...",
		Short: "Validate dashboard JS files (syntax and DSL compilation)",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			m := runtime.NewManager(store.NewMemory(16))
			sess, err := m.NewSession(ctx, runtime.Options{})
			if err != nil {
				return err
			}
			defer func() { _ = sess.Close(context.Background()) }()
			failed := 0
			for _, f := range args {
				src, err := os.ReadFile(f)
				if err != nil {
					fmt.Printf("FAIL  %s: %v\n", f, err)
					failed++
					continue
				}
				if err := sess.Compile(ctx, f, string(src)); err != nil {
					fmt.Printf("FAIL  %s: %v\n", f, err)
					failed++
					continue
				}
				fmt.Printf("OK    %s\n", f)
			}
			if failed > 0 {
				return fmt.Errorf("%d file(s) failed to validate", failed)
			}
			return nil
		},
	}
	return cmd
}

func newRunCmd() *cobra.Command {
	flags := &commonFlags{}
	var (
		timeout        time.Duration
		follow         bool
		allowMutations bool
	)
	cmd := &cobra.Command{
		Use:   "run <file.js>",
		Short: "Run a dashboard JS file against live Docker metrics",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			sources, err := flags.buildSources(ctx)
			if err != nil {
				return err
			}
			st := store.NewMemory(flags.capacity)
			col := collector.New(st, flags.collectorConfig(), newLogger(), sources...)
			col.PollOnce(ctx)
			if len(st.Containers()) == 0 {
				fmt.Fprintln(os.Stderr, "warning: no containers found")
			}

			var promText strings.Builder
			sinks := map[string]bool{}
			m := runtime.NewManager(st)
			sess, err := m.NewSession(ctx, runtime.Options{
				Log: func(level, text string) {
					switch level {
					case "clear":
						return
					case "table":
						fmt.Println(text)
					default:
						fmt.Printf("%s: %s\n", level, text)
					}
				},
				Sink: func(kind string, opts, payload map[string]any) {
					switch kind {
					case "prometheus":
						prefix, _ := opts["prefix"].(string)
						writePrometheus(&promText, prefix, payload)
						sinks["prometheus"] = true
					case "file":
						path, _ := opts["path"].(string)
						line, _ := payload["line"].(string)
						if path != "" {
							f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
							if err == nil {
								fmt.Fprintln(f, line)
								f.Close()
							}
						}
						sinks["file"] = true
					case "statsd":
						sinks["statsd"] = true
					}
				},
				Event: func(name string, payload map[string]any) {
					fmt.Printf("event: %s %v\n", name, payload)
				},
				AllowMutations: allowMutations,
				TickInterval:   250 * time.Millisecond,
			})
			if err != nil {
				return err
			}
			defer func() { _ = sess.Close(context.Background()) }()

			runCtx := ctx
			var cancel context.CancelFunc
			if timeout > 0 {
				runCtx, cancel = context.WithTimeout(ctx, timeout)
				defer cancel()
			}
			for _, f := range args {
				src, err := os.ReadFile(f)
				if err != nil {
					return err
				}
				if err := sess.RunSource(runCtx, string(src)); err != nil {
					return err
				}
			}
			if follow || sess.HasItems(runCtx) {
				sess.StartTicker(runCtx)
				if !follow {
					// Wait until streams/watchers finish or the timeout fires.
					for sess.HasItems(runCtx) && runCtx.Err() == nil {
						time.Sleep(100 * time.Millisecond)
					}
				} else {
					<-runCtx.Done()
				}
			}
			if promText.Len() > 0 {
				fmt.Println("--- prometheus ---")
				fmt.Print(promText.String())
			}
			return nil
		},
	}
	flags.register(cmd)
	cmd.Flags().DurationVar(&timeout, "timeout", 0, "stop after this duration (0 = until the script finishes)")
	cmd.Flags().BoolVar(&follow, "follow", false, "keep running streams/watchers until interrupted")
	cmd.Flags().BoolVar(&allowMutations, "allow-mutations", false, "allow rules to restart/stop/start containers")
	return cmd
}

// writePrometheus renders flattened sink series in the exposition format.
func writePrometheus(sb *strings.Builder, prefix string, payload map[string]any) {
	series, _ := payload["series"].([]any)
	type entry struct {
		line string
		name string
	}
	var entries []entry
	for _, raw := range series {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name, _ := m["name"].(string)
		v, _ := m["v"].(float64)
		labels, _ := m["labels"].(map[string]any)
		full := prefix + name
		label := ""
		if len(labels) > 0 {
			keys := make([]string, 0, len(labels))
			for k := range labels {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			parts := make([]string, 0, len(keys))
			for _, k := range keys {
				parts = append(parts, fmt.Sprintf("%s=%q", k, fmt.Sprint(labels[k])))
			}
			label = "{" + strings.Join(parts, ",") + "}"
		}
		entries = append(entries, entry{name: full, line: fmt.Sprintf("%s%s %g", full, label, v)})
	}
	seen := map[string]bool{}
	for _, e := range entries {
		if !seen[e.name] {
			fmt.Fprintf(sb, "# TYPE %s gauge\n", e.name)
			seen[e.name] = true
		}
		sb.WriteString(e.line + "\n")
	}
}

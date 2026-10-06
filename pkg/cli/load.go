package cli

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/go-go-golems/docker-metrics/pkg/load"
	"github.com/spf13/cobra"
)

func newLoadCmd() *cobra.Command {
	cfg := load.DefaultConfig()
	cmd := &cobra.Command{
		Use:   "load",
		Short: "Generate synthetic CPU/memory load to test dashboards",
		Long: `Run a synthetic workload so docker-metrics dashboards have interesting data.

Profiles:
  cpu    steady CPU plus periodic bursts
  mem    memory sawtooth (grow to peak, release, repeat)
  leak   memory grows to the peak and is held there
  mixed  cpu + memory sawtooth

Intended to run inside a container; start several instances with different
profiles to exercise the fleet view, charts and alerts.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			return load.Run(ctx, cfg, newLogger())
		},
	}
	f := cmd.Flags()
	f.StringVar((*string)(&cfg.Profile), "profile", string(cfg.Profile), "cpu | mem | leak | mixed")
	f.StringVar(&cfg.Name, "name", hostname(), "name reported in logs")
	f.Float64Var(&cfg.CPUTarget, "cpu", cfg.CPUTarget, "CPU target in cores (1.0 = one core)")
	f.IntVar(&cfg.CPUWorkers, "cpu-workers", cfg.CPUWorkers, "number of CPU burner goroutines")
	f.DurationVar(&cfg.BurstPeriod, "burst-period", cfg.BurstPeriod, "CPU burst period (0 disables bursts)")
	f.DurationVar(&cfg.BurstDuration, "burst-duration", cfg.BurstDuration, "CPU burst duration")
	f.IntVar(&cfg.MemPeakMB, "mem-peak", cfg.MemPeakMB, "peak memory to allocate in MB")
	f.IntVar(&cfg.MemStepMB, "mem-step", cfg.MemStepMB, "memory allocation step in MB")
	f.DurationVar(&cfg.MemInterval, "mem-interval", cfg.MemInterval, "delay between memory steps")
	f.BoolVar(&cfg.HoldAtPeak, "hold-at-peak", cfg.HoldAtPeak, "hold memory at the peak instead of releasing")
	f.DurationVar(&cfg.Duration, "duration", cfg.Duration, "stop after this long (0 = until interrupted)")
	f.BoolVar(&cfg.Verbose, "verbose", cfg.Verbose, "log periodic status")
	return cmd
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "load"
	}
	return h
}

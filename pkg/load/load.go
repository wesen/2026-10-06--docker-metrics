// Package load implements a synthetic workload generator used to test
// docker-metrics dashboards. The `docker-metrics load` command runs it inside a
// container so several instances can produce CPU spikes and memory growth.
package load

import (
	"context"
	"log/slog"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// Profile selects which resource the workload stresses.
type Profile string

const (
	ProfileCPU   Profile = "cpu"
	ProfileMem   Profile = "mem"
	ProfileLeak  Profile = "leak"
	ProfileMixed Profile = "mixed"
)

// Config controls the synthetic workload.
type Config struct {
	Profile Profile
	Name    string

	// CPU: CPUTarget is the fraction of ONE core to consume overall (1.0 = one
	// core, 2.0 = two cores). CPUWorkers defaults to runtime.NumCPU().
	CPUTarget     float64
	CPUWorkers    int
	BurstPeriod   time.Duration // how often a burst happens (0 = continuous)
	BurstDuration time.Duration // how long a burst lasts

	// Memory: grow in MemStepMB steps every MemInterval up to MemPeakMB.
	MemPeakMB   int
	MemStepMB   int
	MemInterval time.Duration
	HoldAtPeak  bool // leak profile: hold instead of releasing

	Duration time.Duration // 0 = until the context is cancelled
	Verbose  bool
}

// DefaultConfig returns a mixed CPU + memory sawtooth workload.
func DefaultConfig() Config {
	return Config{
		Profile:       ProfileMixed,
		CPUTarget:     1.0,
		CPUWorkers:    runtime.NumCPU(),
		BurstPeriod:   20 * time.Second,
		BurstDuration: 5 * time.Second,
		MemPeakMB:     300,
		MemStepMB:     25,
		MemInterval:   3 * time.Second,
		Duration:      0,
		Verbose:       true,
	}
}

// Run executes the workload until the context is cancelled or Duration elapses.
func Run(ctx context.Context, cfg Config, log *slog.Logger) error {
	if log == nil {
		log = slog.Default()
	}
	if cfg.Duration > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cfg.Duration)
		defer cancel()
	}
	var wg sync.WaitGroup
	status := &statusReporter{start: time.Now()}

	switch cfg.Profile {
	case ProfileCPU:
		wg.Add(1)
		go func() { defer wg.Done(); runCPU(ctx, cfg, log, status) }()
	case ProfileMem, ProfileLeak:
		wg.Add(1)
		go func() { defer wg.Done(); runMem(ctx, cfg, log, status) }()
	case ProfileMixed:
		wg.Add(2)
		go func() { defer wg.Done(); runCPU(ctx, cfg, log, status) }()
		go func() { defer wg.Done(); runMem(ctx, cfg, log, status) }()
	}

	if cfg.Verbose {
		wg.Add(1)
		go func() { defer wg.Done(); reportLoop(ctx, cfg, log, status) }()
	}

	wg.Wait()
	log.Info("load finished", "name", cfg.Name, "profile", cfg.Profile, "burned", status.burned.Load())
	return nil
}

type statusReporter struct {
	memMB  atomic.Int64
	burned atomic.Uint64
	start  time.Time
}

func (s *statusReporter) setMemMB(v int64) { s.memMB.Store(v) }

func runCPU(ctx context.Context, cfg Config, log *slog.Logger, status *statusReporter) {
	workers := cfg.CPUWorkers
	if workers < 1 {
		workers = runtime.NumCPU()
	}
	period := 100 * time.Millisecond
	target := cfg.CPUTarget
	if target <= 0 {
		target = 1
	}
	perWorker := target / float64(workers)
	if perWorker > 1 {
		perWorker = 1
	}
	duty := time.Duration(float64(period) * perWorker)

	var burst atomic.Bool
	if cfg.BurstPeriod > 0 && cfg.BurstDuration > 0 {
		go func() {
			t := time.NewTicker(cfg.BurstPeriod)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					burst.Store(true)
					select {
					case <-ctx.Done():
						return
					case <-time.After(cfg.BurstDuration):
					}
					burst.Store(false)
				}
			}
		}()
	}

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ctx.Err() == nil {
				d := duty
				if burst.Load() {
					d = period
				}
				burn(d, &status.burned)
				if d < period {
					select {
					case <-ctx.Done():
						return
					case <-time.After(period - d):
					}
				}
			}
		}()
	}
	log.Info("cpu workload started", "name", cfg.Name, "workers", workers, "targetCores", target, "dutyCycle", duty.String(), "burstPeriod", cfg.BurstPeriod.String())
	wg.Wait()
}

// burn spins the CPU for d and accumulates into a sink so the compiler cannot
// optimize it away.
func burn(d time.Duration, sink *atomic.Uint64) {
	deadline := time.Now().Add(d)
	x := sink.Load() | 1
	for time.Now().Before(deadline) {
		x = x*1664525 + 1013904223
	}
	sink.Store(x)
}

func runMem(ctx context.Context, cfg Config, log *slog.Logger, status *statusReporter) {
	peak := cfg.MemPeakMB
	if peak <= 0 {
		peak = 256
	}
	step := cfg.MemStepMB
	if step <= 0 {
		step = 16
	}
	interval := cfg.MemInterval
	if interval <= 0 {
		interval = 2 * time.Second
	}
	hold := cfg.HoldAtPeak || cfg.Profile == ProfileLeak

	var chunks [][]byte
	var held int
	release := func() {
		chunks = nil
		held = 0
		status.setMemMB(0)
	}

	log.Info("memory workload started", "name", cfg.Name, "peakMB", peak, "stepMB", step, "interval", interval.String(), "hold", hold)
	for ctx.Err() == nil {
		if held >= peak {
			if hold {
				log.Info("memory peak reached; holding", "name", cfg.Name, "peakMB", peak)
				<-ctx.Done()
				return
			}
			release()
			log.Info("memory sawtooth reset", "name", cfg.Name)
			if !sleepCtx(ctx, interval) {
				return
			}
			continue
		}
		buf := make([]byte, step*1024*1024)
		touch(buf)
		chunks = append(chunks, buf)
		held += step
		status.setMemMB(int64(held))
		if !sleepCtx(ctx, interval) {
			return
		}
	}
	runtime.KeepAlive(chunks)
}

// touch writes one byte per page so the OS actually commits the memory and it
// shows up in Docker's memory_stats (RSS), not just virtual size.
func touch(buf []byte) {
	for i := 0; i < len(buf); i += 4096 {
		buf[i] = 0xA5
	}
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}

func reportLoop(ctx context.Context, cfg Config, log *slog.Logger, status *statusReporter) {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			log.Info("load status",
				"name", cfg.Name,
				"profile", cfg.Profile,
				"memMB", status.memMB.Load(),
				"uptime", time.Since(status.start).Round(time.Second).String(),
			)
		}
	}
}

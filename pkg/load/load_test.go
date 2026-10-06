package load

import (
	"context"
	"testing"
	"time"
)

func TestRunAllProfiles(t *testing.T) {
	for _, p := range []Profile{ProfileCPU, ProfileMem, ProfileLeak, ProfileMixed} {
		cfg := Config{
			Profile:     p,
			CPUTarget:   0.1,
			CPUWorkers:  1,
			BurstPeriod: 0,
			MemPeakMB:   2,
			MemStepMB:   1,
			MemInterval: time.Millisecond,
			Duration:    150 * time.Millisecond,
			Verbose:     false,
		}
		done := make(chan error, 1)
		go func() { done <- Run(context.Background(), cfg, nil) }()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("profile %s: %v", p, err)
			}
		case <-time.After(3 * time.Second):
			t.Fatalf("profile %s did not finish", p)
		}
	}
}

func TestRunCancels(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Verbose = false
	cfg.MemPeakMB = 1
	cfg.MemStepMB = 1
	cfg.MemInterval = time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Run(ctx, cfg, nil) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

func TestTouchCommitsPages(t *testing.T) {
	buf := make([]byte, 8192)
	touch(buf)
	if buf[0] != 0xA5 || buf[4096] != 0xA5 {
		t.Fatalf("touch did not write expected bytes: %#x %#x", buf[0], buf[4096])
	}
	if buf[100] != 0 {
		t.Fatalf("touch wrote outside page boundaries: %#x", buf[100])
	}
}

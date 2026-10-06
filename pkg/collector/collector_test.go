package collector

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/docker"
	"github.com/go-go-golems/docker-metrics/pkg/store"
)

type fakeSource struct {
	name  string
	list  []docker.ListContainer
	stats map[string]*docker.Stats
	calls int
}

func (f *fakeSource) Name() string { return f.name }
func (f *fakeSource) List(context.Context) ([]docker.ListContainer, error) {
	return f.list, nil
}
func (f *fakeSource) Stats(_ context.Context, id string) (*docker.Stats, error) {
	f.calls++
	return f.stats[id], nil
}
func (f *fakeSource) Events(context.Context, int64) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("")), nil
}

func TestCollectorPollStats(t *testing.T) {
	src := &fakeSource{
		name: "local",
		list: []docker.ListContainer{{ID: "abc123", Names: []string{"/web"}, Image: "nginx", State: "running", Labels: map[string]string{"tier": "frontend"}}},
		stats: map[string]*docker.Stats{
			"abc123": {CPUStats: docker.CPUStats{CPUUsage: docker.CPUUsage{TotalUsage: 1000}, SystemCPUUsage: 10000, OnlineCPUs: 4}},
		},
	}
	st := store.NewMemory(10)
	col := New(st, DefaultConfig(), nil, src)
	now := int64(1770000000)
	col.SetClock(func() int64 { now++; return now })

	col.Refresh(t.Context())
	col.PollStats(t.Context())
	src.stats["abc123"] = &docker.Stats{CPUStats: docker.CPUStats{CPUUsage: docker.CPUUsage{TotalUsage: 2000}, SystemCPUUsage: 20000, OnlineCPUs: 4}}
	col.PollStats(t.Context())

	samples := st.Samples("local", "web", 10)
	if len(samples) != 2 {
		t.Fatalf("got %d samples, want 2", len(samples))
	}
	if !samples[1].CPUValid {
		t.Fatal("second sample must have a valid CPU fraction")
	}
	// cd/sd = 1000/10000 = 0.1, * onlineCPUs(4) = 0.4
	if got := samples[1].CPU; got < 0.39 || got > 0.41 {
		t.Fatalf("cpu fraction = %v, want ~0.4", got)
	}
}

func TestCollectorRemovesVanishedContainers(t *testing.T) {
	src := &fakeSource{name: "local", list: []docker.ListContainer{{ID: "a", Names: []string{"/one"}, State: "running"}, {ID: "b", Names: []string{"/two"}, State: "running"}}}
	st := store.NewMemory(10)
	col := New(st, DefaultConfig(), nil, src)
	col.Refresh(t.Context())
	if len(st.Containers()) != 2 {
		t.Fatalf("want 2 containers, got %d", len(st.Containers()))
	}
	src.list = src.list[:1]
	col.Refresh(t.Context())
	if len(st.Containers()) != 1 {
		t.Fatalf("want 1 container after removal, got %d", len(st.Containers()))
	}
}

func TestCollectorSkipsStopped(t *testing.T) {
	src := &fakeSource{name: "local", list: []docker.ListContainer{{ID: "a", Names: []string{"/stopped"}, State: "exited"}}}
	st := store.NewMemory(10)
	col := New(st, DefaultConfig(), nil, src)
	col.Refresh(t.Context())
	col.PollStats(t.Context())
	if src.calls != 0 {
		t.Fatalf("stopped container must not be polled, got %d calls", src.calls)
	}
}

func TestRingBounded(t *testing.T) {
	st := store.NewMemory(3)
	for i := 0; i < 10; i++ {
		st.Append("h", "c", store.Sample{T: int64(i)})
	}
	s := st.Samples("h", "c", 100)
	if len(s) != 3 {
		t.Fatalf("ring not bounded: got %d, want 3", len(s))
	}
	if s[0].T != 7 || s[2].T != 9 {
		t.Fatalf("ring order wrong: %+v", s)
	}
}

func TestCollectorRunCancels(t *testing.T) {
	st := store.NewMemory(3)
	col := New(st, Config{ListInterval: time.Millisecond, StatsInterval: time.Millisecond}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := col.Run(ctx); err != context.DeadlineExceeded {
		t.Fatalf("Run returned %v, want DeadlineExceeded", err)
	}
}

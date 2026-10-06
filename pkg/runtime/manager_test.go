package runtime

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/store"
)

type recorder struct {
	mu   sync.Mutex
	logs []string
}

func (r *recorder) log(level, text string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.logs = append(r.logs, level+":"+text)
}

func (r *recorder) joined() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return strings.Join(r.logs, "\n")
}

func seedStore() store.Store {
	st := store.NewMemory(100)
	st.UpsertContainer(store.Container{Name: "web", Host: "local", Image: "nginx:1.25", State: "running", Labels: map[string]string{"tier": "frontend", "service": "web"}})
	st.UpsertContainer(store.Container{Name: "api-1", Host: "local", Image: "node:20", State: "running", Labels: map[string]string{"tier": "backend", "service": "api"}})
	base := time.Now().Unix() - 2
	for _, s := range []store.Sample{
		{T: base, CPU: 0.5, Mem: 1048576, Limit: 2097152, Rx: 1000, Tx: 2000, PIDs: 10, PIDsLimit: 100, CPUValid: true},
		{T: base + 1, CPU: 0.6, Mem: 2097152, Limit: 2097152, Rx: 1200, Tx: 2200, PIDs: 11, PIDsLimit: 100, CPUValid: true},
	} {
		st.Append("local", "web", s)
	}
	st.Append("local", "api-1", store.Sample{T: base + 1, CPU: 0.3, Mem: 300000, Limit: 2097152, Rx: 5, Tx: 6, PIDs: 4, PIDsLimit: 100, CPUValid: true})
	return st
}

func newTestSession(t *testing.T, rec *recorder) (*Session, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	m := NewManager(seedStore())
	s, err := m.NewSession(ctx, Options{Log: rec.log, TickInterval: 10_000_000_000})
	if err != nil {
		cancel()
		t.Fatalf("NewSession: %v", err)
	}
	t.Cleanup(func() { _ = s.Close(context.Background()) })
	return s, cancel
}

func TestPreludeReadAndAggregate(t *testing.T) {
	rec := &recorder{}
	s, cancel := newTestSession(t, rec)
	defer cancel()
	src := `
const d = docker();
console.log("cpu", await d.container("web").read(cpu));
console.log("memMB", await d.container("web").read(mem.pipe(mb)));
console.log("rxRate", await d.container("web").read(net.rx.pipe(rate("1s"))));
console.log("avg", await d.containers({ label: "tier=frontend" }).read(cpu.pipe(avg)));
console.log("byService", JSON.stringify(await d.containers().read(cpu.pipe(avg), by("label:service"))));
console.log("hot", await d.containers().read(cpu.is(gt(0.5))));
`
	if err := s.RunSource(context.Background(), src); err != nil {
		t.Fatalf("RunSource: %v\nlogs:\n%s", err, rec.joined())
	}
	got := rec.joined()
	want := []string{"cpu 0.6", "memMB 2.0972", "rxRate 200", "avg 0.6"}
	for _, w := range want {
		if !strings.Contains(got, w) {
			t.Errorf("missing %q in logs:\n%s", w, got)
		}
	}
	if !strings.Contains(got, `"web":0.6`) && !strings.Contains(got, `"api-1":0.3`) {
		t.Errorf("byService missing per-service values:\n%s", got)
	}
	if !strings.Contains(got, "hot ") {
		t.Errorf("predicate read missing:\n%s", got)
	}
}

func TestPreludeHistoryAndErrors(t *testing.T) {
	rec := &recorder{}
	s, cancel := newTestSession(t, rec)
	defer cancel()
	src := `
const d = docker();
const rows = await d.container("web").history(cpu, last("1h"), bucket("1s", avg));
console.log("rows", rows.length);
try { cpu.pipe(avg, avg); } catch (e) { console.log("err1", e.message); }
try { await d.containers().read(cpu.pipe(avg), by("bogus")); } catch (e) { console.log("err2", e.message); }
`
	if err := s.RunSource(context.Background(), src); err != nil {
		t.Fatalf("RunSource: %v\nlogs:\n%s", err, rec.joined())
	}
	got := rec.joined()
	if !strings.Contains(got, "rows 2") {
		t.Errorf("history bucket rows: want 2, logs:\n%s", got)
	}
	if !strings.Contains(got, "err1 pipe(): only one reducer") {
		t.Errorf("two-reducer error missing:\n%s", got)
	}
	if !strings.Contains(got, "err2 by(): unknown key") {
		t.Errorf("unknown by() key error missing:\n%s", got)
	}
}

func TestPreludeStreamTick(t *testing.T) {
	rec := &recorder{}
	s, cancel := newTestSession(t, rec)
	defer cancel()
	src := `
const d = docker();
d.container("web").stream(cpu, { every: "0s" }).to(tap(f => console.log("frame", f.value)));
`
	if err := s.RunSource(context.Background(), src); err != nil {
		t.Fatalf("RunSource: %v", err)
	}
	if !s.HasItems(context.Background()) {
		t.Fatal("stream item not registered")
	}
	for i := 0; i < 3; i++ {
		if err := s.Tick(context.Background()); err != nil {
			t.Fatalf("Tick: %v", err)
		}
	}
	if got := rec.joined(); !strings.Contains(got, "frame 0.6") {
		t.Errorf("stream frame missing:\n%s", got)
	}
}

func TestCompileRejectsSyntaxError(t *testing.T) {
	rec := &recorder{}
	s, cancel := newTestSession(t, rec)
	defer cancel()
	if err := s.Compile(context.Background(), "bad.js", "const x = ;"); err == nil {
		t.Fatal("expected a syntax error")
	}
}

func TestMutationsGatedByFlag(t *testing.T) {
	ctx := context.Background()
	run := func(allow bool) []string {
		var actions []string
		m := NewManager(seedStore())
		s, err := m.NewSession(ctx, Options{
			AllowMutations: allow,
			Action:         func(a string, n []string, _ map[string]any) { actions = append(actions, a+":"+strings.Join(n, ",")) },
		})
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = s.Close(context.Background()) }()
		if err := s.RunSource(ctx, `docker().container("web").stop();`); err != nil {
			t.Fatal(err)
		}
		return actions
	}
	if got := run(false); len(got) != 0 {
		t.Fatalf("mutations must be blocked by default, got %v", got)
	}
	if got := run(true); len(got) != 1 || got[0] != "stop:web" {
		t.Fatalf("expected stop:web, got %v", got)
	}
}

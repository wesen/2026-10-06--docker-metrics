package runtime

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/store"
)

// presetDir holds the IDE presets, one JavaScript file each. The frontend
// bundles them with import.meta.glob; this test executes every one of them.
const presetDir = "../../web/src/presets/files"

// presetStore seeds a small fleet that resembles the compose demo: two
// compose projects, load generators matched by "*load-*", a container
// without labels or a PID limit, and an exited container without samples.
func presetStore() store.Store {
	st := store.NewMemory(600)
	const mb = 1 << 20
	type spec struct {
		name, project, service string
		cpu                    func(i int) float64
		mem                    func(i int) uint64
		pidsLimit              int
	}
	specs := []spec{
		{"shop-api-1", "shop", "api", func(i int) float64 { return 0.3 + 0.2*math.Sin(float64(i)/10) }, func(i int) uint64 { return 120 * mb }, 512},
		{"shop-db-1", "shop", "db", func(i int) float64 { return 0.05 }, func(i int) uint64 { return 200 * mb }, 512},
		{"lab-load-cpu-1", "lab", "load-cpu", func(i int) float64 { return 1.5 + float64(i%30)/30 }, func(i int) uint64 { return 30 * mb }, 256},
		{"lab-load-leak-1", "lab", "load-leak", func(i int) float64 { return 0.01 }, func(i int) uint64 { return uint64(50+i) * mb }, 256},
		{"standalone", "", "", func(i int) float64 { return 0.002 }, func(i int) uint64 { return 10 * mb }, 0},
	}
	now := time.Now().Unix()
	const n = 240
	for _, s := range specs {
		labels := map[string]string{}
		if s.project != "" {
			labels["com.docker.compose.project"] = s.project
			labels["com.docker.compose.service"] = s.service
		}
		st.UpsertContainer(store.Container{Name: s.name, ID: s.name + "-id", Host: "local", Image: "img/" + s.service, State: "running", Labels: labels, PIDsLimit: s.pidsLimit})
		for i := 0; i < n; i++ {
			st.Append("local", s.name, store.Sample{
				T: now - n + int64(i) + 1, CPU: s.cpu(i), Mem: s.mem(i), Limit: 512 * mb,
				Rx: uint64(i * 4000), Tx: uint64(i * 2500), IoR: uint64(i * 8192), IoW: uint64(i * 16384),
				PIDs: 5 + i%3, PIDsLimit: s.pidsLimit, CPUValid: true,
			})
		}
	}
	st.UpsertContainer(store.Container{Name: "old-job", ID: "old-job-id", Host: "local", Image: "img/job", State: "exited", Labels: map[string]string{}})
	return st
}

type presetFile struct {
	name, group, source string
}

func loadPresets(t *testing.T) []presetFile {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(presetDir, "*.js"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Skipf("no presets under %s", presetDir)
	}
	sort.Strings(files)
	var out []presetFile
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		p := presetFile{name: filepath.Base(f), source: string(b)}
		for _, line := range strings.Split(p.source, "\n") {
			if g, ok := strings.CutPrefix(line, "// @group "); ok {
				p.group = strings.TrimSpace(g)
			}
		}
		if p.group == "" {
			t.Errorf("%s: missing // @group header", p.name)
		}
		out = append(out, p)
	}
	return out
}

func TestPresetsRun(t *testing.T) {
	st := presetStore()
	for _, p := range loadPresets(t) {
		t.Run(p.name, func(t *testing.T) {
			var (
				mu        sync.Mutex
				errs      []string
				snapshots []map[string]any
			)
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			sess, err := NewManager(st).NewSession(ctx, Options{
				Log: func(level, text string) {
					if level == "error" {
						mu.Lock()
						errs = append(errs, text)
						mu.Unlock()
					}
				},
				PublishSnapshot: func(_ string, snap map[string]any) {
					mu.Lock()
					snapshots = append(snapshots, snap)
					mu.Unlock()
				},
				TickInterval: 20 * time.Millisecond,
			})
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = sess.Close(context.Background()) }()
			sess.StartTicker(ctx)
			if err := sess.RunSource(ctx, p.source); err != nil {
				t.Fatalf("run failed: %v", err)
			}
			// Let streams, watchers and the dashboard refresh tick a few times.
			time.Sleep(300 * time.Millisecond)
			cancel()

			mu.Lock()
			defer mu.Unlock()
			for _, e := range errs {
				t.Errorf("console error: %s", e)
			}
			isDashboard := strings.HasPrefix(p.group, "Dashboards")
			if isDashboard && len(snapshots) == 0 {
				t.Fatal("dashboard preset published no snapshot")
			}
			if len(snapshots) == 0 {
				return
			}
			snap := snapshots[len(snapshots)-1]
			if _, err := json.Marshal(snap); err != nil {
				t.Fatalf("snapshot is not JSON-encodable: %v", err)
			}
			rows, _ := snap["rows"].([]any)
			widgets := 0
			for _, r := range rows {
				rm, _ := r.(map[string]any)
				ws, _ := rm["widgets"].([]any)
				for _, w := range ws {
					wm, _ := w.(map[string]any)
					widgets++
					if e := wm["error"]; e != nil {
						t.Errorf("widget %v %q: %v", wm["type"], wm["title"], e)
					} else if wm["data"] == nil {
						t.Errorf("widget %v %q: no data", wm["type"], wm["title"])
					}
				}
			}
			if isDashboard && widgets == 0 {
				t.Error("dashboard has no widgets")
			}
		})
	}
}

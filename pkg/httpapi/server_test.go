package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-go-golems/docker-metrics/pkg/hub"
	"github.com/go-go-golems/docker-metrics/pkg/runtime"
	"github.com/go-go-golems/docker-metrics/pkg/store"
)

func testServer() (*httptest.Server, store.Store) {
	st := store.NewMemory(64)
	st.UpsertContainer(store.Container{Name: "web", Host: "local", Image: "nginx", State: "running", Labels: map[string]string{"tier": "frontend"}})
	st.Append("local", "web", store.Sample{T: time.Now().Unix(), CPU: 0.5, Mem: 100, Limit: 200, CPUValid: true})
	h := hub.New(nil)
	srv := New(Config{
		Store:   st,
		Manager: runtime.NewManager(st),
		Hub:     h,
		Hosts:   func() []HostInfo { return []HostInfo{{Name: "local", Connected: true}} },
	})
	return httptest.NewServer(srv.Handler()), st
}

func TestHealthAndReady(t *testing.T) {
	ts, _ := testServer()
	defer ts.Close()
	for _, path := range []string{"/healthz", "/readyz"} {
		resp, err := ts.Client().Get(ts.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != 200 {
			t.Fatalf("%s status %d", path, resp.StatusCode)
		}
		resp.Body.Close()
	}
}

func TestContainersEndpoint(t *testing.T) {
	ts, _ := testServer()
	defer ts.Close()
	resp, err := ts.Client().Get(ts.URL + "/api/v1/containers")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0]["name"] != "web" {
		t.Fatalf("unexpected containers: %+v", out)
	}
}

func TestWebSocketSubscribe(t *testing.T) {
	ts, _ := testServer()
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	read := func() map[string]any {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(data, &m); err != nil {
			t.Fatal(err)
		}
		return m
	}
	if m := read(); m["type"] != "hello" {
		t.Fatalf("first frame = %v, want hello", m)
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"subscribe","topic":"fleet"}`)); err != nil {
		t.Fatal(err)
	}
	sub := read()
	if sub["type"] != "subscribed" || sub["topic"] != "fleet" {
		t.Fatalf("expected subscribed frame, got %v", sub)
	}
	// A published frame must reach the subscriber.
	// (The hub is reachable through the server's config.)
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"ping"}`)); err != nil {
		t.Fatal(err)
	}
	if pong := read(); pong["type"] != "pong" {
		t.Fatalf("expected pong, got %v", pong)
	}
}

func TestWebSocketReplay(t *testing.T) {
	st := store.NewMemory(8)
	h := hub.New(nil)
	srv := New(Config{Store: st, Manager: runtime.NewManager(st), Hub: h})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// Publish before anyone subscribes: the hub must replay recent frames.
	h.Publish("events", hub.Frame{Type: "event", Kind: "restart", Data: map[string]any{"container": "web"}})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"subscribe","topic":"events"}`)); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		if m["type"] == "event" {
			return
		}
	}
	t.Fatal("recent event frame was not replayed to the late subscriber")
}

func TestPromRegistryRendering(t *testing.T) {
	p := newPromRegistry()
	p.ingest(map[string]any{"prefix": "dock_"}, map[string]any{"series": []any{
		map[string]any{"name": "cpu", "labels": map[string]any{"container": "web"}, "v": 0.5},
		map[string]any{"name": "cpu", "labels": map[string]any{"container": "api"}, "v": 0.25},
	}})
	out := p.render()
	for _, want := range []string{`# TYPE dock_cpu gauge`, `dock_cpu{container="web"} 0.5`, `dock_cpu{container="api"} 0.25`} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
}

func TestWebSocketReplaysOnlyLatestSnapshot(t *testing.T) {
	st := store.NewMemory(8)
	h := hub.New(nil)
	srv := New(Config{Store: st, Manager: runtime.NewManager(st), Hub: h})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	for i := 1; i <= 5; i++ {
		h.Publish("dash:board", hub.Frame{Type: "snapshot", Value: map[string]any{"n": i}})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"subscribe","topic":"dash:board"}`)); err != nil {
		t.Fatal(err)
	}
	// Expect hello, then exactly one snapshot (n=5), then the subscribed ack.
	var snaps []float64
	for i := 0; i < 3; i++ {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		if m["type"] == "snapshot" {
			v, _ := m["value"].(map[string]any)
			n, _ := v["n"].(float64)
			snaps = append(snaps, n)
		}
	}
	if len(snaps) != 1 || snaps[0] != 5 {
		t.Fatalf("want exactly the latest snapshot replayed (n=5), got %v", snaps)
	}
}

func TestRunSnapshotsOnRunTopic(t *testing.T) {
	st := store.NewMemory(8)
	h := hub.New(nil)
	srv := New(Config{Store: st, Manager: runtime.NewManager(st), Hub: h})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"subscribe","topic":"run:r1:dash"}`)); err != nil {
		t.Fatal(err)
	}
	body := `{"runId":"r1","source":"dashboard(\"Mine\").row(text(\"t\", \"hi\")).show();"}`
	resp, err := http.Post(ts.URL+"/api/v1/run", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	defer func() {
		r, _ := http.Post(ts.URL+"/api/v1/run/r1/stop", "application/json", nil)
		if r != nil {
			r.Body.Close()
		}
	}()
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("no snapshot on run:r1:dash: %v", err)
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		if m["type"] == "snapshot" {
			v, _ := m["value"].(map[string]any)
			if m["topic"] != "run:r1:dash" || v["title"] != "Mine" {
				t.Fatalf("unexpected snapshot frame: %v", m)
			}
			return
		}
	}
}

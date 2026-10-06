// Package httpapi serves the REST API, the WebSocket endpoint, Prometheus and
// the embedded single-page application.
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/go-go-golems/docker-metrics/pkg/hub"
	"github.com/go-go-golems/docker-metrics/pkg/runtime"
	"github.com/go-go-golems/docker-metrics/pkg/store"
)

// HostInfo describes one Docker endpoint for the UI.
type HostInfo struct {
	Name          string `json:"name"`
	URI           string `json:"uri"`
	Version       string `json:"version"`
	Connected     bool   `json:"connected"`
	CgroupVersion int    `json:"cgroupVersion"`
	LastError     string `json:"lastError"`
}

// Dashboard is a saved JS program plus presentation metadata.
type Dashboard struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Source    string          `json:"source"`
	Meta      json.RawMessage `json:"meta,omitempty"`
	UpdatedAt int64           `json:"updatedAt"`
}

// Config configures the HTTP server.
type Config struct {
	Store     store.Store
	Manager   *runtime.Manager
	Hub       *hub.Hub
	Log       *slog.Logger
	Hosts     func() []HostInfo
	StaticDir string
	// DefaultDashboard streams the built-in live fleet view.
	DefaultDashboard bool
	// AllowMutations lets dashboards restart/stop/start containers.
	AllowMutations bool
	// Mutator performs a container mutation (restart|stop|start).
	Mutator func(action, container string) error
}

// Server is the docker-metrics HTTP surface.
type Server struct {
	cfg   Config
	prom  *promRegistry
	dash  *dashboardStore
	evMu  sync.Mutex
	evts  []eventEntry
	runMu sync.Mutex
	runs  map[string]*runHandle
}

type eventEntry struct {
	T         int64  `json:"t"`
	Type      string `json:"type"`
	Msg       string `json:"msg"`
	Container string `json:"container,omitempty"`
	Rule      string `json:"rule,omitempty"`
}

type runHandle struct {
	id      string
	session *runtime.Session
	cancel  context.CancelFunc
}

// New builds a Server.
func New(cfg Config) *Server {
	if cfg.Log == nil {
		cfg.Log = slog.Default()
	}
	return &Server{
		cfg:  cfg,
		prom: newPromRegistry(),
		dash: newDashboardStore(),
		runs: map[string]*runHandle{},
	}
}

// Handler returns the root HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /readyz", s.handleReady)
	mux.HandleFunc("GET /ws", s.handleWS)
	mux.HandleFunc("GET /api/v1/hosts", s.handleHosts)
	mux.HandleFunc("GET /api/v1/containers", s.handleContainers)
	mux.HandleFunc("GET /api/v1/containers/{name}", s.handleContainer)
	mux.HandleFunc("GET /api/v1/containers/{name}/samples", s.handleSamples)
	mux.HandleFunc("GET /api/v1/events", s.handleEvents)
	mux.HandleFunc("GET /api/v1/dashboards", s.handleDashboardsList)
	mux.HandleFunc("POST /api/v1/dashboards", s.handleDashboardCreate)
	mux.HandleFunc("GET /api/v1/dashboards/{id}", s.handleDashboardGet)
	mux.HandleFunc("PUT /api/v1/dashboards/{id}", s.handleDashboardPut)
	mux.HandleFunc("DELETE /api/v1/dashboards/{id}", s.handleDashboardDelete)
	mux.HandleFunc("POST /api/v1/run", s.handleRun)
	mux.HandleFunc("POST /api/v1/run/{id}/stop", s.handleRunStop)
	mux.HandleFunc("GET /metrics", s.handleMetrics)
	mux.HandleFunc("GET /", s.handleStatic)
	return mux
}

// StartDefaultDashboard publishes the built-in fleet stream to the hub.
func (s *Server) StartDefaultDashboard(ctx context.Context) error {
	if !s.cfg.DefaultDashboard || s.cfg.Manager == nil {
		return nil
	}
	src := `docker().containers().stream({cpu: cpu.pipe(pct), mem: mem.pipe(of("limit"), pct)}, { every: "1s" }).to(ws("fleet"));`
	sess, err := s.cfg.Manager.NewSession(ctx, runtime.Options{
		Log: func(level, text string) { s.cfg.Log.Debug("dashboard", "level", level, "text", text) },
		Publish: func(topic string, frame map[string]any) {
			s.cfg.Hub.Publish(topic, hub.Frame{T: int64Of(frame["t"]), Data: mapOf(frame["data"])})
		},
		PublishSnapshot: func(id string, snap map[string]any) {
			s.cfg.Hub.Publish("dash:"+id, hub.Frame{Type: "snapshot", Value: snap})
			s.cfg.Hub.Publish("dash:latest", hub.Frame{Type: "snapshot", Value: snap})
		},
		Sink: func(kind string, opts, payload map[string]any) {
			if kind == "prometheus" {
				s.prom.ingest(opts, payload)
			}
		},
		TickInterval: 500 * time.Millisecond,
	})
	if err != nil {
		return err
	}
	if err := sess.RunSource(ctx, src); err != nil {
		return err
	}
	sess.StartTicker(ctx)
	return nil
}

// RecordEvent stores an event for the Events tab.
func (s *Server) RecordEvent(kind, msg, container, rule string) {
	s.evMu.Lock()
	defer s.evMu.Unlock()
	s.evts = append(s.evts, eventEntry{T: time.Now().Unix(), Type: kind, Msg: msg, Container: container, Rule: rule})
	if len(s.evts) > 500 {
		s.evts = s.evts[len(s.evts)-500:]
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "serverTime": time.Now().Unix()})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	hosts := s.hosts()
	for _, h := range hosts {
		if h.Connected {
			writeJSON(w, http.StatusOK, map[string]any{"status": "ready"})
			return
		}
	}
	writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "no docker hosts connected"})
}

func (s *Server) hosts() []HostInfo {
	if s.cfg.Hosts == nil {
		return nil
	}
	return s.cfg.Hosts()
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		s.cfg.Log.Warn("websocket accept failed", "err", err)
		return
	}
	client := s.cfg.Hub.NewClient(r.Context(), conn)
	client.Run()
}

func (s *Server) handleHosts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.hosts())
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	type containerView struct {
		store.Container
		Last *store.Sample `json:"lastSample,omitempty"`
	}
	var out []containerView
	for _, c := range s.cfg.Store.Containers() {
		v := containerView{Container: c}
		if samples := s.cfg.Store.Samples(c.Host, c.Name, 1); len(samples) > 0 {
			v.Last = &samples[len(samples)-1]
		}
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Host != out[j].Host {
			return out[i].Host < out[j].Host
		}
		return out[i].Name < out[j].Name
	})
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleContainer(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	for _, c := range s.cfg.Store.Containers() {
		if c.Name == name {
			writeJSON(w, http.StatusOK, c)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "no such container: "+name)
}

func (s *Server) handleSamples(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	host := r.URL.Query().Get("host")
	window := parseWindow(r.URL.Query().Get("window"), 5*time.Minute)
	n := int(window.Seconds()) + 2
	var target store.Container
	found := false
	for _, c := range s.cfg.Store.Containers() {
		if c.Name == name && (host == "" || c.Host == host) {
			target = c
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "not_found", "no such container: "+name)
		return
	}
	samples := s.cfg.Store.Samples(target.Host, target.Name, n)
	writeJSON(w, http.StatusOK, map[string]any{"name": target.Name, "host": target.Host, "points": samples})
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.evMu.Lock()
	defer s.evMu.Unlock()
	out := make([]eventEntry, len(s.evts))
	copy(out, s.evts)
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	io.WriteString(w, s.prom.render())
}

func (s *Server) serveFallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!doctype html><html><head><title>docker-metrics</title></head>
<body style="font:14px system-ui;padding:2rem">
<h1>docker-metrics</h1>
<p>The React frontend is not built yet. Endpoints:</p>
<ul>
<li><a href="/api/v1/containers">/api/v1/containers</a></li>
<li><a href="/api/v1/hosts">/api/v1/hosts</a></li>
<li><a href="/metrics">/metrics</a></li>
<li><code>/ws</code></li>
</ul>
</body></html>`)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": msg}})
}

func parseWindow(s string, def time.Duration) time.Duration {
	if s == "" {
		return def
	}
	m, err := time.ParseDuration(s)
	if err != nil || m <= 0 {
		return def
	}
	return m
}

func int64Of(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case float64:
		return int64(x)
	case int:
		return int64(x)
	}
	return time.Now().Unix()
}

func mapOf(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

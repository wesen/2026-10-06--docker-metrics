package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/hub"
	"github.com/go-go-golems/docker-metrics/pkg/runtime"
)

type runRequest struct {
	Source string `json:"source"`
	RunID  string `json:"runId"`
}

func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Manager == nil {
		writeError(w, http.StatusServiceUnavailable, "unavailable", "runtime not configured")
		return
	}
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if len(req.Source) > 256*1024 {
		writeError(w, http.StatusBadRequest, "too_large", "source exceeds 256 KB")
		return
	}
	id := req.RunID
	if id == "" {
		id = newID()
	}
	topic := "run:" + id

	s.runMu.Lock()
	if old, ok := s.runs[id]; ok {
		old.cancel()
		delete(s.runs, id)
	}
	s.runMu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	sess, err := s.cfg.Manager.NewSession(ctx, runtime.Options{
		Log: func(level, text string) {
			if level == "clear" {
				return
			}
			f := hub.Frame{Type: "log", Run: id, Level: level, Text: text}
			if level == "table" {
				f.Level = "table"
			}
			s.cfg.Hub.Publish(topic, f)
		},
		Sink: func(kind string, opts, payload map[string]any) {
			if kind == "prometheus" {
				s.prom.ingest(opts, payload)
			}
		},
		Publish: func(t string, frame map[string]any) {
			s.cfg.Hub.Publish(t, hub.Frame{T: int64Of(frame["t"]), Data: mapOf(frame["data"]), Value: frame["value"]})
		},
		Event: func(name string, payload map[string]any) {
			s.RecordEvent("emit", name, stringOf(payload["container"]), stringOf(payload["rule"]))
			s.cfg.Hub.Publish("events", hub.Frame{Type: "event", Kind: "emit", Rule: name})
		},
		AllowMutations: s.cfg.AllowMutations,
		TickInterval:   250 * time.Millisecond,
	})
	if err != nil {
		cancel()
		writeError(w, http.StatusInternalServerError, "runtime_error", err.Error())
		return
	}

	handle := &runHandle{id: id, session: sess, cancel: cancel}
	s.runMu.Lock()
	s.runs[id] = handle
	s.runMu.Unlock()

	go func() {
		start := time.Now()
		err := sess.RunSource(ctx, req.Source)
		if err != nil && ctx.Err() == nil {
			s.cfg.Hub.Publish(topic, hub.Frame{Type: "run", Run: id, Status: "error", Message: err.Error()})
		} else if ctx.Err() == nil {
			s.cfg.Hub.Publish(topic, hub.Frame{Type: "run", Run: id, Status: "ok", Message: msString(time.Since(start))})
		}
		sess.StartTicker(ctx)
		<-ctx.Done()
		_ = sess.Close(context.Background())
		s.runMu.Lock()
		delete(s.runs, id)
		s.runMu.Unlock()
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{"runId": id, "accepted": true})
}

func (s *Server) handleRunStop(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.runMu.Lock()
	handle, ok := s.runs[id]
	if ok {
		delete(s.runs, id)
	}
	s.runMu.Unlock()
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "no such run")
		return
	}
	handle.cancel()
	writeJSON(w, http.StatusOK, map[string]any{"stopped": true})
}

func stringOf(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func msString(d time.Duration) string {
	return d.Round(time.Millisecond).String()
}

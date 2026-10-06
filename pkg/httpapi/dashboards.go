package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"time"
)

// dashboardStore is an in-memory store for dashboard definitions. A SQLite
// backend can replace it behind the same methods.
type dashboardStore struct {
	mu    sync.RWMutex
	items map[string]Dashboard
}

func newDashboardStore() *dashboardStore {
	return &dashboardStore{items: map[string]Dashboard{}}
}

func (d *dashboardStore) list() []Dashboard {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]Dashboard, 0, len(d.items))
	for _, v := range d.items {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out
}

func (d *dashboardStore) get(id string) (Dashboard, bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	v, ok := d.items[id]
	return v, ok
}

func (d *dashboardStore) put(v Dashboard) Dashboard {
	d.mu.Lock()
	defer d.mu.Unlock()
	v.UpdatedAt = time.Now().Unix()
	if v.ID == "" {
		v.ID = newID()
	}
	d.items[v.ID] = v
	return v
}

func (d *dashboardStore) delete(id string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	if _, ok := d.items[id]; !ok {
		return false
	}
	delete(d.items, id)
	return true
}

func (s *Server) handleDashboardsList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.dash.list())
}

func (s *Server) handleDashboardCreate(w http.ResponseWriter, r *http.Request) {
	var body Dashboard
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "name is required")
		return
	}
	saved := s.dash.put(body)
	writeJSON(w, http.StatusCreated, saved)
}

func (s *Server) handleDashboardGet(w http.ResponseWriter, r *http.Request) {
	v, ok := s.dash.get(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "no such dashboard")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Server) handleDashboardPut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok := s.dash.get(id); !ok {
		writeError(w, http.StatusNotFound, "not_found", "no such dashboard")
		return
	}
	var body Dashboard
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	body.ID = id
	writeJSON(w, http.StatusOK, s.dash.put(body))
}

func (s *Server) handleDashboardDelete(w http.ResponseWriter, r *http.Request) {
	if !s.dash.delete(r.PathValue("id")) {
		writeError(w, http.StatusNotFound, "not_found", "no such dashboard")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

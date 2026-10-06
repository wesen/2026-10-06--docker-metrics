package store

import "sync"

// Memory is an in-memory Store backed by per-container ring buffers.
type Memory struct {
	mu       sync.RWMutex
	capacity int
	entries  map[string]*entry
}

type entry struct {
	container Container
	ring      *ring
}

// NewMemory creates a store whose per-container ring buffers hold `capacity`
// samples each.
func NewMemory(capacity int) *Memory {
	return &Memory{capacity: capacity, entries: map[string]*entry{}}
}

func (m *Memory) UpsertContainer(c Container) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := Key(c.Host, c.Name)
	e, ok := m.entries[k]
	if !ok {
		e = &entry{ring: newRing(m.capacity)}
		m.entries[k] = e
	}
	e.container = c
}

func (m *Memory) RemoveContainer(host, name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.entries, Key(host, name))
}

func (m *Memory) Container(host, name string) (Container, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.entries[Key(host, name)]
	if !ok {
		return Container{}, false
	}
	return e.container, true
}

func (m *Memory) Containers() []Container {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Container, 0, len(m.entries))
	for _, e := range m.entries {
		out = append(out, e.container)
	}
	return out
}

func (m *Memory) Append(host, name string, s Sample) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := Key(host, name)
	e, ok := m.entries[k]
	if !ok {
		e = &entry{ring: newRing(m.capacity), container: Container{Host: host, Name: name}}
		m.entries[k] = e
	}
	e.ring.append(s)
}

func (m *Memory) Samples(host, name string, n int) []Sample {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.entries[Key(host, name)]
	if !ok {
		return nil
	}
	return e.ring.lastN(n)
}

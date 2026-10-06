package httpapi

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

// promRegistry accumulates the latest value of every series pushed through a
// prometheus() sink and renders the Prometheus text exposition format.
type promRegistry struct {
	mu     sync.Mutex
	values map[string]float64  // series key -> value
	lines  map[string][]string // metric name -> rendered lines
	names  []string            // metric names in first-seen order
}

func newPromRegistry() *promRegistry {
	return &promRegistry{values: map[string]float64{}, lines: map[string][]string{}}
}

func (p *promRegistry) ingest(opts, payload map[string]any) {
	prefix, _ := opts["prefix"].(string)
	series, _ := payload["series"].([]any)
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, raw := range series {
		m, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		name, _ := m["name"].(string)
		if name == "" {
			continue
		}
		v, ok := toFloat(m["v"])
		if !ok {
			continue
		}
		full := prefix + name
		labels, _ := m["labels"].(map[string]any)
		line := renderLine(full, labels, v)
		key := renderLine(full, labels, 0)
		if _, seen := p.values[key]; !seen {
			if _, has := p.lines[full]; !has {
				p.names = append(p.names, full)
			}
		}
		p.values[key] = v
		// Replace the existing line for this key.
		existing := p.lines[full]
		replaced := false
		for i, l := range existing {
			if seriesKey(l) == seriesKey(line) {
				existing[i] = line
				replaced = true
				break
			}
		}
		if !replaced {
			existing = append(existing, line)
		}
		p.lines[full] = existing
	}
}

func (p *promRegistry) render() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	var sb strings.Builder
	for _, name := range p.names {
		lines := p.lines[name]
		if len(lines) == 0 {
			continue
		}
		sort.Strings(lines)
		fmt.Fprintf(&sb, "# TYPE %s gauge\n", name)
		for _, l := range lines {
			sb.WriteString(l)
			sb.WriteByte('\n')
		}
	}
	return sb.String()
}

func renderLine(name string, labels map[string]any, v float64) string {
	if len(labels) == 0 {
		return fmt.Sprintf("%s %g", name, v)
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%q", k, fmt.Sprint(labels[k])))
	}
	return fmt.Sprintf("%s{%s} %g", name, strings.Join(parts, ","), v)
}

func seriesKey(line string) string {
	if i := strings.LastIndex(line, " "); i >= 0 {
		return line[:i]
	}
	return line
}

func toFloat(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	}
	return 0, false
}

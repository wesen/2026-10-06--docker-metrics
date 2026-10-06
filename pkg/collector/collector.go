// Package collector orchestrates polling of Docker hosts into the store.
package collector

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/go-go-golems/docker-metrics/pkg/docker"
	"github.com/go-go-golems/docker-metrics/pkg/store"
)

// Source is the subset of a Docker client the collector needs. It exists so
// tests can substitute a fake without a live daemon.
type Source interface {
	Name() string
	List(ctx context.Context) ([]docker.ListContainer, error)
	Stats(ctx context.Context, id string) (*docker.Stats, error)
	Events(ctx context.Context, since int64) (io.ReadCloser, error)
}

// Config controls the collector cadence and resource limits.
type Config struct {
	ListInterval  time.Duration
	StatsInterval time.Duration
	StatsTimeout  time.Duration
	Concurrency   int
}

// DefaultConfig returns sensible defaults (1s stats, 5s list, 16 concurrent).
//
// StatsTimeout is generous on purpose: the Docker daemon's `?stream=0` stats
// endpoint blocks for up to one sampling interval (about 1s) when it has no
// cached reading for a container, so a 2s budget is too tight on busy hosts.
func DefaultConfig() Config {
	return Config{
		ListInterval:  5 * time.Second,
		StatsInterval: 1 * time.Second,
		StatsTimeout:  5 * time.Second,
		Concurrency:   16,
	}
}

// Collector polls Docker hosts and writes samples to a store.
type Collector struct {
	store   store.Store
	sources []Source
	cfg     Config
	log     *slog.Logger
	onEvent func(docker.Event)
	now     func() int64

	mu   sync.Mutex
	prev map[string]*docker.Stats // key store.Key(host,name) -> previous raw stats
}

// New creates a collector. log may be nil.
func New(st store.Store, cfg Config, log *slog.Logger, sources ...Source) *Collector {
	if log == nil {
		log = slog.Default()
	}
	if cfg.Concurrency < 1 {
		cfg.Concurrency = 1
	}
	return &Collector{
		store:   st,
		sources: sources,
		cfg:     cfg,
		log:     log,
		now:     func() int64 { return time.Now().Unix() },
		prev:    map[string]*docker.Stats{},
	}
}

// OnEvent registers a callback for Docker daemon events.
func (c *Collector) OnEvent(fn func(docker.Event)) { c.onEvent = fn }

// SetClock overrides the sample timestamp source (tests).
func (c *Collector) SetClock(fn func() int64) { c.now = fn }

// Run polls until ctx is cancelled and returns ctx.Err().
func (c *Collector) Run(ctx context.Context) error {
	// Prime the store immediately so the UI has data as soon as it connects.
	c.Refresh(ctx)
	c.PollStats(ctx)

	var wg sync.WaitGroup
	for _, s := range c.sources {
		wg.Add(1)
		go func(s Source) { defer wg.Done(); c.eventsLoop(ctx, s) }(s)
	}
	wg.Add(1)
	go func() { defer wg.Done(); c.ticker(ctx, c.cfg.ListInterval, c.Refresh) }()
	wg.Add(1)
	go func() { defer wg.Done(); c.ticker(ctx, c.cfg.StatsInterval, c.PollStats) }()
	wg.Wait()
	return ctx.Err()
}

func (c *Collector) ticker(ctx context.Context, every time.Duration, fn func(context.Context)) {
	if every <= 0 {
		return
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			fn(ctx)
		}
	}
}

// Refresh reconciles the container list from every source into the store.
func (c *Collector) Refresh(ctx context.Context) {
	for _, s := range c.sources {
		list, err := s.List(ctx)
		if err != nil {
			c.log.Warn("docker list failed", "host", s.Name(), "err", err)
			continue
		}
		seen := map[string]bool{}
		for _, lc := range list {
			name := lc.Name()
			seen[name] = true
			c.store.UpsertContainer(store.Container{
				Name:     name,
				ID:       lc.ID,
				Host:     s.Name(),
				Image:    lc.Image,
				Labels:   lc.Labels,
				State:    lc.State,
				Restarts: lc.RestartCnt,
			})
		}
		// Drop containers that disappeared from this host.
		for _, existing := range c.store.Containers() {
			if existing.Host != s.Name() {
				continue
			}
			if !seen[existing.Name] {
				c.store.RemoveContainer(existing.Host, existing.Name)
			}
		}
	}
}

// PollStats takes one stats reading for every running container.
func (c *Collector) PollStats(ctx context.Context) {
	containers := c.store.Containers()
	sem := make(chan struct{}, c.cfg.Concurrency)
	var wg sync.WaitGroup
	for _, ct := range containers {
		if ct.State != "running" {
			continue
		}
		src := c.sourceFor(ct.Host)
		if src == nil {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(ct store.Container, src Source) {
			defer wg.Done()
			defer func() { <-sem }()
			c.pollOne(ctx, src, ct)
		}(ct, src)
	}
	wg.Wait()
}

func (c *Collector) pollOne(ctx context.Context, src Source, ct store.Container) {
	pctx, cancel := context.WithTimeout(ctx, c.cfg.StatsTimeout)
	defer cancel()
	raw, err := src.Stats(pctx, ct.ID)
	if err != nil {
		var apiErr *docker.APIError
		if errors.As(err, &apiErr) && apiErr.Status == 404 {
			// Container vanished; the next Refresh will drop it.
			return
		}
		c.log.Warn("docker stats failed", "host", ct.Host, "container", ct.Name, "err", err)
		return
	}
	k := store.Key(ct.Host, ct.Name)
	c.mu.Lock()
	prev := c.prev[k]
	c.prev[k] = raw
	c.mu.Unlock()

	samples := c.store.Samples(ct.Host, ct.Name, 1)
	var prevSample *store.Sample
	if len(samples) > 0 {
		prevSample = &samples[len(samples)-1]
	}
	c.store.Append(ct.Host, ct.Name, docker.Normalize(prev, raw, prevSample, c.now()))
}

func (c *Collector) sourceFor(host string) Source {
	for _, s := range c.sources {
		if s.Name() == host {
			return s
		}
	}
	return nil
}

// PollOnce performs a list refresh plus two stats rounds so CPU is valid. The
// gap between rounds is a full sampling interval so the daemon produces a
// non-zero system-CPU delta.
func (c *Collector) PollOnce(ctx context.Context) {
	c.Refresh(ctx)
	c.PollStats(ctx)
	select {
	case <-ctx.Done():
		return
	case <-time.After(time.Second):
	}
	c.PollStats(ctx)
}

func (c *Collector) eventsLoop(ctx context.Context, s Source) {
	backoff := time.Second
	for ctx.Err() == nil {
		if err := c.consumeEvents(ctx, s); err != nil && ctx.Err() == nil {
			c.log.Warn("docker events stream ended", "host", s.Name(), "err", err, "retryIn", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
	}
}

func (c *Collector) consumeEvents(ctx context.Context, s Source) error {
	body, err := s.Events(ctx, 0)
	if err != nil {
		return err
	}
	defer body.Close()
	sc := bufio.NewScanner(body)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var ev docker.Event
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			continue
		}
		c.handleEvent(ev)
	}
	return sc.Err()
}

func (c *Collector) handleEvent(ev docker.Event) {
	if ev.Type != "container" {
		return
	}
	name := ev.Actor.Attributes["name"]
	host := c.sourceNameForID(ev.Actor.ID)
	if name == "" || host == "" {
		return
	}
	if ct, ok := c.store.Container(host, name); ok {
		switch ev.Action {
		case "start", "die", "restart", "destroy", "pause", "unpause":
			ct.State = stateForAction(ev.Action, ct.State)
			if ev.Action == "restart" {
				ct.Restarts++
			}
			c.store.UpsertContainer(ct)
		}
	}
	if c.onEvent != nil {
		c.onEvent(ev)
	}
}

func (c *Collector) sourceNameForID(id string) string {
	for _, ct := range c.store.Containers() {
		if ct.ID == id {
			return ct.Host
		}
	}
	// Fall back to the single source if there is only one.
	if len(c.sources) == 1 {
		return c.sources[0].Name()
	}
	return ""
}

func stateForAction(action, current string) string {
	switch action {
	case "start":
		return "running"
	case "die":
		return "exited"
	case "restart":
		return "running"
	case "destroy":
		return "removed"
	case "pause":
		return "paused"
	case "unpause":
		return "running"
	}
	return current
}

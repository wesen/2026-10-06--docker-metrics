package runtime

import (
	"context"
	_ "embed"
	"fmt"
	"time"

	"github.com/dop251/goja"
	"github.com/go-go-golems/docker-metrics/pkg/store"
	"github.com/go-go-golems/go-go-goja/pkg/engine"
)

//go:embed prelude/engine.js
var preludeJS string

// Manager creates dashboard sessions over a shared store.
type Manager struct {
	st store.Store
}

// NewManager returns a manager backed by st.
func NewManager(st store.Store) *Manager { return &Manager{st: st} }

// Session is one goja runtime with the prelude evaluated and the
// `dockermetrics` module registered.
type Session struct {
	rt    *engine.Runtime
	state *moduleState
	opts  Options
}

// NewSession builds a runtime, registers the native module, applies the
// sandbox middleware and evaluates the prelude. Close it when done.
func (m *Manager) NewSession(ctx context.Context, opts Options) (*Session, error) {
	if opts.TickInterval <= 0 {
		opts.TickInterval = 500 * time.Millisecond
	}
	state := &moduleState{opts: opts}
	reg := registrar{st: m.st, state: state}

	factory, err := engine.NewRuntimeFactoryBuilder().
		WithModules(reg).
		UseModuleMiddleware(engine.MiddlewareOnly("dockermetrics")).
		Build()
	if err != nil {
		return nil, fmt.Errorf("build runtime factory: %w", err)
	}
	rt, err := factory.NewRuntime(
		engine.WithStartupContext(ctx),
		engine.WithLifetimeContext(ctx),
	)
	if err != nil {
		return nil, fmt.Errorf("create runtime: %w", err)
	}
	state.owner = rt.Owner
	state.vm = rt.VM

	if _, err := rt.Owner.Call(ctx, "prelude", func(_ context.Context, vm *goja.Runtime) (any, error) {
		_, err := vm.RunString(preludeJS)
		return nil, err
	}); err != nil {
		_ = rt.Close(ctx)
		return nil, fmt.Errorf("evaluate prelude: %w", err)
	}
	return &Session{rt: rt, state: state, opts: opts}, nil
}

// VM exposes the underlying goja runtime (advanced use and tests).
func (s *Session) VM() *goja.Runtime { return s.rt.VM }

// Compile validates source without executing it. The source is wrapped in an
// async function because dashboards use top-level await.
func (s *Session) Compile(ctx context.Context, name, source string) error {
	wrapped := "(async () => {\n" + source + "\n})().then(()=>{},()=>{});\n"
	_, err := s.rt.Owner.Call(ctx, "compile", func(_ context.Context, _ *goja.Runtime) (any, error) {
		_, err := goja.Compile(name, wrapped, false)
		return nil, err
	})
	return err
}

// RunSource executes a dashboard. It returns when the top-level async function
// settles, when the script raises, or when ctx is cancelled. Streams and
// watchers registered by the script keep running until Tick/Close.
func (s *Session) RunSource(ctx context.Context, source string) error {
	s.state.done = make(chan error, 1)
	wrapped := "(async () => {\n" + source + "\n})().then(" +
		"() => __dmFinish(\"\"), " +
		"(e) => __dmFinish(String((e && (e.stack || e.message)) || e)));\nundefined;\n"
	if _, err := s.rt.Owner.Call(ctx, "run", func(_ context.Context, vm *goja.Runtime) (any, error) {
		_, err := vm.RunString(wrapped)
		return nil, err
	}); err != nil {
		return err
	}
	select {
	case err := <-s.state.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Tick runs one evaluation of every active stream and watcher.
func (s *Session) Tick(ctx context.Context) error {
	_, err := s.rt.Owner.Call(ctx, "tick", func(_ context.Context, vm *goja.Runtime) (any, error) {
		_, err := vm.RunString("__tick()")
		return nil, err
	})
	return err
}

// HasItems reports whether any stream or watcher is still registered.
func (s *Session) HasItems(ctx context.Context) bool {
	v, err := s.rt.Owner.Call(ctx, "hasItems", func(_ context.Context, vm *goja.Runtime) (any, error) {
		res, err := vm.RunString("__hasItems()")
		if err != nil {
			return nil, err
		}
		return res.ToBoolean(), nil
	})
	if err != nil || v == nil {
		return false
	}
	b, ok := v.(bool)
	return ok && b
}

// StartTicker drives Tick at the configured interval until ctx is cancelled.
func (s *Session) StartTicker(ctx context.Context) {
	go func() {
		t := time.NewTicker(s.opts.TickInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				_ = s.Tick(ctx)
			}
		}
	}()
}

// StopAll unregisters streams and watchers.
func (s *Session) StopAll(ctx context.Context) {
	_, _ = s.rt.Owner.Call(ctx, "stopAll", func(_ context.Context, vm *goja.Runtime) (any, error) {
		_, err := vm.RunString("__stopAll()")
		return nil, err
	})
}

// Close releases the runtime.
func (s *Session) Close(ctx context.Context) error { return s.rt.Close(ctx) }

// Package runtime embeds a go-go-goja JavaScript runtime that evaluates
// docker-metrics dashboards. The DSL itself lives in prelude/engine.js; Go
// provides only the data leaves through the `dockermetrics` native module.
package runtime

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
	"github.com/go-go-golems/docker-metrics/pkg/store"
	"github.com/go-go-golems/go-go-goja/pkg/engine"
	"github.com/go-go-golems/go-go-goja/pkg/runtimeowner"
)

// Options tunes one dashboard session. All callbacks are optional.
type Options struct {
	// Log receives console output (level: log|info|warn|error|table).
	Log func(level, text string)
	// Sink receives flattened sink payloads (kind: prometheus|statsd|file).
	Sink func(kind string, opts map[string]any, payload map[string]any)
	// Event receives emitted rule/daemon events.
	Event func(name string, payload map[string]any)
	// Action receives container mutations (restart|stop|start).
	Action func(action string, names []string, opts map[string]any)
	// Publish forwards a streamed frame to a WebSocket topic.
	Publish func(topic string, frame map[string]any)
	// AllowMutations gates restart/stop/start.
	AllowMutations bool
	// TickInterval drives streams and watchers. Defaults to 500ms.
	TickInterval time.Duration
}

type moduleState struct {
	opts  Options
	done  chan error
	owner runtimeowner.RuntimeOwner
	vm    *goja.Runtime
}

type registrar struct {
	st    store.Store
	state *moduleState
}

func (r registrar) ID() string { return "dockermetrics" }

func (r registrar) RegisterRuntimeModule(ctx *engine.RuntimeModuleRegistrationContext, reg *require.Registry) error {
	reg.RegisterNativeModule("dockermetrics", r.loader(ctx))
	return nil
}

func (r registrar) loader(ctx *engine.RuntimeModuleRegistrationContext) require.ModuleLoader {
	return func(vm *goja.Runtime, moduleObj *goja.Object) {
		exports := moduleObj.Get("exports").(*goja.Object)
		st := r.st
		state := r.state

		exports.Set("now", func() int64 { return time.Now().Unix() })
		exports.Set("maxSamples", func() int { return 3600 })

		exports.Set("containers", func(host string) []map[string]any {
			var out []map[string]any
			for _, c := range st.Containers() {
				if host != "" && c.Host != host {
					continue
				}
				var last *store.Sample
				if s := st.Samples(c.Host, c.Name, 1); len(s) > 0 {
					last = &s[len(s)-1]
				}
				m := map[string]any{
					"name":      c.Name,
					"id":        c.ID,
					"host":      c.Host,
					"image":     c.Image,
					"state":     c.State,
					"restarts":  c.Restarts,
					"labels":    labelsOrEmpty(c.Labels),
					"limit":     0,
					"pidsLimit": 0,
				}
				if last != nil {
					m["limit"] = last.Limit
					m["pidsLimit"] = last.PIDsLimit
				}
				out = append(out, m)
			}
			sort.Slice(out, func(i, j int) bool {
				if out[i]["host"] != out[j]["host"] {
					return out[i]["host"].(string) < out[j]["host"].(string)
				}
				return out[i]["name"].(string) < out[j]["name"].(string)
			})
			return out
		})

		exports.Set("samples", func(host, name string, n int) []map[string]any {
			s := st.Samples(host, name, n)
			out := make([]map[string]any, 0, len(s))
			for _, x := range s {
				out = append(out, map[string]any{
					"t": x.T, "cpu": x.CPU, "mem": x.Mem, "limit": x.Limit,
					"rx": x.Rx, "tx": x.Tx, "ior": x.IoR, "iow": x.IoW,
					"pids": x.PIDs, "pidsLimit": x.PIDsLimit, "cpuValid": x.CPUValid,
				})
			}
			return out
		})

		exports.Set("log", func(level, text string) {
			if state.opts.Log != nil {
				state.opts.Log(level, text)
			}
		})
		exports.Set("clearLog", func() {
			if state.opts.Log != nil {
				state.opts.Log("clear", "")
			}
		})
		exports.Set("sink", func(call goja.FunctionCall) goja.Value {
			kind := call.Argument(0).String()
			opts := exportMap(call.Argument(1))
			payload := exportMap(call.Argument(2))
			if state.opts.Sink != nil {
				state.opts.Sink(kind, opts, payload)
			}
			return goja.Undefined()
		})
		exports.Set("emitEvent", func(name string, payload goja.Value) {
			if state.opts.Event != nil {
				state.opts.Event(name, exportMap(payload))
				return
			}
		})
		exports.Set("action", func(action string, names []string, opts goja.Value) {
			if state.opts.Action != nil && state.opts.AllowMutations {
				state.opts.Action(action, names, exportMap(opts))
			}
		})
		exports.Set("publish", func(topic string, frame goja.Value) {
			if state.opts.Publish != nil {
				state.opts.Publish(topic, exportMap(frame))
			}
		})
		exports.Set("_finish", func(errMsg string) {
			var err error
			if errMsg != "" {
				err = fmt.Errorf("%s", errMsg)
			}
			select {
			case state.done <- err:
			default:
			}
		})

		// after(ms) resolves a promise after a delay using the event loop.
		exports.Set("after", func(call goja.FunctionCall) goja.Value {
			ms := call.Argument(0).ToInteger()
			p, resolve, reject := vm.NewPromise()
			go func() {
				t := time.NewTimer(time.Duration(ms) * time.Millisecond)
				defer t.Stop()
				<-t.C
				if state.owner == nil {
					return
				}
				_ = state.owner.Post(context.Background(), "after", func(_ context.Context, _ *goja.Runtime) {
					_ = resolve(goja.Undefined())
				})
				_ = reject
			}()
			return vm.ToValue(p)
		})
	}
}

func labelsOrEmpty(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

func exportMap(v goja.Value) map[string]any {
	if v == nil || goja.IsUndefined(v) || goja.IsNull(v) {
		return map[string]any{}
	}
	if m, ok := v.Export().(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

package store

// Sample is one normalized reading of one container at one instant.
//
// Units are deliberate and documented because mixing conventions is the most
// common bug in this system:
//
//   - CPU is a fraction of ONE core. 1.0 means one full core; 4.0 means four
//     full cores on a multi-core host. This matches the prototype's `cpu`.
//   - Mem and Limit are bytes (working set and memory limit).
//   - Rx, Tx, IoR, IoW are CUMULATIVE counters (bytes). Rates are derived by
//     the DSL `rate(...)` op.
//   - PIDs is the process count; PIDsLimit its cap (0 when unknown).
type Sample struct {
	T         int64   `json:"t"`
	CPU       float64 `json:"cpu"`
	Mem       uint64  `json:"mem"`
	Limit     uint64  `json:"limit"`
	Rx        uint64  `json:"rx"`
	Tx        uint64  `json:"tx"`
	IoR       uint64  `json:"ior"`
	IoW       uint64  `json:"iow"`
	PIDs      int     `json:"pids"`
	PIDsLimit int     `json:"pidsLimit"`
	// CPUValid is false on the first sample after a restart or a daemon
	// restart, when there is no previous counter to diff against.
	CPUValid bool `json:"cpuValid"`
}

// Container is the metadata half of a container the collector tracks.
type Container struct {
	Name      string            `json:"name"`
	ID        string            `json:"id"`
	Host      string            `json:"host"`
	Image     string            `json:"image"`
	Labels    map[string]string `json:"labels"`
	State     string            `json:"state"`
	Restarts  int               `json:"restarts"`
	PIDsLimit int               `json:"pidsLimit"`
}

// Key returns the storage key for a container identity. Container names are
// unique per host, not globally, so the host is part of the key.
func Key(host, name string) string { return host + "/" + name }

// Store is the read side of the sample buffer used by the compute plane.
type Store interface {
	UpsertContainer(c Container)
	RemoveContainer(host, name string)
	Container(host, name string) (Container, bool)
	Containers() []Container
	Append(host, name string, s Sample)
	Samples(host, name string, n int) []Sample
}

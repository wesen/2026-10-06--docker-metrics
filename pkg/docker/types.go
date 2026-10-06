package docker

// ListContainer is one entry of GET /containers/json.
type ListContainer struct {
	ID         string            `json:"Id"`
	Names      []string          `json:"Names"`
	Image      string            `json:"Image"`
	ImageID    string            `json:"ImageID"`
	State      string            `json:"State"`
	Status     string            `json:"Status"`
	Labels     map[string]string `json:"Labels"`
	RestartCnt int               `json:"RestartCount"`
}

// Name returns the Docker name with the leading slash removed.
func (c ListContainer) Name() string {
	if len(c.Names) == 0 {
		if len(c.ID) >= 12 {
			return c.ID[:12]
		}
		return c.ID
	}
	n := c.Names[0]
	if len(n) > 0 && n[0] == '/' {
		n = n[1:]
	}
	return n
}

// Stats is GET /containers/{id}/stats?stream=0.
type Stats struct {
	Read        string             `json:"read"`
	PreCPUStats CPUStats           `json:"precpu_stats"`
	CPUStats    CPUStats           `json:"cpu_stats"`
	MemoryStats MemoryStats        `json:"memory_stats"`
	Networks    map[string]NetStat `json:"networks"`
	BlkioStats  BlkioStats         `json:"blkio_stats"`
	PIDsStats   PIDsStats          `json:"pids_stats"`
}

type CPUStats struct {
	CPUUsage       CPUUsage `json:"cpu_usage"`
	SystemCPUUsage uint64   `json:"system_cpu_usage"`
	OnlineCPUs     uint32   `json:"online_cpus"`
}

type CPUUsage struct {
	TotalUsage  uint64   `json:"total_usage"`
	PercpuUsage []uint64 `json:"percpu_usage"`
}

type MemoryStats struct {
	Usage uint64            `json:"usage"`
	Limit uint64            `json:"limit"`
	Stats map[string]uint64 `json:"stats"`
}

type NetStat struct {
	RxBytes uint64 `json:"rx_bytes"`
	TxBytes uint64 `json:"tx_bytes"`
}

type BlkioStats struct {
	IOServiceBytesRecursive []BlkioEntry `json:"io_service_bytes_recursive"`
}

type BlkioEntry struct {
	Op    string `json:"op"`
	Value uint64 `json:"value"`
}

type PIDsStats struct {
	Current uint64 `json:"current"`
	Limit   uint64 `json:"limit"`
}

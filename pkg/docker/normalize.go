package docker

import (
	"strings"

	"github.com/go-go-golems/docker-metrics/pkg/store"
)

// Normalize converts a raw Docker stats payload into a store.Sample.
//
// prevRaw is the immediately preceding raw payload for the same container (nil
// on the first sample); prevSample is the last stored sample (nil on the
// first). The returned Sample has CPU expressed as a fraction of ONE core.
func Normalize(prevRaw *Stats, cur *Stats, prevSample *store.Sample, t int64) store.Sample {
	s := store.Sample{T: t}

	// CPU: fraction of one core = (cpuDelta / systemDelta) * onlineCPUs.
	if cpu, ok := CPUFraction(prevRaw, cur); ok {
		s.CPU = cpu
		s.CPUValid = true
	} else if prevSample != nil {
		s.CPU = prevSample.CPU
		s.CPUValid = prevSample.CPUValid
	}

	s.Mem = WorkingSet(cur.MemoryStats)
	s.Limit = cur.MemoryStats.Limit
	s.Rx = sumNet(cur, true)
	s.Tx = sumNet(cur, false)
	s.IoR, s.IoW = sumBlkio(cur)
	s.PIDs = int(cur.PIDsStats.Current)
	s.PIDsLimit = int(cur.PIDsStats.Limit)

	// Reset detection: cumulative counters must not go backwards. A decrease
	// means the container restarted (new network namespace / cgroup). Report
	// the new baseline and zero the rate-relevant history by keeping the raw
	// counter (the DSL's rate op will see a drop; document that consumers
	// should treat a negative delta as a reset).
	if prevSample != nil {
		if s.Rx < prevSample.Rx {
			s.Rx = prevSample.Rx
		}
		if s.Tx < prevSample.Tx {
			s.Tx = prevSample.Tx
		}
		if s.IoR < prevSample.IoR {
			s.IoR = prevSample.IoR
		}
		if s.IoW < prevSample.IoW {
			s.IoW = prevSample.IoW
		}
	}
	return s
}

// CPUFraction returns the CPU usage as a fraction of one core and whether it
// could be computed (both payloads present and a positive system delta).
func CPUFraction(prev, cur *Stats) (float64, bool) {
	if prev == nil || cur == nil {
		return 0, false
	}
	cpuDelta := float64(cur.CPUStats.CPUUsage.TotalUsage) - float64(prev.CPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(cur.CPUStats.SystemCPUUsage) - float64(prev.CPUStats.SystemCPUUsage)
	if sysDelta <= 0 || cpuDelta < 0 {
		return 0, false
	}
	online := onlineCPUs(cur)
	if online <= 0 {
		online = 1
	}
	return (cpuDelta / sysDelta) * online, true
}

func onlineCPUs(s *Stats) float64 {
	if s.CPUStats.OnlineCPUs > 0 {
		return float64(s.CPUStats.OnlineCPUs)
	}
	if n := len(s.CPUStats.CPUUsage.PercpuUsage); n > 0 {
		return float64(n)
	}
	return 1
}

// WorkingSet subtracts the reclaimable inactive file cache from usage. It tries
// the cgroup v1 key (total_inactive_file) first and falls back to the cgroup v2
// key (inactive_file).
func WorkingSet(m MemoryStats) uint64 {
	cache := m.Stats["total_inactive_file"]
	if cache == 0 {
		cache = m.Stats["inactive_file"]
	}
	if m.Usage <= cache {
		return 0
	}
	return m.Usage - cache
}

func sumNet(s *Stats, rx bool) uint64 {
	var total uint64
	for _, n := range s.Networks {
		if rx {
			total += n.RxBytes
		} else {
			total += n.TxBytes
		}
	}
	return total
}

func sumBlkio(s *Stats) (read, write uint64) {
	for _, e := range s.BlkioStats.IOServiceBytesRecursive {
		switch strings.ToLower(e.Op) {
		case "read":
			read += e.Value
		case "write":
			write += e.Value
		}
	}
	return read, write
}

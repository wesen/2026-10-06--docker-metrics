package docker

import (
	"math"
	"testing"

	"github.com/go-go-golems/docker-metrics/pkg/store"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func sampleStats(total, sys uint64, online uint32) *Stats {
	return &Stats{CPUStats: CPUStats{CPUUsage: CPUUsage{TotalUsage: total}, SystemCPUUsage: sys, OnlineCPUs: online}}
}

func TestCPUFractionIsFractionOfOneCore(t *testing.T) {
	// Container used 1/8 of the host CPU time over the interval on an 8-core
	// host: it saturated exactly one core, so the fraction is 1.0.
	prev := sampleStats(1000, 10000, 8)
	cur := sampleStats(2000, 20000, 8)
	got, ok := CPUFraction(prev, cur)
	if !ok {
		t.Fatal("expected a valid CPU fraction")
	}
	if !approx(got, 0.8*8/8*1.0) && !approx(got, 0.8) {
		// cd/sd = 0.1, *8 = 0.8
		t.Fatalf("got %v, want 0.8", got)
	}
}

func TestCPUFractionNilPrev(t *testing.T) {
	if _, ok := CPUFraction(nil, sampleStats(1, 2, 1)); ok {
		t.Fatal("nil prev must not produce a valid fraction")
	}
}

func TestCPUFractionZeroSystemDelta(t *testing.T) {
	prev := sampleStats(1000, 10000, 4)
	cur := sampleStats(1100, 10000, 4)
	if _, ok := CPUFraction(prev, cur); ok {
		t.Fatal("zero system delta must not produce a valid fraction")
	}
}

func TestWorkingSetSubtractsCache(t *testing.T) {
	m := MemoryStats{Usage: 1000, Limit: 2000, Stats: map[string]uint64{"total_inactive_file": 200}}
	if got := WorkingSet(m); got != 800 {
		t.Fatalf("cgroup v1 working set = %d, want 800", got)
	}
	m2 := MemoryStats{Usage: 1000, Limit: 2000, Stats: map[string]uint64{"inactive_file": 100}}
	if got := WorkingSet(m2); got != 900 {
		t.Fatalf("cgroup v2 working set = %d, want 900", got)
	}
	m3 := MemoryStats{Usage: 100, Stats: map[string]uint64{"total_inactive_file": 500}}
	if got := WorkingSet(m3); got != 0 {
		t.Fatalf("working set underflow = %d, want 0", got)
	}
}

func TestSumNetAndBlkio(t *testing.T) {
	s := &Stats{
		Networks: map[string]NetStat{"eth0": {RxBytes: 10, TxBytes: 20}, "eth1": {RxBytes: 5, TxBytes: 7}},
		BlkioStats: BlkioStats{IOServiceBytesRecursive: []BlkioEntry{
			{Op: "read", Value: 100}, {Op: "write", Value: 200}, {Op: "sync", Value: 999},
		}},
	}
	if got := sumNet(s, true); got != 15 {
		t.Fatalf("rx = %d, want 15", got)
	}
	if got := sumNet(s, false); got != 27 {
		t.Fatalf("tx = %d, want 27", got)
	}
	r, w := sumBlkio(s)
	if r != 100 || w != 200 {
		t.Fatalf("blkio = %d/%d, want 100/200", r, w)
	}
}

func TestNormalizeFirstSample(t *testing.T) {
	cur := &Stats{
		MemoryStats: MemoryStats{Usage: 1000, Limit: 4096},
		Networks:    map[string]NetStat{"eth0": {RxBytes: 1, TxBytes: 2}},
		PIDsStats:   PIDsStats{Current: 5, Limit: 100},
	}
	s := Normalize(nil, cur, nil, 1770000000)
	if s.CPUValid {
		t.Fatal("first sample must not have valid CPU")
	}
	if s.Mem != 1000 || s.Limit != 4096 || s.Rx != 1 || s.Tx != 2 || s.PIDs != 5 {
		t.Fatalf("unexpected first sample: %+v", s)
	}
}

func TestNormalizeKeepsCountersMonotonicOnReset(t *testing.T) {
	prevSample := &store.Sample{Rx: 100, Tx: 200, IoR: 50, IoW: 60}
	cur := &Stats{Networks: map[string]NetStat{"eth0": {RxBytes: 5, TxBytes: 7}}, BlkioStats: BlkioStats{IOServiceBytesRecursive: []BlkioEntry{{Op: "read", Value: 1}, {Op: "write", Value: 2}}}}
	s := Normalize(nil, cur, prevSample, 1770000001)
	if s.Rx != 100 || s.Tx != 200 || s.IoR != 50 || s.IoW != 60 {
		t.Fatalf("counters went backwards on reset: %+v", s)
	}
}

package store

// ring is a fixed-capacity circular buffer of Samples. It never allocates after
// construction, so a long-running daemon's memory is bounded by
// capacity * containers.
type ring struct {
	buf   []Sample
	start int // index of the oldest element
	n     int // number of valid elements
}

func newRing(capacity int) *ring {
	if capacity < 1 {
		capacity = 1
	}
	return &ring{buf: make([]Sample, capacity)}
}

func (r *ring) append(s Sample) {
	if r.n < len(r.buf) {
		r.buf[(r.start+r.n)%len(r.buf)] = s
		r.n++
		return
	}
	r.buf[r.start] = s
	r.start = (r.start + 1) % len(r.buf)
}

func (r *ring) len() int { return r.n }

// lastN returns up to n most recent samples, oldest first. The returned slice is
// a copy and is safe to keep.
func (r *ring) lastN(n int) []Sample {
	if n <= 0 || r.n == 0 {
		return nil
	}
	if n > r.n {
		n = r.n
	}
	out := make([]Sample, n)
	off := r.n - n
	for i := 0; i < n; i++ {
		out[i] = r.buf[(r.start+off+i)%len(r.buf)]
	}
	return out
}

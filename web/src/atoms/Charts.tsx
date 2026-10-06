const lvl = (v: number) => (v > 0.85 ? "var(--bad)" : v > 0.6 ? "var(--warn)" : "var(--ok)");

/** StatBar is the labelled percentage track from the prototype's fleet cards. */
export function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar">
      <span className="bl">{label}</span>
      <span className="track">
        <i style={{ width: Math.min(100, v * 100) + "%", background: lvl(v) }} />
      </span>
      <span className="bv">{(v * 100).toFixed(0)}%</span>
    </div>
  );
}

/** Spark renders a tiny sparkline from a numeric series. */
export function Spark({ values, color }: { values: number[]; color: string }) {
  const a = values.slice(-90);
  const n = a.length;
  if (n < 2) return null;
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const pts = a.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(22 - (hi === lo ? 0 : (v - lo) / (hi - lo)) * 20).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

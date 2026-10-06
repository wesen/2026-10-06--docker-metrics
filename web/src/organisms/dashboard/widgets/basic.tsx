import { stc, fv } from "../format";

/** Inline sparkline / area used by stat and sparks widgets. */
export function Line({ pts, color, w, hgt, fill }: { pts: number[]; color: string; w: number; hgt: number; fill?: boolean }) {
  const v = pts.filter((x) => x != null && isFinite(x));
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const r = hi - lo || 1;
  const n = pts.length;
  const P = pts
    .map((x, i) => (x == null ? null : ([(i / (n - 1)) * w, hgt - 2 - ((x - lo) / r) * (hgt - 4)] as [number, number])))
    .filter(Boolean) as [number, number][];
  const d = P.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return (
    <svg viewBox={`0 0 ${w} ${hgt}`} preserveAspectRatio="none" className="wspark">
      {fill && <path d={d + `L${w} ${hgt}L0 ${hgt}Z`} fill={color} opacity={0.15} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function WStat({ d, o }: { d: any; o: any }) {
  const c = stc(d.state);
  return (
    <div className="w-stat">
      <div className="big" style={{ color: d.state === "ok" ? "var(--fg)" : c }}>
        {fv(d.value, o)}
      </div>
      {d.delta != null && (
        <div className="delta" style={{ color: Math.abs(d.delta) < 2 ? "var(--mut)" : d.delta > 0 ? "var(--warn)" : "var(--a)" }}>
          {(d.delta > 0 ? "▲ " : "▼ ") + Math.abs(d.delta).toFixed(1) + "% over range"}
        </div>
      )}
      <Line pts={d.series ?? []} color={c} w={120} hgt={34} fill />
    </div>
  );
}

export function WGauge({ d, o }: { d: any; o: any }) {
  const f = d.value == null ? 0 : Math.max(0, Math.min(1, (d.value - d.min) / (d.max - d.min || 1)));
  const cx = 70;
  const cy = 66;
  const r = 52;
  const a = Math.PI + f * Math.PI;
  const ex = cx + r * Math.cos(a);
  const ey = cy + r * Math.sin(a);
  return (
    <svg viewBox="0 0 140 84" className="wgauge" role="img" aria-label={"gauge " + fv(d.value, o)}>
      <path d={`M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--panel2)" strokeWidth={12} strokeLinecap="round" />
      {f > 0 && (
        <path d={`M${cx - r} ${cy}A${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke={stc(d.state)} strokeWidth={12} strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" className="gv">
        {fv(d.value, o)}
      </text>
      <text x={cx - r} y={cy + 14} textAnchor="middle" className="ax">
        {d.min}
      </text>
      <text x={cx + r} y={cy + 14} textAnchor="middle" className="ax">
        {d.max}
      </text>
    </svg>
  );
}

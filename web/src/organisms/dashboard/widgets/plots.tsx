import { COLORS, fnum, fv, niceMax, timeStr } from "../format";

export function Plot({ d, o, area }: { d: any; o: any; area?: boolean }) {
  const W = 440;
  const H = 180;
  const L = 40;
  const R = 6;
  const T = 8;
  const B = 20;
  const stack = area && o.stack;
  let S: { name: string; c: string; pts: any[] }[] = d.series
    .map((s: any, i: number) => ({ name: s.name, c: COLORS[i % COLORS.length], pts: s.pts.filter((p: any) => p.v != null) }))
    .filter((s: any) => s.pts.length);
  if (!S.length) return <div className="empty sm">No data in range</div>;
  if (stack) {
    const ts = [...new Set(S.flatMap((s) => s.pts.map((p) => p.t)))].sort((a, b) => (a as number) - (b as number)) as number[];
    const ms = S.map((s) => new Map(s.pts.map((p) => [p.t, p.v])));
    const acc = ts.map(() => 0);
    S = S.map((s, i) => {
      const lo = acc.slice();
      return Object.assign({}, s, { pts: ts.map((t, j) => ({ t, v: (acc[j] += ms[i].get(t) || 0), lo: lo[j] })) });
    });
  }
  const ymax = niceMax(Math.max(1e-9, o.max != null ? o.max : 0, ...S.flatMap((s) => s.pts.map((p) => p.v))) * (o.max != null ? 1 : 1.08));
  const X = (t: number) => L + ((t - d.t0) / (d.t1 - d.t0)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / ymax) * (H - T - B);
  const tk = [0, 0.5, 1].map((f) => f * ymax);
  const path = (s: any) => s.pts.map((p: any, i: number) => (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1)).join("");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wplot">
        {tk.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid-l" />
            <text x={L - 5} y={Y(v) + 4} textAnchor="end" className="ax">
              {fnum(v)}
            </text>
          </g>
        ))}
        {[0, 1].map((i) => (
          <text key={"x" + i} x={i ? W - R : L} y={H - 5} textAnchor={i ? "end" : "start"} className="ax">
            {timeStr(Math.round(i ? d.t1 : d.t0)).slice(0, 5)}
          </text>
        ))}
        {S.slice()
          .reverse()
          .map((s) => (
            <g key={s.name}>
              {area && (
                <path
                  d={stack ? path(s) + s.pts.slice().reverse().map((p: any) => "L" + X(p.t).toFixed(1) + " " + Y(p.lo).toFixed(1)).join("") + "Z" : path(s) + "L" + X(s.pts[s.pts.length - 1].t) + " " + Y(0) + "L" + X(s.pts[0].t) + " " + Y(0) + "Z"}
                  fill={s.c}
                  opacity={stack ? 0.55 : 0.18}
                />
              )}
              <path d={path(s)} fill="none" stroke={s.c} strokeWidth={1.6} strokeLinejoin="round" />
            </g>
          ))}
      </svg>
      {o.legend !== false && S.length > 1 && (
        <div className="wleg">
          {S.slice(0, 8).map((s) => (
            <span key={s.name}>
              <i style={{ background: s.c }} />
              {s.name}
            </span>
          ))}
          {S.length > 8 && <span>+{S.length - 8}</span>}
        </div>
      )}
    </div>
  );
}

export function AreaPlot({ d, o }: { d: any; o: any }) {
  return <Plot d={d} o={o} area />;
}

export function WBar({ d, o }: { d: any; o: any }) {
  const W = 440;
  const H = 170;
  const L = 40;
  const B = 34;
  const T = 8;
  const n = d.labels.length;
  const k = d.series.length;
  const ymax = niceMax(Math.max(1e-9, ...d.series.flatMap((s: any) => s.values.filter((v: any) => v != null))) * 1.08);
  const Y = (v: number) => T + (1 - v / ymax) * (H - T - B);
  const bw = (W - L - 6) / Math.max(1, n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wplot">
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line x1={L} x2={W - 6} y1={Y(f * ymax)} y2={Y(f * ymax)} className="grid-l" />
          <text x={L - 5} y={Y(f * ymax) + 4} textAnchor="end" className="ax">
            {fnum(f * ymax)}
          </text>
        </g>
      ))}
      {d.labels.map((l: string, i: number) => (
        <g key={l}>
          {d.series.map((s: any, j: number) =>
            s.values[i] == null ? null : (
              <rect
                key={j}
                x={L + i * bw + bw * 0.12 + j * ((bw * 0.76) / k)}
                width={Math.max(1, (bw * 0.76) / k - 1)}
                y={Y(s.values[i])}
                height={Math.max(0, Y(0) - Y(s.values[i]))}
                fill={COLORS[(k > 1 ? j : i) % COLORS.length]}
                rx={1.5}
              >
                <title>{l + " · " + s.name + ": " + fv(s.values[i], o)}</title>
              </rect>
            ),
          )}
          <text x={L + i * bw + bw / 2} y={H - 20} textAnchor="middle" className="ax">
            {l.length > 9 ? l.slice(0, 8) + "…" : l}
          </text>
        </g>
      ))}
      {k > 1 &&
        d.series.map((s: any, j: number) => (
          <g key={s.name}>
            <rect x={L + j * 70} y={H - 10} width={8} height={8} fill={COLORS[j % COLORS.length]} />
            <text x={L + j * 70 + 12} y={H - 3} className="ax">
              {s.name}
            </text>
          </g>
        ))}
    </svg>
  );
}

export function WHist({ d, o }: { d: any; o: any }) {
  const W = 440;
  const H = 150;
  const L = 6;
  const B = 22;
  const mx = Math.max(1, ...d.bins.map((b: any) => b.n));
  const bw = (W - L * 2) / d.bins.length;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wplot">
        {d.bins.map((b: any, i: number) => (
          <g key={i}>
            <rect x={L + i * bw + 1} y={(H - B) * (1 - b.n / mx)} width={bw - 2} height={((H - B) * b.n) / mx} fill="var(--a)" rx={1.5}>
              <title>{fnum(b.lo) + "–" + fnum(b.hi) + ": " + b.n}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={L + i * bw} y={H - 6} className="ax">
                {fnum(b.lo)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="wleg">
        <span>p50 {fv(d.p50, o)}</span>
        <span>p95 {fv(d.p95, o)}</span>
        <span>{d.total} samples</span>
      </div>
    </div>
  );
}

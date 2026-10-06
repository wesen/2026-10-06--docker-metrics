import { COLORS, fnum, fv, stc, timeStr } from "../format";
import { Line } from "./basic";

export function WDonut({ d, o }: { d: any; o: any }) {
  const r = 38;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="wdonut">
      <svg viewBox="0 0 100 100" width={120} height={120} role="img">
        {d.slices.map((s: any, i: number) => {
          const len = (s.value / d.total) * C;
          const el = (
            <circle
              key={s.label}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={16}
              strokeDasharray={len.toFixed(2) + " " + (C - len).toFixed(2)}
              strokeDashoffset={-off}
              transform="rotate(-90 50 50)"
            >
              <title>{s.label}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x={50} y={54} textAnchor="middle" className="dv">
          {fnum(d.total)}
        </text>
      </svg>
      <ul>
        {d.slices.map((s: any, i: number) => (
          <li key={s.label}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            <span>{s.label}</span>
            <em>{((s.value / d.total) * 100).toFixed(0) + "%"}</em>
          </li>
        ))}
      </ul>
      {o.unit ? null : null}
    </div>
  );
}

export function WTable({ d }: { d: any }) {
  return (
    <div className="wtbl">
      <table>
        <thead>
          <tr>
            <th />
            {d.cols.map((c: string) => (
              <th key={c} className="r">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r: any) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              {d.cols.map((c: string) => {
                const co = d.colOpts[c];
                const v = r.cells[c];
                const col = r.st[c] === "ok" ? "var(--fg)" : stc(r.st[c]);
                return (
                  <td key={c} className="r" style={{ color: col }}>
                    {co.bar && v != null && (
                      <i className="cb" style={{ width: Math.min(100, (v / d.colMax[c]) * 100) + "%", background: r.st[c] === "ok" ? "var(--a)" : stc(r.st[c]) }} />
                    )}
                    <span>{fv(v, co)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WHeat({ d, o }: { d: any; o: any }) {
  if (!d.rows.length) return <div className="empty sm">No data in range</div>;
  const W = 440;
  const lab = 64;
  const ch = 16;
  const cw = (W - lab) / d.times.length;
  const H = d.rows.length * ch + 4;
  const rg = d.max - d.min || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wplot">
      {d.rows.map((n: string, i: number) => (
        <g key={n}>
          <text x={lab - 6} y={i * ch + 12} textAnchor="end" className="ax">
            {n.length > 10 ? n.slice(0, 9) + "…" : n}
          </text>
          {d.cells[i].map((v: number | null, j: number) =>
            v == null ? null : (
              <rect key={j} x={lab + j * cw} y={i * ch + 1} width={cw + 0.5} height={ch - 2} fill="var(--acc)" opacity={0.06 + 0.94 * Math.max(0, Math.min(1, (v - d.min) / rg))}>
                <title>{n + " · " + timeStr(d.times[j]) + " · " + fv(v, o)}</title>
              </rect>
            ),
          )}
        </g>
      ))}
    </svg>
  );
}

export function WGrid({ d, o }: { d: any; o: any }) {
  return (
    <div className="wgrid">
      {d.tiles.map((t: any) => (
        <div
          key={t.name}
          className="tile"
          style={{
            borderColor: t.state === "ok" ? "var(--line)" : stc(t.state),
            background: t.state === "ok" ? "var(--panel2)" : `color-mix(in srgb, ${stc(t.state)} 16%, transparent)`,
          }}
        >
          <b>{t.name}</b>
          <span>{fv(t.value, o)}</span>
        </div>
      ))}
    </div>
  );
}

export function WTop({ d, o }: { d: any; o: any }) {
  return (
    <div className="wtop">
      {d.items.map((it: any) => (
        <div key={it.name} className="trow">
          <span className="tn">{it.name}</span>
          <span className="tt">
            <i style={{ width: Math.min(100, (it.value / d.max) * 100) + "%", background: it.state === "ok" ? "var(--a)" : stc(it.state) }} />
          </span>
          <span className="tv">{fv(it.value, o)}</span>
        </div>
      ))}
    </div>
  );
}

export function WSparks({ d, o }: { d: any; o: any }) {
  return (
    <div className="wsp">
      {d.rows.map((r: any) => (
        <div key={r.name} className="srow">
          <span className="tn">{r.name}</span>
          <span className="sl">
            <Line pts={r.pts} color={r.state === "ok" ? "var(--a)" : stc(r.state)} w={120} hgt={22} />
          </span>
          <span className="tv" style={{ color: r.state === "ok" ? "var(--fg)" : stc(r.state) }}>
            {fv(r.value, o)}
          </span>
        </div>
      ))}
    </div>
  );
}

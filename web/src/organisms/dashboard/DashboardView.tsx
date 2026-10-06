import type { DashboardSnapshot } from "../../app/types";
import { timeStr } from "./format";
import { Widget } from "./Widget";

/** DashboardView renders a dashboard snapshot: header, sections and widget rows. */
export function DashboardView({
  snap,
  onSetVar,
  onSetRange,
}: {
  snap: DashboardSnapshot | null;
  onSetVar?: (name: string, value: string) => void;
  onSetRange?: (seconds: number) => void;
}) {
  if (!snap) {
    return (
      <div className="scroll">
        <div className="empty">
          <b>No dashboard yet.</b> Define one with <code>{`dashboard("title").row(stat(…), line(…)).show()`}</code> — open the Dashboards group in Presets.
        </div>
      </div>
    );
  }
  const rangeLabel = (r: number) => (r >= 3600 ? r / 3600 + "h" : r / 60 + "m");
  return (
    <div className="scroll dash">
      <div className="dh">
        <h2>{snap.title}</h2>
        <span className="when">updated {timeStr(snap.t)}</span>
        <div className="sp" />
        {snap.vars.map((v) => (
          <label key={v.name} className="dvar">
            {v.name}
            <select value={v.value} disabled={!onSetVar} onChange={(e) => onSetVar?.(v.name, e.target.value)}>
              {v.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="dvar">
          range
          <select value={snap.range} disabled={!onSetRange} onChange={(e) => onSetRange?.(Number(e.target.value))}>
            {snap.rangeOptions.map((r) => (
              <option key={r} value={r}>
                {rangeLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {snap.rows.map((r, i) =>
        r.section ? (
          <h3 key={i} className="dsec">
            {r.section}
          </h3>
        ) : (
          <div key={i} className="drow">
            {(r.widgets ?? []).map((w) => (
              <Widget key={w.id} w={w} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

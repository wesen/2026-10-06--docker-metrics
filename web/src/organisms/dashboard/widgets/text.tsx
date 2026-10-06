import type { ReactNode } from "react";
import { timeStr } from "../format";

export function WEvents({ d }: { d: any }) {
  if (!d.items.length) return <div className="empty sm">Quiet so far.</div>;
  return (
    <div className="wev">
      {d.items.map((e: any, i: number) => (
        <div key={i} className={"ev " + e.type}>
          <time>{timeStr(e.t).slice(3)}</time>
          <span className="tag">{e.type}</span>
          <span>{e.msg}</span>
        </div>
      ))}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((p, i) =>
    p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("*") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <span key={i}>{p}</span>,
  );
}

export function WText({ d }: { d: any }) {
  return (
    <div className="wtext">
      {d.body.split("\n").map((l: string, i: number) =>
        l.startsWith("# ") ? (
          <h5 key={i}>{l.slice(2)}</h5>
        ) : l.startsWith("- ") ? (
          <div key={i} className="li">
            <i />
            <span>{inline(l.slice(2))}</span>
          </div>
        ) : l ? (
          <p key={i}>{inline(l)}</p>
        ) : null,
      )}
    </div>
  );
}

export function WKv({ d }: { d: any }) {
  if (!d.pairs?.length) return <div className="empty sm">Nothing to show.</div>;
  return (
    <dl className="wkv">
      {d.pairs.map(([k, v]: [string, unknown]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{typeof v === "number" ? v.toFixed(2) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

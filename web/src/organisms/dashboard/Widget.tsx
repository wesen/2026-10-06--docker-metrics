import type { WidgetFrame } from "../../app/types";
import { WR } from "./registry";

/** Widget renders one snapshot widget: chrome, state class, then the registry. */
export function Widget({ w }: { w: WidgetFrame }) {
  const R = WR[w.type];
  const st = (w.data && w.data.state) || "";
  const minH = w.o.h as number | undefined;
  return (
    <article
      className={"w w-" + w.type + (st === "crit" || st === "warn" ? " " + st : "")}
      style={{ flex: `${w.span} 1 ${(w.span / 12) * 100}%`, minHeight: minH }}
    >
      <header className="w-h">
        <b>{w.title}</b>
        {w.o.desc ? <span>{String(w.o.desc)}</span> : null}
      </header>
      <div className="w-b">
        {w.error ? (
          <div className="werr">{w.error}</div>
        ) : w.data ? (
          R ? (
            <R d={w.data} o={w.o} />
          ) : (
            <div className="empty sm">unsupported widget: {w.type}</div>
          )
        ) : (
          <div className="empty sm">loading…</div>
        )}
      </div>
    </article>
  );
}

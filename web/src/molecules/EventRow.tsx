import type { EventEntry } from "../app/types";

const clock = (t: number) => new Date(t * 1000).toTimeString().slice(0, 8);

export function EventRow({ e }: { e: EventEntry }) {
  return (
    <div className={"ev " + e.type}>
      <time>{clock(e.t)}</time>
      <span className="tag">{e.type}</span>
      <span>
        {e.container ? e.container + " " : ""}
        {e.msg}
      </span>
    </div>
  );
}

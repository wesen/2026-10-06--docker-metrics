import { useEffect, useRef } from "react";
import { useAppSelector } from "../app/store";
import { ConsoleLine } from "../molecules/ConsoleLine";

export function ConsolePanel() {
  const logs = useAppSelector((s) => s.stream.logs);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  return (
    <div className="console scroll" ref={ref}>
      {logs.length === 0 && (
        <div className="empty">
          <b>Nothing yet.</b> Pick a preset or press Run — console.log output lands here.
        </div>
      )}
      {logs.map((e) => (
        <ConsoleLine key={e.id} entry={e} />
      ))}
    </div>
  );
}

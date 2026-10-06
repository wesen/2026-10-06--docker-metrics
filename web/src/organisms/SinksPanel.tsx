import { useEffect, useState } from "react";

/** SinksPanel shows the live Prometheus exposition text. */
export function SinksPanel() {
  const [text, setText] = useState("");
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/metrics");
        const t = await res.text();
        if (!stop) setText(t);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  if (!text.trim()) {
    return (
      <div className="scroll">
        <div className="empty">
          <b>No sink output.</b> Run a dashboard that pipes a stream into <code>prometheus()</code> and its exposition appears here.
        </div>
      </div>
    );
  }
  return (
    <div className="scroll sinks">
      <section>
        <h3>GET /metrics</h3>
        <pre className="dump">{text}</pre>
      </section>
    </div>
  );
}

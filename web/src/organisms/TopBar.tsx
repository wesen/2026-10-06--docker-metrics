import { useEffect, useState, type ReactNode } from "react";
import { useAppSelector } from "../app/store";
import { Button } from "../atoms/Button";

export function TopBar({
  running,
  onRun,
  onStop,
  extra,
}: {
  running: boolean;
  onRun?: () => void;
  onStop?: () => void;
  extra?: ReactNode;
}) {
  const connected = useAppSelector((s) => s.stream.connected);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <header className="top">
      <div className="brand">
        <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <rect x={2} y={8} width={6} height={5} fill="var(--acc)" />
          <rect x={9} y={8} width={6} height={5} fill="var(--a)" />
          <rect x={16} y={8} width={6} height={5} fill="var(--bad)" />
          <rect x={5.5} y={14} width={6} height={5} fill="var(--n)" />
          <rect x={12.5} y={14} width={6} height={5} fill="var(--c)" />
        </svg>
        <span>dockermetrics</span>
      </div>
      <a className="btn sm" href="/">
        Dashboard
      </a>
      <a className="btn sm" href="/ide">
        IDE
      </a>
      {extra}
      <div className="sp" />
      <span className="clock" title={connected ? (running ? "websocket connected, running" : "websocket connected") : "disconnected"}>
        {connected ? "● live" : "○ offline"} {new Date(now * 1000).toTimeString().slice(0, 8)}
      </span>
      {onRun && (
        <Button variant="run" onClick={onRun} title="Ctrl/Cmd + Enter">
          Run
        </Button>
      )}
      {onStop && (
        <Button variant="stop" onClick={onStop}>
          Stop
        </Button>
      )}
    </header>
  );
}

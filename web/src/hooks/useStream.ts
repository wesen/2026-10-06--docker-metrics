import { useEffect } from "react";
import { useAppDispatch } from "../app/store";
import { eventReceived, frameReceived, logReceived, setConnected, setRunStatus } from "../app/streamSlice";

/** useStream subscribes to the daemon WebSocket and dispatches frames. */
export function useStream(runTopic?: string | null) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        dispatch(setConnected(true));
        ws?.send(JSON.stringify({ type: "subscribe", topic: "fleet" }));
        ws?.send(JSON.stringify({ type: "subscribe", topic: "events" }));
        if (runTopic) ws?.send(JSON.stringify({ type: "subscribe", topic: runTopic }));
      };
      ws.onmessage = (ev) => {
        let m: any;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === "frame") {
          dispatch(frameReceived({ topic: m.topic, t: m.t ?? 0, data: m.data ?? {} }));
        } else if (m.type === "event") {
          dispatch(
            eventReceived({
              t: m.at ?? m.t ?? Math.floor(Date.now() / 1000),
              type: m.kind ?? "event",
              msg: m.message ?? m.rule ?? "",
              container: m.data?.container,
              rule: m.rule,
            }),
          );
        } else if (m.type === "log") {
          dispatch(logReceived({ level: m.level ?? "log", text: m.text ?? "", run: m.run }));
        } else if (m.type === "run") {
          dispatch(setRunStatus({ runId: m.run, status: m.status, message: m.message }));
        }
      };
      ws.onclose = () => {
        dispatch(setConnected(false));
        if (!closed) retry = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      ws?.close();
    };
  }, [dispatch, runTopic]);
}

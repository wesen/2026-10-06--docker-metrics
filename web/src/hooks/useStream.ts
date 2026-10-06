import { useEffect } from "react";
import { useAppDispatch } from "../app/store";
import { eventReceived, frameReceived, logReceived, setConnected, setRunStatus } from "../app/streamSlice";
import { setSnapshot } from "../app/dashboardSlice";

/** useStream subscribes to the daemon WebSocket and dispatches frames. */
export function useStream(runTopic?: string | null, extraTopics?: string[]) {
  const dispatch = useAppDispatch();
  const extraKey = (extraTopics ?? []).join(",");
  useEffect(() => {
    const topics = ["fleet", "events", ...(extraTopics ?? [])];
    if (runTopic) topics.push(runTopic);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      dispatch(setConnected(true));
      for (const t of topics) ws.send(JSON.stringify({ type: "subscribe", topic: t }));
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
      } else if (m.type === "snapshot") {
        const id = String(m.topic ?? "").replace(/^dash:/, "");
        dispatch(setSnapshot({ id, snapshot: m.value }));
      } else if (m.type === "event") {
        dispatch(
          eventReceived({
            t: m.data?.at ?? m.t ?? Math.floor(Date.now() / 1000),
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
    ws.onclose = () => dispatch(setConnected(false));
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, runTopic, extraKey]);
}

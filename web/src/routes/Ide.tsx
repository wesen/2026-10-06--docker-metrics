import { useRunSourceMutation, useStopRunMutation } from "../app/api";
import { useAppDispatch, useAppSelector } from "../app/store";
import { clearLogs, setRunStatus } from "../app/streamSlice";
import { setPreset, setRunId, setSource, setTab, togglePreset, closePreset, type Tab } from "../app/uiSlice";
import { Button } from "../atoms/Button";
import { useStream } from "../hooks/useStream";
import { CodeEditor } from "../molecules/CodeEditor";
import { ChartsPanel } from "../organisms/ChartsPanel";
import { ConsolePanel } from "../organisms/ConsolePanel";
import { DashboardView } from "../organisms/dashboard/DashboardView";
import { EventsPanel } from "../organisms/EventsPanel";
import { FleetGrid } from "../organisms/FleetGrid";
import { PresetDrawer } from "../organisms/PresetDrawer";
import { SinksPanel } from "../organisms/SinksPanel";
import { TopBar } from "../organisms/TopBar";

const TABS: [Tab, string][] = [
  ["console", "Console"],
  ["dashboard", "Dashboard"],
  ["fleet", "Fleet"],
  ["charts", "Charts"],
  ["events", "Events"],
  ["sinks", "Sinks"],
];

export function Ide() {
  const dispatch = useAppDispatch();
  const { source, presetId, tab, selected, presetOpen, runId } = useAppSelector((s) => s.ui);
  const runStatus = useAppSelector((s) => s.stream.runStatus);
  const dashboardLatest = useAppSelector((s) => s.dashboard.latest);
  const [runSource] = useRunSourceMutation();
  const [stopRun] = useStopRunMutation();

  useStream(runId ? `run:${runId}` : null, ["dash:latest"]);

  const run = async () => {
    dispatch(clearLogs());
    dispatch(setRunStatus({ status: "running" }));
    try {
      const res = await runSource({ source }).unwrap();
      dispatch(setRunId(res.runId));
    } catch (e: any) {
      dispatch(setRunStatus({ status: "error", message: e?.error ?? String(e) }));
    }
  };
  const stop = async () => {
    if (runId) await stopRun(runId);
    dispatch(setRunId(null));
    dispatch(setRunStatus({ status: "stopped" }));
  };

  const statusText =
    runStatus.status === "running"
      ? "running…"
      : runStatus.status === "ok"
      ? "finished " + (runStatus.message ?? "")
      : runStatus.status === "error"
      ? "error: " + (runStatus.message ?? "")
      : runStatus.status === "stopped"
      ? "stopped"
      : "ready";

  return (
    <div className="app">
      <TopBar
        running={runStatus.status === "running" || !!runId}
        onRun={run}
        onStop={runId ? stop : undefined}
        extra={
          <Button variant="sm" onClick={() => dispatch(togglePreset())} aria-expanded={presetOpen}>
            Presets
          </Button>
        }
      />
      <main className="main split">
        <section className="pane code-pane">
          <div className="pane-h">
            <span className="file">{presetId}.js</span>
            <span className="ttl">Edit and run a dashboard</span>
            <a className="btn sm ghost" href="/">
              Dashboard
            </a>
          </div>
          <CodeEditor value={source} onChange={(v) => dispatch(setSource(v))} onRun={run} />
          <div className="hint">Ctrl/⌘ + Enter to run · imports are optional · every DSL name is already in scope</div>
        </section>
        <section className="pane view-pane">
          <nav className="tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => dispatch(setTab(k))}>
                {l}
              </button>
            ))}
          </nav>
          <div className="view">
            {tab === "console" && <ConsolePanel />}
            {tab === "dashboard" && <DashboardView snap={dashboardLatest} />}
            {tab === "fleet" && <FleetGrid selected={selected} onSelect={(n) => dispatch({ type: "ui/select", payload: n })} />}
            {tab === "charts" && <ChartsPanel selected={selected} />}
            {tab === "events" && <EventsPanel />}
            {tab === "sinks" && <SinksPanel />}
          </div>
          <footer className="status">
            <span className={"st " + (runStatus.status === "error" ? "err" : runStatus.status === "ok" ? "ok" : runStatus.status === "running" ? "run" : "")}>{statusText}</span>
            {runId && <span className="chip">{runId}</span>}
          </footer>
        </section>
        <PresetDrawer
          open={presetOpen}
          currentId={presetId}
          onPick={(p) => dispatch(setPreset({ id: p.id, source: p.code }))}
          onClose={() => dispatch(closePreset())}
        />
      </main>
    </div>
  );
}

import { useAppSelector } from "../app/store";
import { useStream } from "../hooks/useStream";
import { DashboardView } from "../organisms/dashboard/DashboardView";
import { TopBar } from "../organisms/TopBar";

/** DashboardBoard renders a single custom dashboard (by id, or the latest). */
export function DashboardBoard({ id }: { id?: string }) {
  const topic = id ? `dash:${id}` : "dash:latest";
  useStream(null, [topic]);
  const snap = useAppSelector((s) => (id ? s.dashboard.snapshots[id] : s.dashboard.latest));
  return (
    <div className="app">
      <TopBar running />
      <main className="main">
        <section className="pane view-pane">
          <div className="view">
            <DashboardView snap={snap ?? null} />
          </div>
          <footer className="status">
            <span className="st">{id ? `dashboard ${id}` : "latest dashboard"} · live over WebSocket</span>
          </footer>
        </section>
      </main>
    </div>
  );
}

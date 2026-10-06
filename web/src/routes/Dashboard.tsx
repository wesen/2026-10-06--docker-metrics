import { useAppDispatch, useAppSelector } from "../app/store";
import { setTab, type Tab } from "../app/uiSlice";
import { useStream } from "../hooks/useStream";
import { ChartsPanel } from "../organisms/ChartsPanel";
import { EventsPanel } from "../organisms/EventsPanel";
import { FleetGrid } from "../organisms/FleetGrid";
import { SinksPanel } from "../organisms/SinksPanel";
import { TopBar } from "../organisms/TopBar";

const TABS: [Tab, string][] = [
  ["fleet", "Fleet"],
  ["charts", "Charts"],
  ["events", "Events"],
  ["sinks", "Sinks"],
];

export function Dashboard() {
  const dispatch = useAppDispatch();
  const { tab, selected } = useAppSelector((s) => s.ui);
  const events = useAppSelector((s) => s.stream.events);
  useStream();

  const active = TABS.some(([k]) => k === tab) ? tab : "fleet";

  return (
    <div className="app">
      <TopBar running />
      <main className="main">
        <section className="pane view-pane">
          <nav className="tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={active === k} className={active === k ? "on" : ""} onClick={() => dispatch(setTab(k))}>
                {l}
                {k === "events" && events.length ? " " + events.length : ""}
              </button>
            ))}
          </nav>
          <div className="view">
            {active === "fleet" && <FleetGrid selected={selected} onSelect={(n) => dispatch({ type: "ui/select", payload: n })} />}
            {active === "charts" && <ChartsPanel selected={selected} />}
            {active === "events" && <EventsPanel />}
            {active === "sinks" && <SinksPanel />}
          </div>
          <footer className="status">
            <span className="st">live dashboard · click a container to focus charts</span>
          </footer>
        </section>
      </main>
    </div>
  );
}

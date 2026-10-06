import { Dashboard } from "./routes/Dashboard";
import { DashboardBoard } from "./routes/DashboardBoard";
import { Ide } from "./routes/Ide";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/ide") return <Ide />;
  const m = /^\/d\/(.+)$/.exec(path);
  if (m) return <DashboardBoard id={decodeURIComponent(m[1])} />;
  return <Dashboard />;
}

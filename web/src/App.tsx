import { Dashboard } from "./routes/Dashboard";
import { Ide } from "./routes/Ide";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/ide" ? <Ide /> : <Dashboard />;
}

import type { LogEntry } from "../app/types";

/** ConsoleLine renders one console entry; table entries arrive as JSON. */
export function ConsoleLine({ entry }: { entry: LogEntry }) {
  if (entry.level === "table") {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = JSON.parse(entry.text);
    } catch {
      rows = [];
    }
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return (
      <div style={{ padding: "4px 12px" }}>
        <table style={{ borderCollapse: "collapse", font: "12px var(--mono)" }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={{ textAlign: "left", borderBottom: "1px solid var(--line)", paddingRight: 12 }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} style={{ paddingRight: 12 }}>
                    {String(r[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <pre className={"line " + entry.level}>{entry.text}</pre>;
}

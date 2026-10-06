import { useGetContainersQuery } from "../app/api";
import { useAppSelector } from "../app/store";
import type { Container } from "../app/types";
import { ContainerCard } from "../molecules/ContainerCard";

/** FleetGrid renders every container grouped by host, fed by REST + live frames. */
export function FleetGrid({ selected, onSelect }: { selected: string | null; onSelect: (name: string | null) => void }) {
  const { data } = useGetContainersQuery(undefined, { pollingInterval: 5000 });
  const fleet = useAppSelector((s) => s.stream.fleet);
  const containers: Container[] = data ?? [];

  const cpuOf = (c: Container): number => {
    const live = (fleet?.data?.cpu as Record<string, number> | undefined)?.[c.name];
    const v = live ?? c.lastSample?.cpu ?? 0;
    return v / 100; // pct -> fraction for the bar
  };
  const memOf = (c: Container): number => {
    const live = (fleet?.data?.mem as Record<string, number> | undefined)?.[c.name];
    const v = live ?? (c.lastSample ? (c.lastSample.mem / (c.lastSample.limit || 1)) * 100 : 0);
    return v / 100;
  };

  const hosts = Array.from(new Set(containers.map((c) => c.host))).sort();
  if (containers.length === 0) {
    return (
      <div className="scroll">
        <div className="empty">
          <b>No containers.</b> Is the daemon connected to a Docker host with running containers?
        </div>
      </div>
    );
  }
  return (
    <div className="scroll">
      {hosts.map((host) => (
        <section key={host}>
          <h3 className="host">{host === "local" ? "local · unix socket" : host}</h3>
          <div className="grid">
            {containers
              .filter((c) => c.host === host)
              .map((c) => (
                <ContainerCard key={c.host + c.name} c={c} cpu={cpuOf(c)} mem={memOf(c)} selected={selected === c.name} onSelect={() => onSelect(selected === c.name ? null : c.name)} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

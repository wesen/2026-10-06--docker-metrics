import type { Container } from "../app/types";
import { StatBar } from "../atoms/Charts";
import { Dot } from "../atoms/Indicators";

export function ContainerCard({ c, cpu, mem, selected, onSelect }: { c: Container; cpu: number; mem: number; selected: boolean; onSelect: () => void }) {
  return (
    <button className={"card" + (selected ? " sel" : "") + (c.state !== "running" ? " off" : "")} onClick={onSelect} title={c.name}>
      <div className="card-h">
        <Dot state={c.state} />
        <b>{c.name}</b>
        {c.restarts > 0 && <span className="img">↻{c.restarts}</span>}
      </div>
      <div className="img">{c.image}</div>
      <StatBar label="cpu" value={cpu} />
      <StatBar label="mem" value={mem} />
    </button>
  );
}

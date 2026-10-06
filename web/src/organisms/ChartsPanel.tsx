import { useMemo, useState } from "react";
import { useGetContainersQuery, useGetSamplesQuery } from "../app/api";
import type { Sample } from "../app/types";
import { Select } from "../atoms/Select";

type MetricKey = "cpu" | "mem" | "rx" | "tx" | "pids";

const METRICS: Record<MetricKey, { label: string; series: (s: Sample, prev: Sample) => number }> = {
  cpu: { label: "CPU %", series: (s) => s.cpu * 100 },
  mem: { label: "Memory % of limit", series: (s) => (s.limit ? (s.mem / s.limit) * 100 : 0) },
  rx: { label: "Network in, KB/s", series: (s, p) => (s.t > p.t ? (s.rx - p.rx) / (s.t - p.t) / 1e3 : 0) },
  tx: { label: "Network out, KB/s", series: (s, p) => (s.t > p.t ? (s.tx - p.tx) / (s.t - p.t) / 1e3 : 0) },
  pids: { label: "Processes", series: (s) => s.pids },
};

const niceMax = (x: number) => {
  if (x <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x) return k * mag;
  return 10 * mag;
};

/** ChartsPanel draws one metric for the selected container over time. */
export function ChartsPanel({ selected }: { selected: string | null }) {
  const { data: containers } = useGetContainersQuery(undefined, { pollingInterval: 10000 });
  const [metric, setMetric] = useState<MetricKey>("cpu");
  const [window, setWindow] = useState("5m");
  const name = selected ?? containers?.[0]?.name ?? "";
  const host = containers?.find((c) => c.name === name)?.host ?? "";
  const { data } = useGetSamplesQuery({ name, host, window }, { skip: !name, pollingInterval: 2000 });

  const m = METRICS[metric];
  const points = useMemo(() => {
    const raw = data?.points ?? [];
    const out: { t: number; v: number }[] = [];
    for (let i = 1; i < raw.length; i++) out.push({ t: raw[i].t, v: m.series(raw[i], raw[i - 1]) });
    return out;
  }, [data, m]);

  if (!name) {
    return (
      <div className="scroll">
        <div className="empty">
          <b>No container selected.</b>
        </div>
      </div>
    );
  }

  const W = 640;
  const H = 300;
  const L = 48;
  const R = 8;
  const T = 10;
  const B = 24;
  const lo = points.length ? points[0].t : 0;
  const hi = points.length ? points[points.length - 1].t : 1;
  const ymax = niceMax(Math.max(...points.map((p) => p.v), metric === "cpu" || metric === "mem" ? 20 : 1) * 1.08);
  const X = (t: number) => L + ((t - lo) / Math.max(1, hi - lo)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / ymax) * (H - T - B);
  const path = points.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + " " + Y(p.v).toFixed(1)).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);

  return (
    <div className="scroll charts">
      <div className="ctl">
        <Select
          ariaLabel="Metric"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(METRICS) as MetricKey[]).map((k) => ({ value: k, label: METRICS[k].label }))}
        />
        <Select
          ariaLabel="Window"
          value={window}
          onChange={setWindow}
          options={[
            { value: "1m", label: "last 1 min" },
            { value: "5m", label: "last 5 min" },
            { value: "15m", label: "last 15 min" },
            { value: "30m", label: "last 30 min" },
          ]}
        />
        <span className="clock">
          {host}/{name} · {points.length} pts
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={m.label}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid-l" />
            <text x={L - 6} y={Y(v) + 4} textAnchor="end" className="ax">
              {v >= 100 ? v.toFixed(0) : v.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--acc)" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

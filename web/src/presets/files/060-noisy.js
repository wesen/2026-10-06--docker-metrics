// @group Scenarios
// @title Noisy neighbour finder
// @desc Rank by p95 CPU, sparkline each

const d = docker();
const p95s = await d.containers().read(cpu.pipe(pct, p95, { window: "10m" }), by("name"));
const ranked = Object.entries(p95s).filter((e) => e[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 6);

for (const [name, v] of ranked) {
  const h = await d.container(name).history(cpu.pipe(pct), last("10m"), bucket("30s"));
  console.log(name.slice(-26).padEnd(27), v.toFixed(0).padStart(4) + "%", spark(h.map((x) => x.v)));
}

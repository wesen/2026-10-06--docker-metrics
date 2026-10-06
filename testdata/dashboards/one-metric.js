// Simplest: one container, one metric.
// cpu is a fraction of one core (0.42 = 42%).
const d = docker();

const names = d.containers().names();
console.log("containers:", names.join(", "));

if (names.length > 0) {
  const first = d.container(names[0]);
  console.log(first.name, "cpu", await first.read(cpu), "->", await first.read(cpu.pipe(pct)), "%");
  console.log(first.name, "mem MB", await first.read(mem.pipe(mb)));
  console.log(first.name, "pids", await first.read(pids.current));
}

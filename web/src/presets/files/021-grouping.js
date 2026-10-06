// @group Aggregation
// @title Grouping with by()
// @desc Nest by compose project, service, image

const PROJECT = "label:com.docker.compose.project";
const SERVICE = "label:com.docker.compose.service";
const d = docker();
const all = d.containers();

console.log("cpu % by project");
console.log(await all.read(cpu.pipe(pct, avg), by(PROJECT)));

console.log("mem MB by image");
console.log(await all.read(mem.pipe(mb, sum), by("image")));

console.log("max cpu % by project, then service");
console.log(await all.read(cpu.pipe(pct, max), by(PROJECT), by(SERVICE)));

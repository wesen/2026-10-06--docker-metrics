// @group Basics
// @title Selecting containers
// @desc Glob, regex, label, image, function

const d = docker();
const show = (label, group) => console.log(label.padEnd(28), group.names().join(", ") || "—");

show("all running", d.containers());
show('glob "*load-*"', d.containers("*load-*"));
show("regex /db|nats/", d.containers(/db|nats/));
show("has a compose project", d.containers({ label: "com.docker.compose.project" }));
show("compose service=load-cpu", d.containers({ label: "com.docker.compose.service=load-cpu" }));
show('image "docker-metrics"', d.containers({ image: "docker-metrics" }));
show("custom function", d.containers((s) => s.state === "running" && !s.labels["com.docker.compose.project"]));

// A group is a live selector: it re-resolves every time it is used.
const load = d.containers("*load-*");
console.log("load generators right now:", load.size);

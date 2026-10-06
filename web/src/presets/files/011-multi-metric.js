// @group Basics
// @title Several metrics at once
// @desc Pass an object, get an object

const d = docker();
const c = d.container(d.containers().names()[0]);

// An object of metrics returns an object of values.
console.log(await c.read({ cpu, mem, net, io, pids }));

// net, io and pids have parts that are metrics too.
console.log("rx so far:", await c.read(net.rx), "bytes");
console.log("processes:", await c.read(pids.current));

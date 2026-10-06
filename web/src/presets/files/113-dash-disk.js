// @group Dashboards · Resources
// @title Block I/O
// @desc Disk read/write rates

const all = docker().containers();
const rd = io.r.pipe(rate("1s"), kb), wr = io.w.pipe(rate("1s"), kb);

dashboard("Block I/O", { every: "3s", range: "15m" })
  .row(
    stat("Read", all, rd.pipe(sum), { unit: "KB/s" }),
    stat("Write", all, wr.pipe(sum), { unit: "KB/s" }),
    stat("Read since start", all, io.r.pipe(mb, sum), { unit: "MB", dec: 0 }),
    stat("Written since start", all, io.w.pipe(mb, sum), { unit: "MB", dec: 0 })
  )
  .row(
    area("Writes per container", all, wr, { unit: "KB/s", stack: true, span: 6 }),
    area("Reads per container", all, rd, { unit: "KB/s", stack: true, span: 6 })
  )
  .row(
    top("Heaviest writers", all, wr, { unit: "KB/s", n: 6, span: 6 }),
    donut("Bytes written", all, io.w.pipe(sum), by("name"), { span: 6 })
  )
  .show();

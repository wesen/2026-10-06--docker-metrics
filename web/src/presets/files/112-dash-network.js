// @group Dashboards · Resources
// @title Network I/O
// @desc rx/tx rates per container and project

const PROJECT = "label:com.docker.compose.project";
const all = docker().containers();
const rx = net.rx.pipe(rate("1s"), kb), tx = net.tx.pipe(rate("1s"), kb);

dashboard("Network", { every: "3s", range: "15m" })
  .row(
    stat("Ingress", all, rx.pipe(sum), { unit: "KB/s" }),
    stat("Egress", all, tx.pipe(sum), { unit: "KB/s" }),
    stat("Busiest ingress", all, rx.pipe(max), { unit: "KB/s" }),
    stat("Busiest egress", all, tx.pipe(max), { unit: "KB/s" })
  )
  .row(
    line("Ingress per container", all, rx, { unit: "KB/s", span: 6 }),
    line("Egress per container", all, tx, { unit: "KB/s", span: 6 })
  )
  .row(
    bar("Traffic by project", all, rx.pipe(sum), by(PROJECT), { unit: "KB/s", span: 6 }),
    top("Top talkers (egress)", all, tx, { unit: "KB/s", n: 6, span: 6 })
  )
  .row(table("Totals", all, { rx_kbs: rx, tx_kbs: tx, rx_total_mb: net.rx.pipe(mb), tx_total_mb: net.tx.pipe(mb) },
    { sort: "rx_kbs", columns: { rx_kbs: { unit: "KB/s", dec: 1, bar: true }, tx_kbs: { unit: "KB/s", dec: 1, bar: true }, rx_total_mb: { unit: "MB", dec: 1 }, tx_total_mb: { unit: "MB", dec: 1 } } }))
  .show();

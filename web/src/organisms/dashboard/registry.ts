import type { ComponentType } from "react";
import { WStat, WGauge } from "./widgets/basic";
import { Plot, AreaPlot, WBar, WHist } from "./widgets/plots";
import { WDonut, WTable, WHeat, WGrid, WTop, WSparks } from "./widgets/parts";
import { WEvents, WText, WKv } from "./widgets/text";

export interface WidgetProps {
  d: any;
  o: any;
}

// The interpreter registry: widget type -> component. Adding a widget type is
// one entry here plus its compute branch in the JS prelude.
export const WR: Record<string, ComponentType<WidgetProps>> = {
  stat: WStat,
  gauge: WGauge,
  line: Plot,
  area: AreaPlot,
  bar: WBar,
  donut: WDonut,
  table: WTable,
  heatmap: WHeat,
  grid: WGrid,
  top: WTop,
  histogram: WHist,
  sparks: WSparks,
  events: WEvents,
  text: WText,
  kv: WKv,
};

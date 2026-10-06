export interface Sample {
  t: number;
  cpu: number;
  mem: number;
  limit: number;
  rx: number;
  tx: number;
  ior: number;
  iow: number;
  pids: number;
  pidsLimit: number;
  cpuValid: boolean;
}

export interface Container {
  name: string;
  id: string;
  host: string;
  image: string;
  labels: Record<string, string>;
  state: string;
  restarts: number;
  lastSample?: Sample;
}

export interface HostInfo {
  name: string;
  uri: string;
  version: string;
  connected: boolean;
}

export interface Dashboard {
  id: string;
  name: string;
  source: string;
  updatedAt: number;
}

export interface FleetFrame {
  t: number;
  data: Record<string, unknown>;
}

export interface EventEntry {
  t: number;
  type: string;
  msg: string;
  container?: string;
  rule?: string;
}

export interface LogEntry {
  id: number;
  level: string;
  text: string;
  run?: string;
}

export interface WidgetFrame {
  id: number;
  type: string;
  title: string;
  span: number;
  o: Record<string, unknown>;
  data: any;
  error?: string | null;
}

export interface SnapshotRow {
  section?: string;
  widgets?: WidgetFrame[];
}

export interface DashboardVar {
  name: string;
  options: string[];
  value: string;
}

export interface DashboardSnapshot {
  title: string;
  id: string;
  t: number;
  vars: DashboardVar[];
  range: number;
  rangeOptions: number[];
  rows: SnapshotRow[];
}

export const COLORS = ["#e8b339", "#4fd1c5", "#f0685a", "#7cb7ff", "#c792ea", "#a5d6a0", "#f2a65e", "#ff8fab", "#9ad1d4", "#d4c5a0"];

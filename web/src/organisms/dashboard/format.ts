export const COLORS = ["#e8b339", "#4fd1c5", "#f0685a", "#7cb7ff", "#c792ea", "#a5d6a0", "#f2a65e", "#ff8fab", "#9ad1d4", "#d4c5a0"];

export const fnum = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
};

export const fv = (v: any, o: any): string => {
  if (v == null || !isFinite(Number(v))) return "—";
  const n = Number(v);
  const unit = o && o.unit;
  const dec = o && o.dec;
  const s = dec != null ? n.toFixed(dec) : fnum(n);
  if (!unit) return s;
  return unit === "%" ? s + "%" : s + " " + unit;
};

export const stc = (state: string | undefined): string => (state === "crit" ? "var(--bad)" : state === "warn" ? "var(--warn)" : "var(--ok)");

export const timeStr = (t: number): string => new Date(t * 1000).toTimeString().slice(0, 8);

export const niceMax = (x: number): number => {
  if (x <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x) return k * mag;
  return 10 * mag;
};

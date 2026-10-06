import type { ReactNode } from "react";

export function Dot({ state }: { state: string }) {
  return <span className={"dot " + (state === "running" ? "" : state)} title={state} />;
}

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={"badge " + kind}>{children}</span>;
}

export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="chip">
      <span>{label}</span>
      {onRemove && (
        <button aria-label={"Stop " + label} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

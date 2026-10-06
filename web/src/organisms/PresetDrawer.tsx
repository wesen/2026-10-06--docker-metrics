import { PRESET_GROUPS, type Preset } from "../presets";

export function PresetDrawer({ open, currentId, onPick, onClose }: { open: boolean; currentId: string; onPick: (p: Preset) => void; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label="Presets">
        {PRESET_GROUPS.map((g) => (
          <div key={g.name}>
            <h4>{g.name}</h4>
            {g.items.map((p) => (
              <button key={p.id} className={"pre" + (p.id === currentId ? " on" : "")} onClick={() => onPick(p)}>
                <b>{p.title}</b>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>
    </>
  );
}

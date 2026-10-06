import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type Tab = "console" | "fleet" | "charts" | "events" | "sinks";

interface UiState {
  source: string;
  presetId: string;
  tab: Tab;
  pane: "code" | "view";
  selected: string | null;
  presetOpen: boolean;
  runId: string | null;
}

const initialSource = `// Simplest: one container, one metric.
// cpu is a fraction of one core (0.42 = 42%).
const d = docker();
const names = d.containers().names();
console.log("containers:", names.join(", "));
if (names.length > 0) {
  const c = d.container(names[0]);
  console.log(c.name, "cpu", await c.read(cpu.pipe(pct)), "%");
  console.log(c.name, "mem MB", await c.read(mem.pipe(mb)));
}
`;

const initialState: UiState = {
  source: initialSource,
  presetId: "starter",
  tab: "console",
  pane: "code",
  selected: null,
  presetOpen: false,
  runId: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setSource(state, action: PayloadAction<string>) {
      state.source = action.payload;
    },
    setPreset(state, action: PayloadAction<{ id: string; source: string }>) {
      state.presetId = action.payload.id;
      state.source = action.payload.source;
      state.tab = "console";
      state.presetOpen = false;
    },
    setTab(state, action: PayloadAction<Tab>) {
      state.tab = action.payload;
    },
    setPane(state, action: PayloadAction<"code" | "view">) {
      state.pane = action.payload;
    },
    select(state, action: PayloadAction<string | null>) {
      state.selected = action.payload;
    },
    togglePreset(state) {
      state.presetOpen = !state.presetOpen;
    },
    closePreset(state) {
      state.presetOpen = false;
    },
    setRunId(state, action: PayloadAction<string | null>) {
      state.runId = action.payload;
    },
  },
});

export const { setSource, setPreset, setTab, setPane, select, togglePreset, closePreset, setRunId } = uiSlice.actions;
export default uiSlice.reducer;

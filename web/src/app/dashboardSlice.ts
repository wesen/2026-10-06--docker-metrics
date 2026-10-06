import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DashboardSnapshot } from "./types";

interface DashboardState {
  /** latest snapshot per dashboard id */
  snapshots: Record<string, DashboardSnapshot>;
  /** most recent snapshot from the dash:latest topic */
  latest: DashboardSnapshot | null;
}

const initialState: DashboardState = { snapshots: {}, latest: null };

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setSnapshot(state, action: PayloadAction<{ id: string; snapshot: DashboardSnapshot }>) {
      state.snapshots[action.payload.id] = action.payload.snapshot;
      state.latest = action.payload.snapshot;
    },
    clearSnapshots(state) {
      state.snapshots = {};
      state.latest = null;
    },
  },
});

export const { setSnapshot, clearSnapshots } = dashboardSlice.actions;
export default dashboardSlice.reducer;

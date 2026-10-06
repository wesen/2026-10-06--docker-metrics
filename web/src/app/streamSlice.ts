import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { EventEntry, FleetFrame, LogEntry } from "./types";

interface StreamState {
  connected: boolean;
  fleet: FleetFrame | null;
  events: EventEntry[];
  logs: LogEntry[];
  runStatus: { runId?: string; status: string; message?: string };
}

const initialState: StreamState = {
  connected: false,
  fleet: null,
  events: [],
  logs: [],
  runStatus: { status: "idle" },
};

let logSeq = 0;

const streamSlice = createSlice({
  name: "stream",
  initialState,
  reducers: {
    setConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
    frameReceived(state, action: PayloadAction<{ topic: string; t: number; data: Record<string, unknown> }>) {
      if (action.payload.topic === "fleet") {
        state.fleet = { t: action.payload.t, data: action.payload.data };
      }
    },
    eventReceived(state, action: PayloadAction<EventEntry>) {
      state.events.unshift(action.payload);
      if (state.events.length > 400) state.events.pop();
    },
    logReceived(state, action: PayloadAction<{ level: string; text: string; run?: string }>) {
      state.logs.push({ id: ++logSeq, ...action.payload });
      if (state.logs.length > 500) state.logs.shift();
    },
    clearLogs(state) {
      state.logs = [];
    },
    setRunStatus(state, action: PayloadAction<{ runId?: string; status: string; message?: string }>) {
      state.runStatus = action.payload;
    },
  },
});

export const { setConnected, frameReceived, eventReceived, logReceived, clearLogs, setRunStatus } = streamSlice.actions;
export default streamSlice.reducer;

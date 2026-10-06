import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Container, Dashboard, HostInfo, Sample } from "./types";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  tagTypes: ["Dashboard"],
  endpoints: (b) => ({
    getContainers: b.query<Container[] | null, void>({ query: () => "api/v1/containers" }),
    getHosts: b.query<HostInfo[], void>({ query: () => "api/v1/hosts" }),
    getSamples: b.query<{ points: Sample[] | null }, { name: string; host?: string; window?: string }>({
      query: ({ name, host, window }) =>
        `api/v1/containers/${encodeURIComponent(name)}/samples?host=${encodeURIComponent(host ?? "")}&window=${window ?? "5m"}`,
    }),
    getDashboards: b.query<Dashboard[], void>({ query: () => "api/v1/dashboards", providesTags: ["Dashboard"] }),
    createDashboard: b.mutation<Dashboard, { name: string; source: string }>({
      query: (body) => ({ url: "api/v1/dashboards", method: "POST", body }),
      invalidatesTags: ["Dashboard"],
    }),
    runSource: b.mutation<{ runId: string; accepted: boolean }, { source: string }>({
      query: (body) => ({ url: "api/v1/run", method: "POST", body }),
    }),
    stopRun: b.mutation<{ stopped: boolean }, string>({
      query: (id) => ({ url: `api/v1/run/${id}/stop`, method: "POST" }),
    }),
  }),
});

export const {
  useGetContainersQuery,
  useGetHostsQuery,
  useGetSamplesQuery,
  useGetDashboardsQuery,
  useCreateDashboardMutation,
  useRunSourceMutation,
  useStopRunMutation,
} = api;

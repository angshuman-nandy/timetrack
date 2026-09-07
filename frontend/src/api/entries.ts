import { api } from "./client";
import type { DayKind, Entry, ExportPreview } from "./types";

export const entriesApi = {
  list: (start: string, end: string) => api.get<Entry[]>(`/entries?start=${start}&end=${end}`),
  get: (date: string) => api.get<Entry>(`/entries/${date}`),
  clockIn: (date?: string, plan_text?: string) => api.post<Entry>("/clock-in", { date, plan_text }),
  clockOut: (date?: string, work_text?: string) => api.post<Entry>("/clock-out", { date, work_text }),
  patch: (date: string, patch: Partial<Entry>) => api.patch<Entry>(`/entries/${date}`, patch),
  remove: (date: string) => api.delete<void>(`/entries/${date}`),
  setKind: (date: string, kind: DayKind, reason?: string | null) =>
    api.post<Entry>(`/entries/${date}/time-off`, { kind, reason }),
  summarize: (date: string) => api.post<Entry>(`/entries/${date}/summarize`),
  exportPreview: (start: string, end: string) =>
    api.get<ExportPreview>(`/export/preview?start=${start}&end=${end}`),
};

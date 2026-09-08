export type DayKind = "work" | "time_off" | "holiday";

export interface Entry {
  date: string; // YYYY-MM-DD
  kind: DayKind | null;
  clock_in: string | null; // ISO 8601, UTC
  clock_out: string | null;
  hours: number | null;
  hours_overridden: boolean;
  paused_at: string | null; // ISO 8601, UTC — set while a break is in progress
  break_seconds: number; // accumulated *completed* break time for the day
  plan_text: string | null;
  work_text: string | null;
  project: string | null;
  task: string | null;
  summary: string | null;
  summary_model: string | null;
  summary_generated_at: string | null;
  edited: boolean;
  time_off_reason: string | null;
}

export interface ExportPreview {
  days_in_range: number;
  total_hours: number;
}

export interface ExportColumn {
  header: string;
  field: string;
}

export interface Activity {
  id: number;
  date: string;
  text: string;
  created_at: string; // ISO 8601, UTC
}

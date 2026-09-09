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
  // Consultant Timesheet export fields — optional, blank unless set from Today's
  // "Timesheet details" section or Day detail.
  location: string | null;
  deliverable: string | null;
  category: string | null;
  status: string | null;
  remarks: string | null;
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

/** Header defaults + dropdown option lists for the Consultant Timesheet export
 * format, from consultant_template.json (via GET /export/consultant-template) —
 * one source that Today, Day detail, and the Export overlay all read from. */
export interface ConsultantTemplate {
  consultant_name: string;
  header_defaults: {
    project_program: string;
    vendor_company: string;
    technical_lead: string;
    pmo_reviewer: string;
  };
  field_defaults: {
    location?: string;
    deliverable?: string;
  };
  options: {
    category: string[];
    status: string[];
    location: string[];
  };
}

/** The editable header fields for one Consultant Timesheet download. */
export interface ConsultantHeader {
  consultant_name: string;
  project_program: string;
  vendor_company: string;
  technical_lead: string;
  pmo_reviewer: string;
}

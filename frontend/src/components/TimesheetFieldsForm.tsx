import type { ConsultantTemplate } from "../api/types";
import styles from "./TimesheetFieldsForm.module.css";

/** The five Consultant Timesheet fields that have no other home in the app —
 * shared shape used by both Today's collapsible "Timesheet details" section and
 * Day detail, so the two never drift apart. */
export interface TimesheetFieldsValue {
  location: string;
  deliverable: string;
  category: string;
  status: string;
  remarks: string;
}

export const EMPTY_TIMESHEET_FIELDS: TimesheetFieldsValue = {
  location: "",
  deliverable: "",
  category: "",
  status: "",
  remarks: "",
};

interface TimesheetFieldsFormProps {
  value: TimesheetFieldsValue;
  /** Called on every keystroke/click to keep the field controlled. */
  onFieldChange: (key: keyof TimesheetFieldsValue, value: string) => void;
  /** Called when a value is ready to persist — immediately for the segmented/select
   * controls (a discrete choice, not a keystroke), on blur for the two text fields.
   * Omit it on a screen with its own explicit "Update" button (Day detail), where
   * onFieldChange alone is enough to keep the draft in sync. */
  onFieldCommit?: (key: keyof TimesheetFieldsValue, value: string) => void;
  /** null while /export/consultant-template hasn't loaded yet — the dropdowns and
   * defaults just render empty until it has, rather than blocking the form. */
  template: ConsultantTemplate | null;
}

export function TimesheetFieldsForm({ value, onFieldChange, onFieldCommit, template }: TimesheetFieldsFormProps) {
  const locationOptions = template?.options.location ?? [];
  const statusOptions = template?.options.status ?? [];
  const categoryOptions = template?.options.category ?? [];
  const deliverableDefault = template?.field_defaults.deliverable ?? "MVP";
  const locationDefault = template?.field_defaults.location ?? "Remote";
  const effectiveLocation = value.location || locationDefault;

  return (
    <>
      <div className={styles.fieldGroup}>
        <span className={styles.eyebrow}>LOCATION</span>
        <div className={styles.segmented}>
          {locationOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.segment} ${effectiveLocation === opt ? styles.segmentActive : ""}`}
              onClick={() => {
                onFieldChange("location", opt);
                onFieldCommit?.("location", opt);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.eyebrow}>DELIVERABLE / MVP</span>
        <input
          className={styles.fieldInput}
          placeholder={deliverableDefault}
          value={value.deliverable}
          onChange={(e) => onFieldChange("deliverable", e.target.value)}
          onBlur={(e) => onFieldCommit?.("deliverable", e.target.value)}
        />
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.eyebrow}>CATEGORY</span>
        <select
          className={styles.fieldSelect}
          value={value.category}
          onChange={(e) => {
            onFieldChange("category", e.target.value);
            onFieldCommit?.("category", e.target.value);
          }}
        >
          <option value="">Not set</option>
          {categoryOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.eyebrow}>STATUS</span>
        <div className={styles.segmented}>
          {statusOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`${styles.segment} ${value.status === opt ? styles.segmentActive : ""}`}
              onClick={() => {
                const next = value.status === opt ? "" : opt; // tap again to clear
                onFieldChange("status", next);
                onFieldCommit?.("status", next);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.eyebrow}>CONSULTANT REMARKS</span>
        <textarea
          className={styles.textarea}
          placeholder="Optional notes for the timesheet"
          value={value.remarks}
          onChange={(e) => onFieldChange("remarks", e.target.value)}
          onBlur={(e) => onFieldCommit?.("remarks", e.target.value)}
        />
      </div>
    </>
  );
}

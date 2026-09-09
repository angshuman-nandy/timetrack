import { useState } from "react";
import type { ConsultantHeader, ConsultantTemplate } from "../api/types";
import { formatHeaderDate } from "../utils/date";
import { getLastConsultantHeader } from "../utils/consultantHeaderStorage";
import { Spinner } from "./Spinner";
import styles from "./ConsultantHeaderSheet.module.css";

interface Field {
  key: keyof ConsultantHeader;
  label: string;
  placeholder: string;
}

const FIELDS: Field[] = [
  { key: "consultant_name", label: "Consultant Name", placeholder: "Your name" },
  { key: "project_program", label: "Project / Program", placeholder: "Project / program" },
  { key: "vendor_company", label: "Vendor Company", placeholder: "Vendor company" },
  { key: "technical_lead", label: "Technical Lead", placeholder: "Technical lead" },
  { key: "pmo_reviewer", label: "PMO Reviewer", placeholder: "PMO reviewer" },
];

function buildInitialDraft(template: ConsultantTemplate): ConsultantHeader {
  const last = getLastConsultantHeader();
  return {
    consultant_name: last?.consultant_name ?? template.consultant_name,
    project_program: last?.project_program ?? template.header_defaults.project_program,
    vendor_company: last?.vendor_company ?? template.header_defaults.vendor_company,
    technical_lead: last?.technical_lead ?? template.header_defaults.technical_lead,
    pmo_reviewer: last?.pmo_reviewer ?? template.header_defaults.pmo_reviewer,
  };
}

interface ConsultantHeaderSheetProps {
  template: ConsultantTemplate;
  start: string;
  end: string;
  busy: boolean;
  onSubmit: (header: ConsultantHeader) => void;
  onCancel: () => void;
}

/** The overlay for the Consultant Timesheet download — prefilled header fields the
 * client's file needs (consultant name, project/program, vendor, technical lead,
 * PMO reviewer), editable before the file downloads. Deliberately its own component
 * rather than a ConfirmSheet instance: ConfirmSheet dismisses on a scrim click,
 * which would discard five typed fields on a mis-tap, and has no scroll boundary
 * for a form this tall with a phone keyboard up. */
export function ConsultantHeaderSheet({
  template,
  start,
  end,
  busy,
  onSubmit,
  onCancel,
}: ConsultantHeaderSheetProps) {
  const [draft, setDraft] = useState<ConsultantHeader>(() => buildInitialDraft(template));

  function setField(key: keyof ConsultantHeader, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className={styles.scrim}>
      <div className={styles.sheet}>
        <h2 className={styles.sheetTitle}>Consultant Timesheet details</h2>
        <p className={styles.periodLine}>
          {formatHeaderDate(start)} → {formatHeaderDate(end)}
        </p>

        {FIELDS.map(({ key, label, placeholder }) => (
          <div className={styles.fieldGroup} key={key}>
            <span className={styles.eyebrow}>{label.toUpperCase()}</span>
            <input
              className={styles.fieldInput}
              placeholder={placeholder}
              value={draft[key]}
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        ))}

        <button
          className={styles.sheetPrimary}
          disabled={busy}
          onClick={() => onSubmit(draft)}
        >
          {busy && <Spinner size={16} />}
          {busy ? "Building the file…" : "Download"}
        </button>
        <button className={styles.sheetSecondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

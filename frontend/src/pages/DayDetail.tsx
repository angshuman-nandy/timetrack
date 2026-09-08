import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ActivityBoard } from "../components/ActivityBoard";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Spinner } from "../components/Spinner";
import { SkeletonLines } from "../components/SkeletonLines";
import { entriesApi } from "../api/entries";
import type { Activity, DayKind, Entry } from "../api/types";
import { formatClockTime, formatDayDetailDate } from "../utils/date";
import styles from "./DayDetail.module.css";

interface Draft {
  kind: DayKind;
  hoursText: string;
  project: string;
  task: string;
  summary: string;
  reason: string;
}

function toDraft(e: Entry): Draft {
  return {
    kind: e.kind ?? "work",
    hoursText: e.hours != null ? String(e.hours) : "",
    project: e.project ?? "",
    task: e.task ?? "",
    summary: e.summary ?? "",
    reason: e.time_off_reason ?? "",
  };
}

const KIND_LABELS: Record<DayKind, string> = {
  work: "Work",
  time_off: "Time off",
  holiday: "Holiday",
};

export function DayDetail() {
  const { date = "" } = useParams();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    void Promise.all([entriesApi.get(date), entriesApi.listActivities(date)]).then(
      ([e, acts]) => {
        hydrate(e);
        setActivities(acts);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function hydrate(e: Entry) {
    setEntry(e);
    setDraft(toDraft(e));
  }

  const dirty = useMemo(() => {
    if (!entry || !draft) return false;
    const saved = toDraft(entry);
    return (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== saved[k]);
  }, [entry, draft]);

  if (!entry || !draft) {
    return (
      <AppShell>
        <div className={styles.content}>
          <SkeletonLines widths={["40%"]} />
        </div>
      </AppShell>
    );
  }

  const isWork = draft.kind === "work";

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function handleUpdate() {
    if (!draft) return;
    const trimmedHours = draft.hoursText.trim();
    const parsedHours = trimmedHours === "" ? null : Number(trimmedHours);
    if (trimmedHours !== "" && Number.isNaN(parsedHours)) {
      setError("Hours must be a number.");
      return;
    }

    const patch: Partial<Entry> & { time_off_reason?: string | null } = {};
    if (parsedHours !== (entry!.hours ?? null)) patch.hours = parsedHours;
    if (draft.kind !== (entry!.kind ?? "work")) {
      patch.kind = draft.kind;
      patch.time_off_reason = draft.kind === "work" ? null : draft.reason || null;
    } else if (draft.kind !== "work" && draft.reason !== (entry!.time_off_reason ?? "")) {
      patch.time_off_reason = draft.reason || null;
    }
    if (isWork) {
      if (draft.project !== (entry!.project ?? "")) patch.project = draft.project || null;
      if (draft.task !== (entry!.task ?? "")) patch.task = draft.task || null;
      if (draft.summary !== (entry!.summary ?? "")) patch.summary = draft.summary || null;
    }

    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await entriesApi.patch(date, patch);
      hydrate(updated);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (dirty) {
      setShowDiscardConfirm(true);
    } else {
      navigate(-1);
    }
  }

  async function runRegenerate() {
    setShowConfirm(false);
    setGenerating(true);
    try {
      const updated = await entriesApi.summarize(date);
      hydrate(updated);
    } finally {
      setGenerating(false);
    }
  }

  function handleRegenerateClick() {
    if (entry!.edited) {
      setShowConfirm(true);
    } else {
      void runRegenerate();
    }
  }

  const breakNote = entry.break_seconds > 0 ? `, minus ${Math.round(entry.break_seconds / 60)}m break` : "";
  const hoursExplain =
    entry.clock_in && entry.clock_out
      ? `Derived from ${formatClockTime(entry.clock_in)} → ${formatClockTime(entry.clock_out)}${breakNote}. Typing here overrides it.`
      : "Type the hours for this day.";

  return (
    <AppShell
      fixedFooter={
        <div className={styles.updateArea}>
          {dirty && <span className={styles.unsavedTag}>● Unsaved changes</span>}
          <button className={styles.updateButton} onClick={handleUpdate} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Update"}
          </button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <button className={styles.backButton} onClick={handleBack} aria-label="Back">
            ‹
          </button>
          <div className={styles.titleBlock}>
            <h1 className={styles.dateTitle}>{formatDayDetailDate(date)}</h1>
            <span className={`${styles.stateEyebrow} ${isWork ? styles.work : styles.off}`}>
              {isWork ? "WORKED DAY" : draft.kind === "holiday" ? "HOLIDAY" : "TIME OFF"}
            </span>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={styles.section}>
          <span className={styles.eyebrow}>DAY TYPE</span>
          <div className={styles.segmented}>
            {(Object.keys(KIND_LABELS) as DayKind[]).map((k) => (
              <button
                key={k}
                className={`${styles.segment} ${draft.kind === k ? styles.segmentActive : ""}`}
                onClick={() => setField("kind", k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.eyebrow}>HOURS</span>
          <div className={styles.hoursRow}>
            <input
              className={styles.hoursInput}
              inputMode="decimal"
              value={draft.hoursText}
              onChange={(e) => setField("hoursText", e.target.value)}
            />
            <p className={styles.hoursExplain}>{hoursExplain}</p>
          </div>
          {entry.hours_overridden && (
            <p className={styles.overriddenNote}>Overridden — the clock times are kept for reference.</p>
          )}
        </div>

        {isWork && (
          <>
            <div className={styles.pickerRow}>
              <input
                className={styles.pickerField}
                placeholder="Project"
                value={draft.project}
                onChange={(e) => setField("project", e.target.value)}
              />
              <input
                className={`${styles.pickerField} ${styles.taskField}`}
                placeholder="Task"
                value={draft.task}
                onChange={(e) => setField("task", e.target.value)}
              />
            </div>

            <div className={styles.section}>
              <span className={styles.eyebrow}>ACTIVITY BOARD</span>
              <ActivityBoard date={date} activities={activities} onChange={setActivities} />
            </div>

            <div className={styles.section}>
              <div className={styles.labelRow}>
                <span className={styles.eyebrow}>SUMMARY</span>
                {entry.edited && <span className={styles.editedTag}>Edited by hand</span>}
              </div>

              {generating ? (
                <div className={styles.generatingBox}>
                  <div className={styles.generatingRow}>
                    <Spinner size={14} />
                    <span className={styles.eyebrow} style={{ color: "var(--primary)" }}>
                      GENERATING
                    </span>
                  </div>
                  <div className={styles.skeletonStackSmall}>
                    <SkeletonLines widths={["90%", "70%"]} />
                  </div>
                </div>
              ) : (
                <textarea
                  className={styles.textarea}
                  value={draft.summary}
                  onChange={(e) => setField("summary", e.target.value)}
                />
              )}

              <button className={styles.regenerateButton} onClick={handleRegenerateClick} disabled={generating}>
                Regenerate summary
              </button>
            </div>
          </>
        )}

        {!isWork && (
          <div className={styles.section}>
            <span className={styles.eyebrow}>REASON</span>
            <input
              className={styles.reasonInput}
              placeholder="Public holiday, sick, annual leave…"
              value={draft.reason}
              onChange={(e) => setField("reason", e.target.value)}
            />
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmSheet
          title="Overwrite your edits?"
          body="You've changed this summary by hand since it was generated. Regenerating replaces what you wrote."
          primaryLabel="Regenerate anyway"
          onPrimary={runRegenerate}
          secondaryLabel="Keep my version"
          onSecondary={() => setShowConfirm(false)}
        />
      )}

      {showDiscardConfirm && (
        <ConfirmSheet
          title="Discard changes?"
          body="You have unsaved edits on this day. Leaving now discards them."
          primaryLabel="Discard and leave"
          danger
          onPrimary={() => {
            setShowDiscardConfirm(false);
            navigate(-1);
          }}
          secondaryLabel="Keep editing"
          onSecondary={() => setShowDiscardConfirm(false)}
        />
      )}
    </AppShell>
  );
}

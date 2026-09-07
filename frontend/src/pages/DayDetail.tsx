import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Spinner } from "../components/Spinner";
import { SkeletonLines } from "../components/SkeletonLines";
import { entriesApi } from "../api/entries";
import type { Entry } from "../api/types";
import { formatClockTime, formatDayDetailDate } from "../utils/date";
import styles from "./DayDetail.module.css";

export function DayDetail() {
  const { date = "" } = useParams();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [hoursText, setHoursText] = useState("");
  const [project, setProject] = useState("");
  const [task, setTask] = useState("");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showConvertChoices, setShowConvertChoices] = useState(false);

  useEffect(() => {
    void entriesApi.get(date).then(hydrate);
  }, [date]);

  function hydrate(e: Entry) {
    setEntry(e);
    setHoursText(e.hours != null ? String(e.hours) : "");
    setProject(e.project ?? "");
    setTask(e.task ?? "");
    setSummary(e.summary ?? "");
    setReason(e.time_off_reason ?? "");
  }

  if (!entry) {
    return (
      <AppShell>
        <div className={styles.content}>
          <SkeletonLines widths={["40%"]} />
        </div>
      </AppShell>
    );
  }

  const isWork = entry.kind === "work";

  async function saveField(patch: Partial<Entry>) {
    const updated = await entriesApi.patch(date, patch);
    hydrate(updated);
  }

  async function handleHoursBlur() {
    const trimmed = hoursText.trim();
    if (trimmed === "" && entry!.hours == null) return;
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) {
      setHoursText(entry!.hours != null ? String(entry!.hours) : "");
      return;
    }
    if (parsed === entry!.hours) return;
    await saveField({ hours: parsed });
  }

  async function handleProjectBlur() {
    if (project === (entry!.project ?? "")) return;
    await saveField({ project: project || null });
  }

  async function handleTaskBlur() {
    if (task === (entry!.task ?? "")) return;
    await saveField({ task: task || null });
  }

  async function handleSummaryBlur() {
    if (summary === (entry!.summary ?? "")) return;
    await saveField({ summary: summary || null });
  }

  async function handleReasonBlur() {
    if (reason === (entry!.time_off_reason ?? "")) return;
    await saveField({ time_off_reason: reason || null });
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

  async function handleConvert(kind: "time_off" | "holiday" | "work") {
    const updated = await entriesApi.setKind(date, kind, kind === "work" ? null : reason || null);
    hydrate(updated);
    setShowConvertChoices(false);
  }

  const hoursExplain =
    entry.clock_in && entry.clock_out
      ? `Derived from ${formatClockTime(entry.clock_in)} → ${formatClockTime(entry.clock_out)}. Typing here overrides it.`
      : "Type the hours for this day.";

  return (
    <AppShell>
      <div className={styles.content}>
        <div className={styles.header}>
          <button className={styles.backButton} onClick={() => navigate(-1)} aria-label="Back">
            ‹
          </button>
          <div className={styles.titleBlock}>
            <h1 className={styles.dateTitle}>{formatDayDetailDate(date)}</h1>
            <span className={`${styles.stateEyebrow} ${isWork ? styles.work : styles.off}`}>
              {isWork ? "WORKED DAY" : entry.kind === "holiday" ? "HOLIDAY" : "TIME OFF"}
            </span>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.eyebrow}>HOURS</span>
          <div className={styles.hoursRow}>
            <input
              className={styles.hoursInput}
              inputMode="decimal"
              value={hoursText}
              onChange={(e) => setHoursText(e.target.value)}
              onBlur={handleHoursBlur}
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
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={handleProjectBlur}
              />
              <input
                className={styles.pickerField}
                placeholder="Task"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onBlur={handleTaskBlur}
              />
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
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  onBlur={handleSummaryBlur}
                />
              )}

              <button className={styles.regenerateButton} onClick={handleRegenerateClick} disabled={generating}>
                Regenerate summary
              </button>
            </div>
          </>
        )}

        <div className={styles.section}>
          {!showConvertChoices ? (
            <button className={styles.convertRow} onClick={() => (isWork ? setShowConvertChoices(true) : handleConvert("work"))}>
              <span className={styles.convertLabel}>
                {isWork ? "Convert to time off or holiday" : "Convert back to a worked day"}
              </span>
              <span className={styles.chevron}>›</span>
            </button>
          ) : (
            <div className={styles.convertChoices}>
              <button className={styles.convertChoiceButton} onClick={() => handleConvert("time_off")}>
                Time off
              </button>
              <button className={styles.convertChoiceButton} onClick={() => handleConvert("holiday")}>
                Holiday
              </button>
            </div>
          )}
        </div>

        {!isWork && (
          <div className={styles.section}>
            <span className={styles.eyebrow}>REASON</span>
            <input
              className={styles.reasonInput}
              placeholder="Public holiday, sick, annual leave…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={handleReasonBlur}
            />
          </div>
        )}
      </div>

      {showConfirm && (
        <div className={styles.scrim} onClick={() => setShowConfirm(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.sheetTitle}>Overwrite your edits?</h2>
            <p className={styles.sheetBody}>
              You've changed this summary by hand since it was generated. Regenerating replaces
              what you wrote.
            </p>
            <button className={styles.sheetPrimary} onClick={runRegenerate}>
              Regenerate anyway
            </button>
            <button className={styles.sheetSecondary} onClick={() => setShowConfirm(false)}>
              Keep my version
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

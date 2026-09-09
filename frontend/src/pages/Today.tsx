import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ActivityBoard } from "../components/ActivityBoard";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Spinner } from "../components/Spinner";
import { SkeletonLines } from "../components/SkeletonLines";
import { EMPTY_TIMESHEET_FIELDS, TimesheetFieldsForm, type TimesheetFieldsValue } from "../components/TimesheetFieldsForm";
import { entriesApi } from "../api/entries";
import { ApiError } from "../api/client";
import type { Activity, ConsultantTemplate, DayKind, Entry } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useElapsedTimer } from "../hooks/useElapsedTimer";
import { useWorkedElapsed } from "../hooks/useWorkedElapsed";
import { formatClockTime, formatHeaderDate, todayStr } from "../utils/date";
import { buildGreeting } from "../utils/greeting";
import styles from "./Today.module.css";

type ViewState = "loading" | "idle" | "running" | "paused" | "generating" | "done";

/** The collapsed row's one-line summary — defaults stand in for blank fields, same
 * as what the Consultant Timesheet export itself will show for this day. */
function summarizeTimesheetDetails(fields: TimesheetFieldsValue, template: ConsultantTemplate | null): string {
  const location = fields.location || template?.field_defaults.location || "Remote";
  const deliverable = fields.deliverable || template?.field_defaults.deliverable || "MVP";
  return [location, deliverable, fields.category, fields.status].filter(Boolean).join(" · ");
}

export function Today() {
  const navigate = useNavigate();
  const { username } = useAuth();
  const date = todayStr();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [view, setView] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offSheet, setOffSheet] = useState<DayKind | null>(null);
  const [offReason, setOffReason] = useState("");
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [projectText, setProjectText] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [timesheetFields, setTimesheetFields] = useState<TimesheetFieldsValue>(EMPTY_TIMESHEET_FIELDS);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [consultantTemplate, setConsultantTemplate] = useState<ConsultantTemplate | null>(null);

  const isActive = view === "running" || view === "paused";
  const workedElapsed = useWorkedElapsed(
    isActive ? entry?.clock_in ?? null : null,
    entry?.break_seconds ?? 0,
    view === "paused" ? entry?.paused_at ?? null : null,
  );
  const breakElapsed = useElapsedTimer(view === "paused" ? entry?.paused_at ?? null : null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    entriesApi.consultantTemplate().then(setConsultantTemplate).catch(() => {
      // Best-effort — the details section still works with typed-in values, just
      // without the dropdown option lists or the "MVP"/"Remote" placeholders.
    });
  }, []);

  useEffect(() => {
    // Picked once the username is known and kept for the session — a fresh phrase
    // each time you open the app, not a new one on every re-render.
    if (username) setGreeting(buildGreeting(username));
  }, [username]);

  async function refresh() {
    const [e, acts] = await Promise.all([entriesApi.get(date), entriesApi.listActivities(date)]);
    setEntry(e);
    setActivities(acts);
    setProjectText(e.project ?? "");
    setTimesheetFields({
      location: e.location ?? "",
      deliverable: e.deliverable ?? "",
      category: e.category ?? "",
      status: e.status ?? "",
      remarks: e.remarks ?? "",
    });
    setView(
      e.clock_in && e.clock_out
        ? "done"
        : e.clock_in && e.paused_at
          ? "paused"
          : e.clock_in
            ? "running"
            : "idle",
    );
  }

  async function handleProjectBlur() {
    if (projectText === (entry?.project ?? "")) return;
    try {
      const updated = await entriesApi.patch(date, { project: projectText || null });
      setEntry(updated);
    } catch {
      // Best-effort autosave, same as the old to-do textarea — a transient failure
      // here doesn't block clocking in/out.
    }
  }

  function handleTimesheetFieldChange(key: keyof TimesheetFieldsValue, value: string) {
    setTimesheetFields((f) => ({ ...f, [key]: value }));
  }

  async function handleTimesheetFieldCommit(key: keyof TimesheetFieldsValue, value: string) {
    try {
      const updated = await entriesApi.patch(date, { [key]: value || null } as Partial<Entry>);
      setEntry(updated);
    } catch {
      // Best-effort autosave, same as handleProjectBlur — a transient failure here
      // doesn't block clocking in/out.
    }
  }

  async function handleClockIn() {
    setBusy(true);
    setError(null);
    try {
      const e = await entriesApi.clockIn(date);
      setEntry(e);
      setView("running");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't clock in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    const previousView = view; // "running" or "paused" — clocking out from a break is
    // fine (the backend auto-resumes it), but a failure should restore whichever state
    // we were actually in, not always fall back to "running".
    setBusy(true);
    setError(null);
    try {
      const closed = await entriesApi.clockOut(date);
      setEntry(closed);
      setView("generating");
      try {
        const summarized = await entriesApi.summarize(date);
        setEntry(summarized);
      } catch {
        // No LLM configured, or the call failed — the app stays usable; the day is
        // still closed out, just without an auto-written summary. Editable in Day detail.
      }
      setView("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't clock out. Try again.");
      setView(previousView);
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    setBusy(true);
    setError(null);
    try {
      const paused = await entriesApi.pause(date);
      setEntry(paused);
      setView("paused");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a break. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    setError(null);
    try {
      const resumed = await entriesApi.resume(date);
      setEntry(resumed);
      setView("running");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resume. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMarkOff() {
    if (!offSheet) return;
    setBusy(true);
    try {
      await entriesApi.setKind(date, offSheet, offReason || null);
      navigate(`/day/${date}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark the day off.");
      setBusy(false);
      setOffSheet(null);
    }
  }

  function handleReopen() {
    setShowReopenConfirm(true);
  }

  async function confirmReopen() {
    setShowReopenConfirm(false);
    setBusy(true);
    try {
      const reopened = await entriesApi.patch(date, {
        clock_in: null,
        clock_out: null,
        hours: null,
        work_text: null,
        summary: null,
      });
      setEntry(reopened);
      setView("idle");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reopen the day.");
    } finally {
      setBusy(false);
    }
  }

  // Shared by idle/running/paused — the project field and activity board look and
  // behave identically regardless of which of those three states you're in.
  const projectAndBoard = (
    <>
      <div className={styles.projectGroup}>
        <span className={styles.eyebrow}>PROJECT</span>
        <input
          className={styles.projectInput}
          placeholder="Project(s) you're working on…"
          value={projectText}
          onChange={(e) => setProjectText(e.target.value)}
          onBlur={handleProjectBlur}
        />
      </div>
      <div className={styles.todoGroup}>
        <span className={styles.eyebrow}>ACTIVITY BOARD</span>
        <ActivityBoard date={date} activities={activities} onChange={setActivities} />
      </div>
      <div className={styles.detailsGroup}>
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setDetailsOpen((o) => !o)}
        >
          <span className={styles.eyebrow}>TIMESHEET DETAILS</span>
          <span className={styles.detailsSummaryText}>
            {detailsOpen ? "Hide" : summarizeTimesheetDetails(timesheetFields, consultantTemplate)}
          </span>
        </button>
        {detailsOpen && (
          <div className={styles.detailsBody}>
            <TimesheetFieldsForm
              value={timesheetFields}
              onFieldChange={handleTimesheetFieldChange}
              onFieldCommit={handleTimesheetFieldCommit}
              template={consultantTemplate}
            />
          </div>
        )}
      </div>
    </>
  );

  let fixedFooter: ReactNode = null;
  if (view === "idle") {
    fixedFooter = (
      <div className={styles.actionArea}>
        <button className={styles.primaryButton} onClick={handleClockIn} disabled={busy}>
          Clock In
        </button>
        <div className={styles.secondaryRow}>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setOffReason("");
              setOffSheet("time_off");
            }}
            disabled={busy}
          >
            Time off
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setOffReason("");
              setOffSheet("holiday");
            }}
            disabled={busy}
          >
            Holiday
          </button>
        </div>
      </div>
    );
  } else if (view === "running") {
    fixedFooter = (
      <div className={styles.actionArea}>
        <button className={styles.primaryButton} onClick={handleClockOut} disabled={busy}>
          Clock Out
        </button>
        <button className={styles.primaryButtonAlt} onClick={handlePause} disabled={busy}>
          Take a break
        </button>
      </div>
    );
  } else if (view === "paused") {
    fixedFooter = (
      <div className={styles.actionArea}>
        <button className={styles.primaryButton} onClick={handleResume} disabled={busy}>
          Resume
        </button>
        <button className={styles.primaryButtonAlt} onClick={handleClockOut} disabled={busy}>
          Clock Out
        </button>
      </div>
    );
  }

  return (
    <AppShell fixedFooter={fixedFooter}>
      <div className={styles.content}>
        {greeting && <p className={styles.greeting}>{greeting}</p>}
        <div className={styles.header}>
          <h1 className={styles.title}>Today</h1>
          <span className={styles.date}>{formatHeaderDate(date)}</span>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {view === "loading" && (
          <div className={styles.card}>
            <div className={styles.skeletonStack}>
              <SkeletonLines widths={["60%"]} />
            </div>
          </div>
        )}

        {view === "idle" && (
          <>
            <div className={styles.card}>
              <span className={styles.eyebrow}>NOT STARTED</span>
              <p className={styles.bodyText}>No hours logged yet today.</p>
            </div>
            {projectAndBoard}
          </>
        )}

        {view === "running" && entry?.clock_in && (
          <>
            <div className={`${styles.card} ${styles.timerCard}`}>
              <div className={styles.eyebrowRow}>
                <span className={styles.pulseDot} />
                <span className={styles.eyebrowInProgress}>IN PROGRESS</span>
              </div>
              <p className={styles.elapsed}>{workedElapsed}</p>
              <p className={styles.subLine}>
                Clocked in at {formatClockTime(entry.clock_in)}
                {entry.break_seconds > 0 && ` · ${Math.round(entry.break_seconds / 60)}m on break so far`}
              </p>
            </div>
            {projectAndBoard}
          </>
        )}

        {view === "paused" && entry?.clock_in && entry.paused_at && (
          <>
            <div className={`${styles.card} ${styles.breakCard}`}>
              <div className={styles.eyebrowRow}>
                <span className={styles.breakDot} />
                <span className={styles.eyebrowBreak}>ON BREAK</span>
              </div>
              <p className={styles.elapsed}>{breakElapsed}</p>
              <p className={styles.subLine}>
                {workedElapsed} worked so far · paused at {formatClockTime(entry.paused_at)}
              </p>
            </div>
            {projectAndBoard}
          </>
        )}

        {view === "generating" && (
          <div className={styles.card}>
            <div className={styles.eyebrowRow}>
              <Spinner size={16} />
              <span className={styles.eyebrowPrimary}>WRITING YOUR SUMMARY</span>
            </div>
            <div className={styles.skeletonStack}>
              <SkeletonLines />
            </div>
            <p className={styles.footnote}>
              {entry?.hours ?? 0} h logged. This takes a couple of seconds — you can leave the screen.
            </p>
          </div>
        )}

        {view === "done" && entry && (
          <>
            <div className={styles.summaryCard}>
              <div className={styles.summaryTop}>
                <div className={styles.summaryHeaderRow}>
                  <div className={styles.summaryHeaderLeft}>
                    <span className={styles.completeSquare} />
                    <span className={styles.eyebrowPrimary}>DAY COMPLETE</span>
                  </div>
                  <span className={styles.hoursValue}>{entry.hours ?? 0} h</span>
                </div>
                <p className={styles.description}>
                  {entry.summary || "No summary yet — edit this day to add one."}
                </p>
                <div className={styles.metaRow}>
                  {entry.clock_in && entry.clock_out && (
                    <span>
                      {formatClockTime(entry.clock_in)} → {formatClockTime(entry.clock_out)}
                    </span>
                  )}
                  {entry.project && <span>{entry.project}</span>}
                </div>
              </div>
              <button className={styles.footerStrip} onClick={() => navigate(`/day/${date}`)}>
                Edit this day
              </button>
            </div>
            <button className={styles.reopenButton} onClick={handleReopen} disabled={busy}>
              Reopen the day
            </button>
          </>
        )}
      </div>

      {offSheet && (
        <ConfirmSheet
          title={offSheet === "holiday" ? "Mark today as a holiday?" : "Mark today as time off?"}
          body="Optionally add a reason — it shows up on the export."
          primaryLabel={offSheet === "holiday" ? "Mark as holiday" : "Mark as time off"}
          onPrimary={confirmMarkOff}
          secondaryLabel="Cancel"
          onSecondary={() => setOffSheet(null)}
        >
          <input
            className={styles.reasonInput}
            placeholder="Public holiday, sick, annual leave…"
            value={offReason}
            onChange={(e) => setOffReason(e.target.value)}
            autoFocus
          />
        </ConfirmSheet>
      )}

      {showReopenConfirm && (
        <ConfirmSheet
          title="Reopen this day?"
          body="This clears today's clock-in/out times, hours, and summary so you can start over. There's no way back to the completed version once you confirm."
          primaryLabel="Reopen the day"
          danger
          onPrimary={confirmReopen}
          secondaryLabel="Keep as is"
          onSecondary={() => setShowReopenConfirm(false)}
        />
      )}
    </AppShell>
  );
}

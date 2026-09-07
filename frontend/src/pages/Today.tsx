import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Spinner } from "../components/Spinner";
import { SkeletonLines } from "../components/SkeletonLines";
import { entriesApi } from "../api/entries";
import { ApiError } from "../api/client";
import type { Entry } from "../api/types";
import { useElapsedTimer } from "../hooks/useElapsedTimer";
import { formatClockTime, formatHeaderDate, todayStr } from "../utils/date";
import styles from "./Today.module.css";

// The design's single "to-do list" textarea persists across the whole day: at Clock In
// its content is saved as plan_text (the morning intent), and whatever it holds at
// Clock Out time doubles as work_text (the evening description) — one input control,
// matching the shipped design, that still fills both backend fields meaningfully.
type ViewState = "loading" | "idle" | "running" | "generating" | "done";

export function Today() {
  const navigate = useNavigate();
  const date = todayStr();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [notes, setNotes] = useState("");
  const [view, setView] = useState<ViewState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const elapsed = useElapsedTimer(view === "running" ? entry?.clock_in ?? null : null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const e = await entriesApi.get(date);
    setEntry(e);
    setNotes(e.plan_text ?? "");
    setView(e.clock_in && e.clock_out ? "done" : e.clock_in ? "running" : "idle");
  }

  async function handleClockIn() {
    setBusy(true);
    setError(null);
    try {
      const e = await entriesApi.clockIn(date, notes || undefined);
      setEntry(e);
      setView("running");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't clock in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setBusy(true);
    setError(null);
    try {
      const closed = await entriesApi.clockOut(date, notes || undefined);
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
      setView("running");
    } finally {
      setBusy(false);
    }
  }

  async function handleNotesBlur() {
    if (view !== "idle" && view !== "running") return;
    if (notes === (entry?.plan_text ?? "")) return;
    try {
      const updated = await entriesApi.patch(date, { plan_text: notes || null });
      setEntry(updated);
    } catch {
      // Best-effort autosave — the next successful clock-in/out call carries the text
      // regardless, so a transient failure here doesn't lose the user's words.
    }
  }

  async function handleMarkOff(kind: "time_off" | "holiday") {
    setBusy(true);
    try {
      await entriesApi.setKind(date, kind);
      navigate(`/day/${date}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark the day off.");
      setBusy(false);
    }
  }

  async function handleReopen() {
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
      setNotes(reopened.plan_text ?? "");
      setView("idle");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reopen the day.");
    } finally {
      setBusy(false);
    }
  }

  let fixedFooter: ReactNode = null;
  if (view === "idle") {
    fixedFooter = (
      <div className={styles.actionArea}>
        <button className={styles.primaryButton} onClick={handleClockIn} disabled={busy}>
          Clock In
        </button>
        <div className={styles.secondaryRow}>
          <button className={styles.secondaryButton} onClick={() => handleMarkOff("time_off")} disabled={busy}>
            Time off
          </button>
          <button className={styles.secondaryButton} onClick={() => handleMarkOff("holiday")} disabled={busy}>
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
      </div>
    );
  }

  return (
    <AppShell fixedFooter={fixedFooter}>
      <div className={styles.content}>
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
            <div className={styles.todoGroup}>
              <div className={styles.todoLabelRow}>
                <span className={styles.eyebrow}>TO-DO LIST</span>
                <span className={styles.optionalTag}>Optional</span>
              </div>
              <textarea
                className={styles.textarea}
                placeholder="What's on for today? Skip it if you'd rather just start."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>
          </>
        )}

        {view === "running" && entry?.clock_in && (
          <>
            <div className={`${styles.card} ${styles.timerCard}`}>
              <div className={styles.eyebrowRow}>
                <span className={styles.pulseDot} />
                <span className={styles.eyebrowInProgress}>IN PROGRESS</span>
              </div>
              <p className={styles.elapsed}>{elapsed}</p>
              <p className={styles.subLine}>Clocked in at {formatClockTime(entry.clock_in)}</p>
            </div>
            <div className={styles.todoGroup}>
              <div className={styles.todoLabelRow}>
                <span className={styles.eyebrow}>TO-DO LIST</span>
                <span className={styles.optionalTag}>Optional</span>
              </div>
              <textarea
                className={`${styles.textarea} ${styles.running}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>
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
    </AppShell>
  );
}

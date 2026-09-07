import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { entriesApi } from "../api/entries";
import type { DayKind, Entry } from "../api/types";
import { daysInMonth, monthLabel, mondayIndex, ymd } from "../utils/date";
import styles from "./Calendar.module.css";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const LEGEND = [
  { label: "Worked", varName: "--worked" },
  { label: "In progress", varName: "--in-progress" },
  { label: "Time off", varName: "--time-off" },
  { label: "Holiday", varName: "--holiday" },
];
const LONG_PRESS_MS = 500;

type CellState = "worked" | "inProgress" | "timeOff" | "holiday" | "weekend" | "empty";

function cellState(entry: Entry | undefined, isWeekend: boolean): CellState {
  if (entry?.kind === "work") {
    if (entry.clock_in && !entry.clock_out) return "inProgress";
    // Worked also covers a day whose hours/summary were typed in by hand on Day
    // detail rather than produced by clocking in/out — it must colour the same as a
    // clocked day, not fall through to "empty".
    if (entry.clock_out || entry.hours != null || entry.summary) return "worked";
    return isWeekend ? "weekend" : "empty";
  }
  if (entry?.kind === "time_off") return "timeOff";
  if (entry?.kind === "holiday") return "holiday";
  return isWeekend ? "weekend" : "empty";
}

function cellTag(state: CellState, entry: Entry | undefined): string | null {
  if (state === "worked") return (entry?.hours ?? 0).toFixed(1);
  if (state === "inProgress") return (entry?.hours ?? 0).toFixed(1);
  if (state === "timeOff") return "OFF";
  if (state === "holiday") return "HOL";
  return null;
}

function hasLoggedWork(entry: Entry | undefined): boolean {
  return !!entry && entry.kind === "work" && (!!entry.clock_out || entry.hours != null || !!entry.summary);
}

export function Calendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const [bulkKind, setBulkKind] = useState<DayKind | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function loadMonth() {
    setLoading(true);
    const start = ymd(year, month, 1);
    const end = ymd(year, month, daysInMonth(year, month));
    const rows = await entriesApi.list(start, end);
    const map: Record<string, Entry> = {};
    for (const e of rows) map[e.date] = e;
    setEntries(map);
    setLoading(false);
  }

  function goToMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function startPress(dateStr: string) {
    longPressFired.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setSelectionMode(true);
      setSelected(new Set([dateStr]));
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handleCellTap(dateStr: string) {
    if (longPressFired.current) {
      // This is the click/tap that follows the long-press that just entered
      // selection mode — the day is already selected; don't toggle it back off.
      longPressFired.current = false;
      return;
    }
    if (selectionMode) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(dateStr)) next.delete(dateStr);
        else next.add(dateStr);
        return next;
      });
    } else {
      navigate(`/day/${dateStr}`);
    }
  }

  useEffect(() => {
    if (selectionMode && selected.size === 0) exitSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selectedWorkedDays = useMemo(
    () => [...selected].filter((d) => hasLoggedWork(entries[d])).sort(),
    [selected, entries],
  );

  async function confirmBulkKind() {
    if (!bulkKind) return;
    setBusy(true);
    try {
      await entriesApi.bulkSetKind([...selected], bulkKind, bulkReason || null);
      await loadMonth();
      exitSelection();
    } finally {
      setBusy(false);
      setBulkKind(null);
      setBulkReason("");
    }
  }

  async function confirmClearActivities() {
    setBusy(true);
    try {
      await Promise.all([...selected].map((d) => entriesApi.clearActivities(d)));
      exitSelection();
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  }

  async function confirmDeleteDays() {
    setBusy(true);
    try {
      await Promise.all([...selected].map((d) => entriesApi.remove(d)));
      await loadMonth();
      exitSelection();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const monthTotal = useMemo(
    () => Object.values(entries).reduce((sum, e) => (e.kind === "work" ? sum + (e.hours ?? 0) : sum), 0),
    [entries],
  );

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = mondayIndex(new Date(year, month, 1));
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  const isEmpty = !loading && Object.keys(entries).length === 0;

  return (
    <AppShell
      fixedFooter={
        selectionMode ? (
          <div className={styles.selectionBar}>
            <div className={styles.selectionHeader}>
              <span className={styles.selectionCount}>{selected.size} day{selected.size === 1 ? "" : "s"} selected</span>
              <button className={styles.selectionClose} onClick={exitSelection} aria-label="Cancel selection">
                ✕
              </button>
            </div>
            <div className={styles.selectionActions}>
              <button
                className={styles.selectionButton}
                onClick={() => {
                  setBulkReason("");
                  setBulkKind("time_off");
                }}
                disabled={busy}
              >
                Time off
              </button>
              <button
                className={styles.selectionButton}
                onClick={() => {
                  setBulkReason("");
                  setBulkKind("holiday");
                }}
                disabled={busy}
              >
                Holiday
              </button>
              <button className={styles.selectionButton} onClick={() => setConfirmClear(true)} disabled={busy}>
                Clear activities
              </button>
              <button
                className={styles.selectionButtonDanger}
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null
      }
    >
      <div className={styles.content}>
        <div className={styles.headerBlock}>
          <div className={styles.headerRow1}>
            <h1 className={styles.title}>Calendar</h1>
            <div className={styles.navButtons}>
              <button className={styles.navButton} onClick={() => goToMonth(-1)} aria-label="Previous month">
                ‹
              </button>
              <button className={styles.navButton} onClick={() => goToMonth(1)} aria-label="Next month">
                ›
              </button>
            </div>
          </div>
          <div className={styles.headerRow2}>
            <span className={styles.monthLabel}>{monthLabel(year, month)}</span>
            <div className={styles.monthTotal}>
              <span className={styles.monthTotalValue}>{monthTotal.toFixed(1)}</span>
              <span className={styles.monthTotalLabel}>HOURS</span>
            </div>
          </div>
        </div>

        <div
          onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || selectionMode) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 60) goToMonth(dx > 0 ? -1 : 1);
            touchStartX.current = null;
          }}
        >
          <div className={styles.grid}>
            {WEEKDAY_LABELS.map((w, i) => (
              <div key={i} className={styles.weekdayHeader}>
                {w}
              </div>
            ))}

            {loading &&
              Array.from({ length: 35 }, (_, i) => <div key={i} className={styles.cell} />)}

            {!loading &&
              cells.map((day, i) => {
                if (day === null) return <div key={i} />;
                const dateStr = ymd(year, month, day);
                const dow = new Date(year, month, day).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const entry = entries[dateStr];
                const state = cellState(entry, isWeekend);
                const tag = cellTag(state, entry);
                const isSelected = selected.has(dateStr);
                return (
                  <button
                    key={i}
                    className={styles.cellButton}
                    onMouseDown={() => startPress(dateStr)}
                    onMouseUp={cancelPress}
                    onMouseLeave={cancelPress}
                    onTouchStart={() => startPress(dateStr)}
                    onTouchEnd={cancelPress}
                    onTouchCancel={cancelPress}
                    onClick={() => handleCellTap(dateStr)}
                  >
                    <div
                      className={`${styles.cell} ${styles[state]} ${isSelected ? styles.selected : ""}`}
                    >
                      <span className={styles.dayNumber}>{day}</span>
                      {tag && <span className={styles.tag}>{tag}</span>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {isEmpty && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>Nothing logged in {monthLabel(year, month)}</p>
            <p className={styles.emptyBody}>
              Tap any day to add hours by hand, or clock in from Today. Long-press to select
              multiple days.
            </p>
          </div>
        )}

        {!isEmpty && (
          <div className={styles.legend}>
            {LEGEND.map(({ label, varName }) => (
              <div key={label} className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: `var(${varName})` }} />
                {label}
              </div>
            ))}
          </div>
        )}
      </div>

      {bulkKind && (
        <ConfirmSheet
          title={`Mark ${selected.size} day${selected.size === 1 ? "" : "s"} as ${bulkKind === "holiday" ? "holiday" : "time off"}?`}
          body={
            <>
              <p className={styles.confirmDates}>{[...selected].sort().join(", ")}</p>
              {selectedWorkedDays.length > 0 && (
                <p className={styles.confirmWarning}>
                  ⚠ {selectedWorkedDays.length} of these already {selectedWorkedDays.length === 1 ? "has" : "have"} logged
                  work ({selectedWorkedDays.join(", ")}). Their hours, clock times and summary
                  will be cleared.
                </p>
              )}
            </>
          }
          primaryLabel={busy ? "Saving…" : `Mark as ${bulkKind === "holiday" ? "holiday" : "time off"}`}
          onPrimary={confirmBulkKind}
          onSecondary={() => setBulkKind(null)}
        >
          <input
            className={styles.reasonInput}
            placeholder="Reason (optional)"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
          />
        </ConfirmSheet>
      )}

      {confirmClear && (
        <ConfirmSheet
          title={`Clear activities for ${selected.size} day${selected.size === 1 ? "" : "s"}?`}
          body="Logged activity entries for these days will be removed. Hours and summaries are kept."
          primaryLabel={busy ? "Clearing…" : "Clear activities"}
          onPrimary={confirmClearActivities}
          onSecondary={() => setConfirmClear(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmSheet
          title={`Delete ${selected.size} day${selected.size === 1 ? "" : "s"}?`}
          body="This removes all hours, clock times, activities and summaries for these days. This can't be undone."
          primaryLabel={busy ? "Deleting…" : "Delete"}
          danger
          onPrimary={confirmDeleteDays}
          onSecondary={() => setConfirmDelete(false)}
        />
      )}
    </AppShell>
  );
}

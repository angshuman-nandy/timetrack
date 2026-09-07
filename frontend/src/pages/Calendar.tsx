import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { entriesApi } from "../api/entries";
import type { Entry } from "../api/types";
import { daysInMonth, monthLabel, mondayIndex, ymd } from "../utils/date";
import styles from "./Calendar.module.css";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const LEGEND = [
  { label: "Worked", varName: "--worked" },
  { label: "In progress", varName: "--in-progress" },
  { label: "Time off", varName: "--time-off" },
  { label: "Holiday", varName: "--holiday" },
];

type CellState = "worked" | "inProgress" | "timeOff" | "holiday" | "weekend" | "empty";

function cellState(entry: Entry | undefined, isWeekend: boolean): CellState {
  if (entry?.kind === "work") return entry.clock_out ? "worked" : entry.clock_in ? "inProgress" : "empty";
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

export function Calendar() {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = ymd(year, month, 1);
    const end = ymd(year, month, daysInMonth(year, month));
    entriesApi.list(start, end).then((rows) => {
      if (cancelled) return;
      const map: Record<string, Entry> = {};
      for (const e of rows) map[e.date] = e;
      setEntries(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  function goToMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
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
    <AppShell>
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
            if (touchStartX.current === null) return;
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
                return (
                  <button
                    key={i}
                    className={styles.cellButton}
                    onClick={() => navigate(`/day/${dateStr}`)}
                  >
                    <div className={`${styles.cell} ${styles[state]}`}>
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
              Tap any day to add hours by hand, or clock in from Today.
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
    </AppShell>
  );
}

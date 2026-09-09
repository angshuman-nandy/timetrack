import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Spinner } from "../components/Spinner";
import { entriesApi } from "../api/entries";
import { downloadExport } from "../api/client";
import type { ExportColumn } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { daysInMonth, ymd } from "../utils/date";
import styles from "./Export.module.css";

// Date anchors every row in the export and every other field is exported relative to
// it — dropping it would leave a sheet of numbers with no day to attach them to, so
// it's always included and shown as such rather than offered as a toggle.
const REQUIRED_FIELD = "date";

type Preset = "this_month" | "last_month" | "custom";
type Format = "xlsx" | "csv";

function monthRange(year: number, month: number): [string, string] {
  return [ymd(year, month, 1), ymd(year, month, daysInMonth(year, month))];
}

function presetRange(preset: Preset, customStart: string, customEnd: string): [string, string] {
  const today = new Date();
  if (preset === "this_month") return monthRange(today.getFullYear(), today.getMonth());
  if (preset === "last_month") {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return monthRange(d.getFullYear(), d.getMonth());
  }
  return [customStart, customEnd];
}

function formatRangeLabel(start: string, end: string): string {
  return `${start} to ${end}`;
}

export function Export() {
  const { logout } = useAuth();
  const today = new Date();
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customStart, setCustomStart] = useState(ymd(today.getFullYear(), today.getMonth(), 1));
  const [customEnd, setCustomEnd] = useState(ymd(today.getFullYear(), today.getMonth(), today.getDate()));
  const [format, setFormat] = useState<Format>("xlsx");
  const [preview, setPreview] = useState<{ days_in_range: number; total_hours: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ExportColumn[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const [start, end] = presetRange(preset, customStart, customEnd);

  useEffect(() => {
    let cancelled = false;
    entriesApi.exportPreview(start, end).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  useEffect(() => {
    let cancelled = false;
    entriesApi.exportColumns().then((cols) => {
      if (cancelled) return;
      setColumns(cols);
      setSelectedFields(new Set(cols.map((c) => c.field))); // default: everything included
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleField(field: string) {
    if (field === REQUIRED_FIELD) return;
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadExport(start, end, format, [...selectedFields]);
    } catch {
      setError("The server didn't respond. Your hours are safe — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  const [thisMonthStart, thisMonthEnd] = monthRange(today.getFullYear(), today.getMonth());
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [lastMonthStart, lastMonthEnd] = monthRange(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  return (
    <AppShell>
      <div className={styles.content}>
        <h1 className={styles.title}>Export</h1>

        <div>
          <span className={styles.sectionLabel}>Range</span>
          <div className={styles.optionStack}>
            <button
              className={`${styles.optionRow} ${preset === "this_month" ? styles.selected : ""}`}
              onClick={() => setPreset("this_month")}
            >
              <span className={styles.optionLabel}>This month</span>
              <span className={styles.optionHint}>{formatRangeLabel(thisMonthStart, thisMonthEnd)}</span>
            </button>
            <button
              className={`${styles.optionRow} ${preset === "last_month" ? styles.selected : ""}`}
              onClick={() => setPreset("last_month")}
            >
              <span className={styles.optionLabel}>Last month</span>
              <span className={styles.optionHint}>{formatRangeLabel(lastMonthStart, lastMonthEnd)}</span>
            </button>
            <button
              className={`${styles.optionRow} ${preset === "custom" ? styles.selected : ""}`}
              onClick={() => setPreset("custom")}
            >
              <span className={styles.optionLabel}>Custom range</span>
              <span className={styles.optionHint}>
                {preset === "custom" ? formatRangeLabel(customStart, customEnd) : "Pick dates"}
              </span>
            </button>
            {preset === "custom" && (
              <div className={styles.customDates}>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <input
                  type="date"
                  className={styles.dateInput}
                  value={customEnd}
                  min={customStart}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <span className={styles.sectionLabel}>Format</span>
          <div className={styles.formatRow}>
            <button
              className={`${styles.formatButton} ${format === "xlsx" ? styles.selected : ""}`}
              onClick={() => setFormat("xlsx")}
            >
              Excel
            </button>
            <button
              className={`${styles.formatButton} ${format === "csv" ? styles.selected : ""}`}
              onClick={() => setFormat("csv")}
            >
              CSV
            </button>
          </div>
        </div>

        <div>
          <span className={styles.sectionLabel}>Fields</span>
          <div className={styles.optionStack}>
            {columns.map((col) => {
              const required = col.field === REQUIRED_FIELD;
              const selected = required || selectedFields.has(col.field);
              return (
                <button
                  key={col.field}
                  className={`${styles.optionRow} ${selected ? styles.selected : ""}`}
                  onClick={() => toggleField(col.field)}
                  disabled={required}
                >
                  <span className={styles.optionLabel}>{col.header}</span>
                  <span className={styles.checkbox}>
                    {required ? "Always included" : selected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.previewCard}>
          <span className={styles.previewLabel}>Before you send</span>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{preview?.days_in_range ?? "–"}</span>
              <span className={styles.statLabel}>days in range</span>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statValue} ${styles.accent}`}>
                {preview ? preview.total_hours.toFixed(1) : "–"}
              </span>
              <span className={styles.statLabel}>total hours</span>
            </div>
          </div>
          <p className={styles.previewFootnote}>
            {formatRangeLabel(start, end)}, as {format === "xlsx" ? "Excel" : "CSV"}. Days marked
            time off or holiday are listed with zero hours.
          </p>
        </div>

        {error && (
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>Couldn't build the file</p>
            <p className={styles.errorBody}>{error}</p>
          </div>
        )}

        <button
          className={`${styles.downloadButton} ${downloading ? styles.working : ""}`}
          onClick={handleDownload}
          disabled={downloading || selectedFields.size === 0}
        >
          {downloading && <Spinner size={16} />}
          {downloading
            ? "Building the file…"
            : selectedFields.size === 0
              ? "Select at least one field"
              : `Download ${format === "xlsx" ? "Excel" : "CSV"}`}
        </button>

        <button className={styles.logoutButton} onClick={logout}>
          Log out
        </button>
      </div>
    </AppShell>
  );
}

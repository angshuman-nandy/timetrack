import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConsultantHeaderSheet } from "../components/ConsultantHeaderSheet";
import { Spinner } from "../components/Spinner";
import { entriesApi } from "../api/entries";
import { downloadConsultantExport, downloadExport } from "../api/client";
import type { ConsultantHeader, ConsultantTemplate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { setLastConsultantHeader } from "../utils/consultantHeaderStorage";
import { daysInMonth, ymd } from "../utils/date";
import styles from "./Export.module.css";

type Preset = "this_month" | "last_month" | "custom";
type Format = "xlsx" | "csv" | "consultant";

const FORMAT_LABELS: Record<Format, string> = { xlsx: "Excel", csv: "CSV", consultant: "Consultant" };

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

  // Consultant format: header defaults are fetched lazily (only once the format is
  // actually picked) rather than on mount, so the other two formats don't pay for it.
  const [consultantTemplate, setConsultantTemplate] = useState<ConsultantTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [showHeaderSheet, setShowHeaderSheet] = useState(false);

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

  async function handleDownload() {
    setError(null);

    if (format === "consultant") {
      if (consultantTemplate) {
        setShowHeaderSheet(true);
        return;
      }
      setLoadingTemplate(true);
      try {
        setConsultantTemplate(await entriesApi.consultantTemplate());
        setShowHeaderSheet(true);
      } catch {
        setError("Couldn't load the timesheet details. Try again in a moment.");
      } finally {
        setLoadingTemplate(false);
      }
      return;
    }

    setDownloading(true);
    try {
      await downloadExport(start, end, format);
    } catch {
      setError("The server didn't respond. Your hours are safe — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleConsultantSubmit(header: ConsultantHeader) {
    setDownloading(true);
    setError(null);
    try {
      await downloadConsultantExport(start, end, header);
      setLastConsultantHeader(header);
      setShowHeaderSheet(false);
    } catch {
      setError("The server didn't respond. Your hours are safe — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  const [thisMonthStart, thisMonthEnd] = monthRange(today.getFullYear(), today.getMonth());
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const [lastMonthStart, lastMonthEnd] = monthRange(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const isConsultant = format === "consultant";
  const downloadDisabled = downloading || loadingTemplate;

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
            <button
              className={`${styles.formatButton} ${isConsultant ? styles.selected : ""}`}
              onClick={() => setFormat("consultant")}
            >
              Consultant
            </button>
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
            {isConsultant
              ? `${formatRangeLabel(start, end)}. Every weekday in the range is listed on the sheet — days with nothing logged show zero hours. You'll fill in the consultant details next.`
              : `${formatRangeLabel(start, end)}, as ${FORMAT_LABELS[format]}. Days marked time off or holiday are listed with zero hours.`}
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
          disabled={downloadDisabled}
        >
          {(downloading || loadingTemplate) && <Spinner size={16} />}
          {downloading
            ? "Building the file…"
            : loadingTemplate
              ? "Loading…"
              : `Download ${FORMAT_LABELS[format]}`}
        </button>

        <button className={styles.logoutButton} onClick={logout}>
          Log out
        </button>
      </div>

      {showHeaderSheet && consultantTemplate && (
        <ConsultantHeaderSheet
          template={consultantTemplate}
          start={start}
          end={end}
          busy={downloading}
          onSubmit={handleConsultantSubmit}
          onCancel={() => setShowHeaderSheet(false)}
        />
      )}
    </AppShell>
  );
}

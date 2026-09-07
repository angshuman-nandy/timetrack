import type { ReactNode } from "react";
import styles from "./ConfirmSheet.module.css";

interface ConfirmSheetProps {
  title: string;
  body: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary: () => void;
  /** Renders the primary action in the error palette — for destructive confirmations
   * (Delete day) rather than the default "regenerate/overwrite" green. */
  danger?: boolean;
  /** Extra content between the body and the buttons — e.g. a reason input. */
  children?: ReactNode;
}

/** The bottom confirmation sheet, lifted out of Day detail (where it first shipped for
 * "overwrite your edits?") so Today and Calendar can reuse the same pattern for
 * time-off/holiday reasons and bulk-action warnings. */
export function ConfirmSheet({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel = "Cancel",
  onSecondary,
  danger = false,
  children,
}: ConfirmSheetProps) {
  return (
    <div className={styles.scrim} onClick={onSecondary}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.sheetTitle}>{title}</h2>
        <div className={styles.sheetBody}>{body}</div>
        {children}
        <button
          className={danger ? styles.sheetDanger : styles.sheetPrimary}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
        <button className={styles.sheetSecondary} onClick={onSecondary}>
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}

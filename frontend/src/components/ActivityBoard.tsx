import { useState } from "react";
import { entriesApi } from "../api/entries";
import type { Activity } from "../api/types";
import { formatClockTime } from "../utils/date";
import styles from "./ActivityBoard.module.css";

interface ActivityBoardProps {
  date: string;
  activities: Activity[];
  onChange: (activities: Activity[]) => void;
}

/** A live, timestamped log of one-liners for a day — added over time on Today while
 * clocked in, or filled in by hand on Day detail for a past day. Add/delete write
 * through immediately rather than joining Day detail's draft-and-Update buffer: the
 * board is a log, not a field you compose and then commit. */
export function ActivityBoard({ date, activities, onChange }: ActivityBoardProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const activity = await entriesApi.addActivity(date, trimmed);
      onChange([...activities, activity]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    onChange(activities.filter((a) => a.id !== id));
    try {
      await entriesApi.deleteActivity(id);
    } catch {
      // Best-effort — a failed delete just leaves it out of this render; the next
      // refresh from the server will restore it if it's still there.
    }
  }

  return (
    <div className={styles.board}>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="Add an activity…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button className={styles.addButton} onClick={handleAdd} disabled={busy || !text.trim()} aria-label="Add">
          ⏎
        </button>
      </div>

      {activities.length === 0 ? (
        <p className={styles.empty}>Nothing logged yet.</p>
      ) : (
        <ul className={styles.list}>
          {activities.map((a) => (
            <li key={a.id} className={styles.item}>
              <span className={styles.time}>{formatClockTime(a.created_at)}</span>
              <span className={styles.text}>{a.text}</span>
              <button className={styles.remove} onClick={() => handleDelete(a.id)} aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { formatHMS } from "../utils/date";

/** Derives elapsed time from a stored ISO timestamp, ticking every second — never
 * an in-memory counter, since the app can be closed mid-day and reopened later (per the
 * design handoff's state-management notes). Used both for the main clocked-in timer and
 * for the break timer while paused (elapsed since `paused_at`). */
export function useElapsedTimer(sinceIso: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sinceIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sinceIso]);

  if (!sinceIso) return "00:00:00";

  const elapsedMs = Math.max(0, now - new Date(sinceIso).getTime());
  return formatHMS(Math.floor(elapsedMs / 1000));
}

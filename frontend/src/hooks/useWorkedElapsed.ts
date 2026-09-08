import { useEffect, useState } from "react";
import { formatHMS } from "../utils/date";

/** Elapsed *worked* time since clock-in — net of completed break time, and frozen
 * (not ticking) at the moment a break starts rather than counting through it. The
 * clock genuinely stops billing on a break, matching backend/routers/entries.py's
 * hours calculation (clock_out - clock_in - break_seconds). */
export function useWorkedElapsed(
  clockInIso: string | null,
  breakSeconds: number,
  pausedAtIso: string | null,
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clockInIso || pausedAtIso) return; // not running, or frozen on a break
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockInIso, pausedAtIso]);

  if (!clockInIso) return "00:00:00";

  const endMs = pausedAtIso ? new Date(pausedAtIso).getTime() : now;
  const elapsedMs = Math.max(0, endMs - new Date(clockInIso).getTime() - breakSeconds * 1000);
  return formatHMS(Math.floor(elapsedMs / 1000));
}

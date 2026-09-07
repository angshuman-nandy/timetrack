import { useEffect, useState } from "react";

/** Derives elapsed time from the stored clock-in timestamp, ticking every second — never
 * an in-memory counter, since the app can be closed mid-day and reopened later (per the
 * design handoff's state-management notes). */
export function useElapsedTimer(clockInIso: string | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clockInIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clockInIso]);

  if (!clockInIso) return "00:00:00";

  const elapsedMs = Math.max(0, now - new Date(clockInIso).getTime());
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

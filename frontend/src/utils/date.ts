// Client-side date formatting only. "Which day is today" for actual clock-in/out
// bucketing is always decided server-side (APP_TIMEZONE) — this just needs to agree
// with the server closely enough for the initial page load, which holds as long as the
// phone's local timezone matches the server's configured one (true for a personal app
// used from one place).

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_CAPS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "MON 7 SEP" — the Today header's date. */
export function formatHeaderDate(dateStr: string): string {
  const d = parseLocal(dateStr);
  return `${WEEKDAYS_CAPS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()].toUpperCase()}`;
}

/** "Fri 4 Sep" — Day detail's title. */
export function formatDayDetailDate(dateStr: string): string {
  const d = parseLocal(dateStr);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "September 2026" — Calendar's month label. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`;
}

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Weekday index with Monday = 0 (the calendar grid starts on Monday). */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** HH:MM in the viewer's local time, from a UTC ISO timestamp — for "Clocked in at 09:02". */
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** HH:MM:SS from a total second count — shared by the running-timer and break-timer
 * hooks so the two elapsed displays format identically. */
export function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

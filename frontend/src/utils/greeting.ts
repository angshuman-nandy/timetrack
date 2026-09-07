// A varying, time-of-day-aware greeting for the Today screen — same idea as Claude's
// own chat greeting: the phrase changes with the time of day and isn't the same one
// every time, but always addresses you by name.

type GreetingTemplate = (name: string) => string;

const MORNING: GreetingTemplate[] = [
  (n) => `Good morning, ${n}.`,
  (n) => `Morning, ${n}.`,
  (n) => `Rise and shine, ${n}.`,
  (n) => `Hope you slept well, ${n}.`,
];

const AFTERNOON: GreetingTemplate[] = [
  (n) => `Good afternoon, ${n}.`,
  (n) => `Hey, ${n}.`,
  (n) => `Hope your day's going well, ${n}.`,
  (n) => `How's it going, ${n}?`,
];

const EVENING: GreetingTemplate[] = [
  (n) => `Good evening, ${n}.`,
  (n) => `Evening, ${n}.`,
  (n) => `How was your day, ${n}?`,
  (n) => `Winding down, ${n}?`,
];

const NIGHT: GreetingTemplate[] = [
  (n) => `Working late, ${n}?`,
  (n) => `Burning the midnight oil, ${n}?`,
  (n) => `Still up, ${n}?`,
  (n) => `Good to see you, ${n}.`,
];

function poolForHour(hour: number): GreetingTemplate[] {
  if (hour >= 5 && hour < 12) return MORNING;
  if (hour >= 12 && hour < 17) return AFTERNOON;
  if (hour >= 17 && hour < 21) return EVENING;
  return NIGHT;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function buildGreeting(username: string, hour: number = new Date().getHours()): string {
  const pool = poolForHour(hour);
  const template = pool[Math.floor(Math.random() * pool.length)];
  return template(capitalize(username));
}

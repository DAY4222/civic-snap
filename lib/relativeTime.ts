const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Spelled out rather than Intl: Hermes, Node and browsers format short dates differently.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago", then "25 May" (or
 * "25 May 2025" for another year). Times in the future read as "Just now".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY && isSameDay(date, now)) return plural(Math.floor(elapsed / HOUR), 'hour');

  const days = calendarDaysBetween(date, now);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  const dayMonth = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

function plural(count: number, unit: 'minute' | 'hour') {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

function isSameDay(a: Date, b: Date) {
  return calendarDaysBetween(a, b) === 0;
}

/** Whole calendar days from `a` to `b` in local time, ignoring the time of day. */
function calendarDaysBetween(a: Date, b: Date) {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / DAY);
}

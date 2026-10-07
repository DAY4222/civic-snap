import { formatRelativeTime } from '../relativeTime';

// Local time, so the calendar-day rules don't depend on the machine's time zone.
const now = new Date(2026, 9, 6, 15, 0, 0); // 6 Oct 2026, 3:00 pm

function ago(milliseconds: number) {
  return new Date(now.getTime() - milliseconds).toISOString();
}

describe('formatRelativeTime', () => {
  it('reads recent times in minutes and hours', () => {
    expect(formatRelativeTime(ago(20 * 1000), now)).toBe('Just now');
    expect(formatRelativeTime(ago(60 * 1000), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(5 * 60 * 1000), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(2 * 60 * 60 * 1000), now)).toBe('2 hours ago');
  });

  it('switches to days by the calendar, not by 24-hour blocks', () => {
    expect(formatRelativeTime(new Date(2026, 9, 5, 23, 30).toISOString(), now)).toBe('Yesterday');
    expect(formatRelativeTime(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toBe('3 days ago');
  });

  it('shows a date after a week, with the year only when it differs', () => {
    expect(formatRelativeTime(new Date(2026, 4, 25, 12, 0).toISOString(), now)).toBe('25 May');
    expect(formatRelativeTime(new Date(2025, 11, 1, 12, 0).toISOString(), now)).toBe('1 Dec 2025');
  });

  it('handles bad or future timestamps calmly', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
    expect(formatRelativeTime(new Date(now.getTime() + 60 * 1000).toISOString(), now)).toBe(
      'Just now'
    );
  });
});

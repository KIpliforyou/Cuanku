import type { RecurringFrequency, RecurringRule } from "./models";

function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Recurring dates must use YYYY-MM-DD");
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== date) throw new Error("Recurring date is invalid");
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function nextMonthlyDate(date: Date, dayOfMonth: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth(year, month + 1))));
}

function nextYearlyDate(date: Date, start: Date): Date {
  const year = date.getUTCFullYear() + 1;
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month + 1))));
}

function nextDate(
  date: Date,
  frequency: RecurringFrequency,
  start: Date,
  dayOfMonth: number,
): Date {
  if (frequency === "weekly") {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (frequency === "monthly") return nextMonthlyDate(date, dayOfMonth);
  return nextYearlyDate(date, start);
}

export function getDueRecurringDates(rule: RecurringRule, throughDate: string): string[] {
  const start = parseDate(rule.startDate);
  const through = parseDate(throughDate);
  const dayOfMonth = rule.dayOfMonth ?? start.getUTCDate();
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error("Recurring day of month must be between 1 and 31");
  }
  const end = rule.endDate ? parseDate(rule.endDate) : null;
  if (end && end < start) throw new Error("Recurring end date must not precede its start date");

  const previous = rule.lastGeneratedDate ? parseDate(rule.lastGeneratedDate) : null;
  let date = previous && previous >= start
    ? nextDate(previous, rule.frequency, start, dayOfMonth)
    : start;
  const dueDates: string[] = [];

  while (date <= through && (!end || date <= end)) {
    dueDates.push(formatDate(date));
    date = nextDate(date, rule.frequency, start, dayOfMonth);
  }
  return dueDates;
}

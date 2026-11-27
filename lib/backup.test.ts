import { describe, expect, it } from "vitest";
import { isBackupReminderDue } from "./backup";

const now = Date.parse("2026-11-27T00:00:00.000Z");
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

describe("backup reminder", () => {
  it("reminds when no valid backup date exists or the selected interval has passed", () => {
    expect(isBackupReminderDue(null, 14, now)).toBe(true);
    expect(isBackupReminderDue("not-a-date", 14, now)).toBe(true);
    expect(isBackupReminderDue(daysAgo(14), 14, now)).toBe(true);
  });

  it("does not remind before the selected interval or for a future date", () => {
    expect(isBackupReminderDue(daysAgo(13), 14, now)).toBe(false);
    expect(isBackupReminderDue(new Date(now + 1000).toISOString(), 14, now)).toBe(true);
  });
});

import type { BackupReminderDays } from "./models";

export function isBackupReminderDue(
  lastBackupAt: string | null,
  reminderDays: BackupReminderDays,
  now: number = Date.now(),
): boolean {
  if (!lastBackupAt) return true;
  const timestamp = Date.parse(lastBackupAt);
  if (!Number.isFinite(timestamp) || timestamp > now) return true;
  return now - timestamp >= reminderDays * 24 * 60 * 60 * 1000;
}

/**
 * Offline capture times. Every mobile write that can happen at a site carries
 * `capturedAt` (the device time the action happened, ISO). The server honours
 * it when it is not in the future and not older than the `offlineMaxAgeDays`
 * setting; a time ahead of the server's (a phone whose clock runs fast) is
 * not honoured, and the write counts as captured when it arrived — nothing is
 * refused for it. It records when the write actually arrived (`receivedAt`)
 * and flags `syncedLate` when that was more than 15 min later.
 */
import { AppError } from './errors.js';
import { DAY_MS } from './business-day.js';

/** Arriving later than this after capture marks a write `syncedLate`. */
export const SYNCED_LATE_AFTER_MS = 15 * 60 * 1000;

function invalid(message: string): AppError {
  return new AppError(message, 400, 'CAPTURED_AT_INVALID');
}

/**
 * The instant an action happened: `capturedAt` (a Date or ISO string) when
 * acceptable, the server's `now` when absent. A time ahead of `now` (clock
 * slack, or a phone clock running minutes or hours fast) is not honoured: the
 * action counts as captured at `now`. 400 `CAPTURED_AT_INVALID` when it is
 * unparseable or more than `settings.offlineMaxAgeDays` days old.
 */
export function acceptCapturedAt(
  capturedAt: Date | string | null | undefined,
  settings: { offlineMaxAgeDays: number },
  now: Date = new Date(),
): Date {
  if (capturedAt === undefined || capturedAt === null || capturedAt === '') return new Date(now.getTime());
  const at = capturedAt instanceof Date ? new Date(capturedAt.getTime()) : new Date(capturedAt);
  if (Number.isNaN(at.getTime())) throw invalid('capturedAt is not a valid date-time');
  if (at.getTime() < now.getTime() - settings.offlineMaxAgeDays * DAY_MS) {
    throw invalid(`This was captured more than ${settings.offlineMaxAgeDays} days ago and can no longer be synced`);
  }
  return at.getTime() > now.getTime() ? new Date(now.getTime()) : at;
}

/** True when a write captured at `capturedAt` reached the server more than 15 min later. */
export function isSyncedLate(capturedAt: Date, receivedAt: Date): boolean {
  return receivedAt.getTime() - capturedAt.getTime() > SYNCED_LATE_AFTER_MS;
}

/**
 * `{ capturedAt, receivedAt, syncedLate }` for a write: the accepted capture
 * time, the server time it arrived, and whether it arrived late. A write
 * without `capturedAt` is captured "now" and never late.
 */
export function captureTimes(
  capturedAt: Date | string | null | undefined,
  settings: { offlineMaxAgeDays: number },
  now: Date = new Date(),
): { capturedAt: Date; receivedAt: Date; syncedLate: boolean } {
  const at = acceptCapturedAt(capturedAt, settings, now);
  return { capturedAt: at, receivedAt: new Date(now.getTime()), syncedLate: isSyncedLate(at, now) };
}

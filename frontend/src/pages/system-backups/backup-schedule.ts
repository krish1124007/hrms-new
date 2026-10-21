/** The monthly backup fires at 23:50 server time (backend `backup.jobs.ts`). */
const RUN_MINUTE_OF_DAY = 23 * 60 + 50;
const MINUTE_MS = 60_000;

/**
 * When the monthly backup will really run.
 *
 * The backend's repeat pattern is `50 23 28-31 * *` — it wakes on each of the
 * 28th–31st and only the last day of the month goes ahead — so the queue's
 * "next" time is often the 28th, not the run. This moves that candidate to
 * the last day of its month, at the same time of day. The server's timezone
 * is read off the candidate itself (it is 23:50 there).
 */
export function nextMonthEndRun(candidate: number): Date {
  const utc = new Date(candidate);
  let offsetMin = (RUN_MINUTE_OF_DAY - (utc.getUTCHours() * 60 + utc.getUTCMinutes())) % 1440;
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  // UTC fields of `wall` are the server's wall clock.
  const wall = new Date(candidate + offsetMin * MINUTE_MS);
  const lastDay = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 0)).getUTCDate();
  wall.setUTCDate(lastDay);
  return new Date(wall.getTime() - offsetMin * MINUTE_MS);
}

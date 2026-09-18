/**
 * SPEC-007 REQ-7 / AC-11 — the stated bound on how long an entitlement may go unconfirmed.
 *
 * REQ-7: *"Rows carry `entitlement_synced_at`, and a stale row alerts rather than ageing quietly …
 * The threshold makes the bound explicit instead of leaving it at 'however long nobody noticed'."*
 * The spec never named a number; the owner did, on 2026-09-17.
 *
 * **It is six MISSED RUNS, not six hours, and that is the load-bearing part.** Since AC-6 the
 * reconcile refreshes every row on every pass, so a stale row means OUR job is down rather than that
 * Stripe is — which retires the 72-hour anchor outright, tied as it was to Stripe's retry window.
 * Hardcoding "6 hours" would silently become ONE missed run the day someone edits `vercel.json` to
 * a six-hourly schedule: the threshold would change meaning through a file nobody thinks of as
 * billing. That is F-80's decay shape arriving through a different door.
 *
 * (The cron literal is deliberately not written in this block comment: it contains the characters
 * that END one, and a docblock that closes itself mid-sentence is the first thing this file broke.)
 *
 * So the bound is a multiple of the schedule, both halves are read from files that declare them, and
 * a test asserts the relationship rather than the product.
 */

/** Parsed from a five-field cron expression. Only the shapes `vercel.json` can hold are supported. */
export function cronIntervalSeconds(schedule: string): number | null {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null;

  // Once an hour, on the hour: a numeric minute with a wildcard hour.
  if (/^\d+$/.test(minute) && hour === '*') return 3600;
  // Every N hours: a numeric minute with a stepped hour field.
  const everyNHours = hour.match(/^\*\/(\d+)$/);
  if (/^\d+$/.test(minute) && everyNHours) return Number(everyNHours[1]) * 3600;
  // Every N minutes: a stepped minute field with a wildcard hour.
  const everyNMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyNMinutes && hour === '*') return Number(everyNMinutes[1]) * 60;

  return null;
}

/**
 * The bound, in seconds: how long a row may go unconfirmed before it is stale.
 *
 * Returns `null` rather than guessing when the schedule cannot be read. A threshold derived from a
 * cron expression nobody could parse would be a number with no meaning, and acting on it is worse
 * than not having it — the caller reports that it could not measure instead.
 */
export function stalenessThresholdSeconds(schedule: string, missedRuns: number): number | null {
  const interval = cronIntervalSeconds(schedule);
  if (interval === null || !Number.isFinite(missedRuns) || missedRuns <= 0) return null;
  return interval * missedRuns;
}

/**
 * How stale is the oldest row, and does that cross the bound?
 *
 * **Measured at READ time, before any write, and that is the design.** `entitlements_to_reconcile`
 * returns rows `order by entitlement_synced_at asc` and the pass then refreshes every row it can
 * reach — so counting stale rows AFTER a pass counts nearly zero by construction, and anything still
 * stale is a row the pass could not read, which `unreadable` already reports. Measured after, the
 * number answers "did this run just work", which the caller already knows. Measured before, it
 * answers "how well did the PREVIOUS runs do", which is the signal AC-11 is about.
 *
 * Because the rows arrive oldest-first, the oldest row's age IS the measurement — free, at the top
 * of the pass.
 *
 * @param rows oldest-confirmed first, as the database returns them
 * @param thresholdSeconds from `stalenessThresholdSeconds`, or null if it could not be derived
 * @param now milliseconds since the epoch
 */
export function measureStaleness(
  rows: { entitlementSyncedAt: string | null }[],
  thresholdSeconds: number | null,
  now: number,
): { stale: number; oldestAgeSeconds: number | null; measured: boolean } {
  const ages = rows
    .map((r) => (r.entitlementSyncedAt ? (now - Date.parse(r.entitlementSyncedAt)) / 1000 : null))
    .filter((a): a is number => a !== null && Number.isFinite(a));

  // A row that has NEVER been confirmed has no age to compare. It is not counted as stale here,
  // because the column is `not null default now()` — a row with no timestamp is a schema change,
  // not an ageing row, and inventing an age for it would make this number mean two things.
  const oldest = ages.length ? Math.max(...ages) : null;
  if (thresholdSeconds === null) return { stale: 0, oldestAgeSeconds: oldest, measured: false };

  return {
    stale: ages.filter((a) => a > thresholdSeconds).length,
    oldestAgeSeconds: oldest,
    measured: true,
  };
}

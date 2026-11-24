/** Groups are deleted this many days after their exchange date. */
export const RETENTION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The expiry rule. The exchange date is a plain date (YYYY-MM-DD) with no time or zone, and
 * "today" is the current day in UTC, the same clock `earliestExchangeDate` uses. A group
 * is expired when exchange date + 60 days < today: it still exists on the 60th day after
 * its date and is gone from the 61st (UTC) on.
 *
 * Returns the cutoff as a date string: exactly the groups whose exchange date sorts
 * strictly before it are expired. ISO dates sort like they read, so SQL can compare the
 * column with `<` and use an index.
 */
export function expiryCutoff(now = Date.now()): string {
  return new Date(now - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a group with this exchange date is expired at `now`. */
export function isExpired(exchangeDate: string, now = Date.now()): boolean {
  return exchangeDate < expiryCutoff(now);
}

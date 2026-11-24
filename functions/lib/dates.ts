/**
 * The earliest exchange date the server accepts. The form checks against the visitor's
 * local date. A visitor west of UTC can be a day behind the server, so the server accepts
 * dates from yesterday (UTC) on.
 */
export function earliestExchangeDate(now = Date.now()): string {
  return new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

import { expiryCutoff } from "./expiry";

/** How many expired groups one request deletes at most, so no request does unbounded work. */
export const CLEANUP_BATCH_SIZE = 5;

/**
 * Deletes expired groups (see `expiryCutoff`) with all their data, oldest first, at most
 * `limit` of them. Pages Functions have no cron trigger, so this runs lazily as a side
 * effect of ordinary requests (see functions/_middleware.ts); whatever is left over is
 * taken by later requests.
 *
 * The common case, nothing expired, costs one indexed read (`groups_exchange_date`). The
 * deletes are explicit rather than relying on ON DELETE CASCADE, children first, in one
 * batch (a transaction). Each statement re-applies the expiry condition to the chosen ids,
 * so a group whose date an organizer moved in the meantime is left alone, entirely.
 */
export async function deleteExpiredGroups(db: D1Database, now = Date.now(), limit = CLEANUP_BATCH_SIZE): Promise<void> {
  const cutoff = expiryCutoff(now);
  const { results } = await db
    .prepare("SELECT id FROM groups WHERE exchange_date < ? ORDER BY exchange_date, id LIMIT ?")
    .bind(cutoff, limit)
    .all<{ id: string }>();
  if (results.length === 0) return;

  const ids = JSON.stringify(results.map((row) => row.id));
  const expired = "SELECT id FROM groups WHERE exchange_date < ? AND id IN (SELECT value FROM json_each(?))";
  const byGroup = (table: string) => db.prepare(`DELETE FROM ${table} WHERE group_id IN (${expired})`).bind(cutoff, ids);

  await db.batch([
    byGroup("swap_requests"),
    byGroup("assignments"),
    byGroup("exclusions"),
    db
      .prepare(`DELETE FROM wishlists WHERE participant_id IN (SELECT id FROM participants WHERE group_id IN (${expired}))`)
      .bind(cutoff, ids),
    byGroup("participants"),
    db.prepare(`DELETE FROM groups WHERE id IN (${expired})`).bind(cutoff, ids),
  ]);
}

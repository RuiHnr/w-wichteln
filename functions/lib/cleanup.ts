import { expiryCutoff } from "./expiry";
import { deleteGroups } from "./group-deletion";

/** How many expired groups one request deletes at most, so no request does unbounded work. */
export const CLEANUP_BATCH_SIZE = 5;

/**
 * Deletes expired groups (see `expiryCutoff`) with all their data, oldest first, at most
 * `limit` of them. Pages Functions have no cron trigger, so this runs lazily as a side
 * effect of ordinary requests (see functions/_middleware.ts); whatever is left over is
 * taken by later requests.
 *
 * The common case, nothing expired, costs one indexed read (`groups_exchange_date`). The
 * deletion re-applies the expiry condition to the chosen ids (see `deleteGroups`), so a
 * group whose date an organizer moved in the meantime is left alone, entirely.
 */
export async function deleteExpiredGroups(db: D1Database, now = Date.now(), limit = CLEANUP_BATCH_SIZE, pictures?: R2Bucket): Promise<void> {
  const cutoff = expiryCutoff(now);
  const { results } = await db
    .prepare("SELECT id FROM groups WHERE exchange_date < ? ORDER BY exchange_date, id LIMIT ?")
    .bind(cutoff, limit)
    .all<{ id: string }>();
  await deleteGroups(
    db,
    results.map((row) => row.id),
    "exchange_date < ?",
    [cutoff],
    pictures,
  );
}

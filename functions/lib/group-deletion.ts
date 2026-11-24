/**
 * The one place a group is deleted with everything in it. Expiry (see cleanup.ts) and Group
 * Deletion (see manage.ts) both end here, so the result is the same: afterwards nothing of the
 * group is left, and its Invite Link and Personal Links lead nowhere. Anything else that
 * belongs to a group and lives outside these tables must be removed here too.
 *
 * The deletes are explicit rather than relying on ON DELETE CASCADE, children first, in one
 * batch (a transaction). `condition`, a SQL condition on the `groups` row with its `binds`,
 * is re-applied by every statement to the given ids, so a group that no longer qualifies by
 * the time the batch runs is left alone, entirely. It must only read the `groups` row, since
 * the other rows of the group are gone by the time the last statement checks it.
 */
export async function deleteGroups(db: D1Database, groupIds: string[], condition = "1", binds: unknown[] = []): Promise<void> {
  if (groupIds.length === 0) return;
  const chosen = `SELECT id FROM groups WHERE id IN (SELECT value FROM json_each(?)) AND (${condition})`;
  const params = [JSON.stringify(groupIds), ...binds];
  const byGroup = (table: string) => db.prepare(`DELETE FROM ${table} WHERE group_id IN (${chosen})`).bind(...params);

  await db.batch([
    byGroup("swap_requests"),
    byGroup("assignments"),
    byGroup("exclusions"),
    db.prepare(`DELETE FROM wishlists WHERE participant_id IN (SELECT id FROM participants WHERE group_id IN (${chosen}))`).bind(...params),
    byGroup("participants"),
    db.prepare(`DELETE FROM groups WHERE id IN (${chosen})`).bind(...params),
  ]);
}

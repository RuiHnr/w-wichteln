import { deleteGroupPictures } from "./picture-storage";

/**
 * The one place a group is deleted with everything in it. Expiry (see cleanup.ts) and Group
 * Deletion (see manage.ts) both end here, so the result is the same: afterwards nothing of the
 * group is left, and its Invite Link and Personal Links lead nowhere. Anything else that
 * belongs to a group and lives outside these tables must be removed here too.
 *
 * One batch (a transaction), children first and explicitly, except the participants: they go
 * with their group (ON DELETE CASCADE) in the last statement. `condition`, a SQL condition on
 * the `groups` row with its `binds`, is re-applied by every statement to the given ids, so a
 * group that no longer qualifies by the time the batch runs is left alone, entirely. Since the
 * participants are still there when each statement checks it, the condition may ask about
 * them too, such as whether the caller is an organizer.
 *
 * The images of the deleted groups (Group Pictures and Participant Pictures, in `pictures`) go
 * right after, and only those of the groups actually deleted. That cannot be part of the
 * transaction; should it fail, the images are orphaned (unguessable, and logged), not the group.
 *
 * Returns the ids of the groups it deleted.
 */
export async function deleteGroups(
  db: D1Database,
  groupIds: string[],
  condition = "1",
  binds: unknown[] = [],
  pictures?: R2Bucket,
): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const chosen = `SELECT id FROM groups WHERE id IN (SELECT value FROM json_each(?)) AND (${condition})`;
  const params = [JSON.stringify(groupIds), ...binds];
  const byGroup = (table: string) => db.prepare(`DELETE FROM ${table} WHERE group_id IN (${chosen})`).bind(...params);

  const results = await db.batch<{ id: string }>([
    byGroup("swap_requests"),
    byGroup("assignments"),
    byGroup("exclusions"),
    db.prepare(`DELETE FROM wishlists WHERE participant_id IN (SELECT id FROM participants WHERE group_id IN (${chosen}))`).bind(...params),
    db.prepare(`DELETE FROM groups WHERE id IN (${chosen}) RETURNING id`).bind(...params),
  ]);
  const deleted = results.at(-1)!.results.map((row) => row.id);
  await deleteGroupPictures(pictures, deleted);
  return deleted;
}

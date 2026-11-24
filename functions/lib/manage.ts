import type { ManageError, Me } from "../../shared/api";
import type { GroupSettings } from "../../shared/group-input";
import { MIN_PARTICIPANTS_TO_DRAW } from "../../shared/draw";
import { type Assignments, drawAssignments } from "./draw";
import { deleteGroups } from "./group-deletion";
import { completedSwapsOf, findMe } from "./groups";
import { deletePictureObjects } from "./picture-storage";
import { hashToken, newToken } from "./tokens";

/**
 * What organizers do to their group. Every organizer has the same rights; the creator has
 * no special status. Each change is a single guarded SQL statement that re-checks the
 * caller's role and the group's rules, so two organizers acting at the same moment can
 * never leave a group without an organizer. Only when the statement changed nothing do we
 * look up why.
 */

export type ManageResult = { ok: true; me: Me } | { ok: false; reason: ManageError };

/** The caller, if they are an organizer of the group. */
export async function findOrganizer(db: D1Database, token: string | null, groupId: string): Promise<ManageResult> {
  const me = token ? await findMe(db, token) : null;
  if (!me) return { ok: false, reason: "unknown_token" };
  if (me.group.id !== groupId || !me.participant.isOrganizer) return { ok: false, reason: "not_organizer" };
  return { ok: true, me };
}

/** SQL condition: the token belongs to an organizer of the group. Binds token hash, group id. */
const CALLER_IS_ORGANIZER =
  "EXISTS (SELECT 1 FROM participants caller WHERE caller.token_hash = ? AND caller.group_id = ? AND caller.is_organizer = 1)";

/** SQL condition on a `participants` row: it is not the group's only organizer. */
const NOT_LAST_ORGANIZER = `(participants.is_organizer = 0 OR EXISTS (
  SELECT 1 FROM participants other
   WHERE other.group_id = participants.group_id AND other.is_organizer = 1 AND other.id != participants.id))`;

/** The caller's fresh view after a successful change. */
async function changed(db: D1Database, token: string): Promise<ManageResult> {
  const me = await findMe(db, token);
  return me ? { ok: true, me } : { ok: false, reason: "unknown_token" };
}

interface TargetRow {
  is_self: number;
  phase: string;
  is_last_organizer: number;
}

/**
 * Why a guarded change to a participant changed nothing, checked in the order the API
 * reports it: the caller's rights, the target, then the rule that was broken.
 */
async function whyRefused(
  db: D1Database,
  token: string,
  groupId: string,
  participantId: string,
  rules: { self?: boolean; drawn?: boolean; lastOrganizer?: boolean },
): Promise<ManageError> {
  const caller = await findOrganizer(db, token, groupId);
  if (!caller.ok) return caller.reason;
  const target = await db
    .prepare(
      `SELECT participants.token_hash = ? AS is_self, g.phase, NOT ${NOT_LAST_ORGANIZER} AS is_last_organizer
         FROM participants JOIN groups g ON g.id = participants.group_id
        WHERE participants.id = ? AND participants.group_id = ?`,
    )
    .bind(await hashToken(token), participantId, groupId)
    .first<TargetRow>();
  if (!target) return "unknown_participant";
  if (rules.self && target.is_self === 1) return "self";
  if (rules.drawn && target.phase !== "open") return "drawn";
  if (rules.lastOrganizer && target.is_last_organizer === 1) return "last_organizer";
  // The state changed between the guarded statement and this lookup; report it as a lost right.
  return "not_organizer";
}

/** Changes budget and exchange date, in either phase. */
export async function updateGroupSettings(
  db: D1Database,
  token: string,
  groupId: string,
  settings: GroupSettings,
): Promise<ManageResult> {
  const updated = await db
    .prepare(`UPDATE groups SET budget_cents = ?, exchange_date = ? WHERE id = ? AND ${CALLER_IS_ORGANIZER}`)
    .bind(settings.budgetCents, settings.exchangeDate, groupId, await hashToken(token), groupId)
    .run();
  if (updated.meta.changes === 1) return changed(db, token);
  const caller = await findOrganizer(db, token, groupId);
  return { ok: false, reason: caller.ok ? "not_organizer" : caller.reason };
}

/**
 * Sets the Swap Limit, in either phase. Only the limit changes: completed swaps stay, and
 * open requests stay too. `checkSwap` refuses to send or accept one while the sender or the
 * receiver is at the limit, and accepts it again once the limit is raised.
 */
export async function setSwapLimit(db: D1Database, token: string, groupId: string, swapLimit: number): Promise<ManageResult> {
  const updated = await db
    .prepare(`UPDATE groups SET swap_limit = ? WHERE id = ? AND ${CALLER_IS_ORGANIZER} RETURNING id`)
    .bind(swapLimit, groupId, await hashToken(token), groupId)
    .all();
  if (updated.results.length === 1) return changed(db, token);
  const caller = await findOrganizer(db, token, groupId);
  return { ok: false, reason: caller.ok ? "not_organizer" : caller.reason };
}

/**
 * Removes a participant (and their Participant Picture, in `pictures`) while the group is open. Removing yourself is refused: it would
 * cut you off from the group, and leaving is not something this action offers. Since the
 * caller is an organizer who stays, the last organizer is never removed; the statement
 * still guards that invariant itself.
 */
export async function removeParticipant(
  db: D1Database,
  token: string,
  groupId: string,
  participantId: string,
  pictures?: R2Bucket,
): Promise<ManageResult> {
  const tokenHash = await hashToken(token);
  const deleted = await db
    .prepare(
      `DELETE FROM participants
        WHERE id = ? AND group_id = ? AND token_hash != ?
          AND (SELECT phase FROM groups WHERE id = participants.group_id) = 'open'
          AND ${NOT_LAST_ORGANIZER}
          AND ${CALLER_IS_ORGANIZER}
        RETURNING id, picture_key`,
    )
    .bind(participantId, groupId, tokenHash, tokenHash, groupId)
    .all<{ id: string; picture_key: string | null }>();
  // Not meta.changes: D1 counts the exclusions removed with the participant (ON DELETE CASCADE) too.
  if (deleted.results.length === 1) {
    // Their Participant Picture goes with them.
    await deletePictureObjects(pictures, groupId, [deleted.results[0].picture_key]);
    return changed(db, token);
  }
  return { ok: false, reason: await whyRefused(db, token, groupId, participantId, { self: true, drawn: true }) };
}

/**
 * Grants or revokes the Organizer role, on anyone in the group including the caller and
 * the creator, in either phase. The role reveals no assignments (ADR 0003). Revoking is
 * refused when it would leave the group without an organizer.
 */
export async function setOrganizer(
  db: D1Database,
  token: string,
  groupId: string,
  participantId: string,
  isOrganizer: boolean,
): Promise<ManageResult> {
  const updated = await db
    .prepare(
      `UPDATE participants SET is_organizer = ?
        WHERE id = ? AND group_id = ?
          AND (? = 1 OR ${NOT_LAST_ORGANIZER})
          AND ${CALLER_IS_ORGANIZER}`,
    )
    .bind(isOrganizer ? 1 : 0, participantId, groupId, isOrganizer ? 1 : 0, await hashToken(token), groupId)
    .run();
  if (updated.meta.changes === 1) return changed(db, token);
  return { ok: false, reason: await whyRefused(db, token, groupId, participantId, { lastOrganizer: !isOrganizer }) };
}

export type RenewLinkResult = { ok: true; token: string; me: Me } | { ok: false; reason: ManageError };

/**
 * Link Renewal (ADR 0004): gives a participant of the group a new token, in either phase. Only
 * the token hash changes, so their identity, assignment, wishlist and swap requests stay; the old
 * Personal Link stops working everywhere. When organizers renew their own link, the fresh view
 * is seen through the new token.
 */
export async function renewLink(db: D1Database, token: string, groupId: string, participantId: string): Promise<RenewLinkResult> {
  const tokenHash = await hashToken(token);
  // Whether the caller renews their own link, known before their token hash is replaced.
  const self = await db
    .prepare("SELECT 1 AS found FROM participants WHERE id = ? AND token_hash = ?")
    .bind(participantId, tokenHash)
    .first();
  const renewed = newToken();
  const updated = await db
    .prepare(
      `UPDATE participants
          SET token_hash = ?,
              link_renewed_by = (SELECT caller.name FROM participants caller WHERE caller.token_hash = ?),
              link_renewed_by_id = (SELECT caller.id FROM participants caller WHERE caller.token_hash = ?),
              link_renewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND group_id = ? AND ${CALLER_IS_ORGANIZER}`,
    )
    .bind(await hashToken(renewed), tokenHash, tokenHash, participantId, groupId, tokenHash, groupId)
    .run();
  if (updated.meta.changes !== 1) return { ok: false, reason: await whyRefused(db, token, groupId, participantId, {}) };
  const result = await changed(db, self ? renewed : token);
  return result.ok ? { ok: true, token: renewed, me: result.me } : result;
}

/**
 * Adds an exclusion between two different participants of the group while it is open.
 * The pair is stored once, smaller id first, so adding it again in either order has no
 * effect and still succeeds.
 */
export async function addExclusion(
  db: D1Database,
  token: string,
  groupId: string,
  participantIds: [string, string],
): Promise<ManageResult> {
  const [a, b] = [...participantIds].sort();
  const tokenHash = await hashToken(token);
  const inserted = await db
    .prepare(
      `INSERT INTO exclusions (id, group_id, participant_a, participant_b)
       SELECT ?, g.id, ?, ? FROM groups g
        WHERE g.id = ? AND g.phase = 'open'
          AND (SELECT COUNT(*) FROM participants p WHERE p.group_id = g.id AND p.id IN (?, ?)) = 2
          AND ${CALLER_IS_ORGANIZER}
       ON CONFLICT (participant_a, participant_b) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), a, b, groupId, a, b, tokenHash, groupId)
    .run();
  if (inserted.meta.changes === 1) return changed(db, token);

  const caller = await findOrganizer(db, token, groupId);
  if (!caller.ok) return caller;
  const known = new Set(caller.me.participants.map((p) => p.id));
  if (!known.has(a) || !known.has(b)) return { ok: false, reason: "unknown_participant" };
  if (caller.me.group.phase !== "open") return { ok: false, reason: "drawn" };
  const exists = caller.me.exclusions?.some((e) => e.participantIds[0] === a && e.participantIds[1] === b);
  return exists ? caller : { ok: false, reason: "not_organizer" };
}

/** Removes an exclusion while the group is open. */
export async function removeExclusion(
  db: D1Database,
  token: string,
  groupId: string,
  exclusionId: string,
): Promise<ManageResult> {
  const deleted = await db
    .prepare(
      `DELETE FROM exclusions
        WHERE id = ? AND group_id = ?
          AND (SELECT phase FROM groups WHERE id = exclusions.group_id) = 'open'
          AND ${CALLER_IS_ORGANIZER}`,
    )
    .bind(exclusionId, groupId, await hashToken(token), groupId)
    .run();
  if (deleted.meta.changes === 1) return changed(db, token);

  const caller = await findOrganizer(db, token, groupId);
  if (!caller.ok) return caller;
  if (!caller.me.exclusions?.some((e) => e.id === exclusionId)) return { ok: false, reason: "unknown_exclusion" };
  return { ok: false, reason: caller.me.group.phase !== "open" ? "drawn" : "not_organizer" };
}

/** SQL: the number of participants of the `groups` row in scope. */
const PARTICIPANT_COUNT = "(SELECT COUNT(*) FROM participants p WHERE p.group_id = groups.id)";

/** SQL: an open group has no assignments, so drop any rows it has. Binds group id twice. */
const DROP_ASSIGNMENTS_IF_OPEN =
  "DELETE FROM assignments WHERE group_id = ? AND (SELECT phase FROM groups WHERE id = ?) = 'open'";

/**
 * SQL: an open group has no swap requests, open or completed, so drop any it has; with the
 * completed ones gone every Swap Limit count is 0. Binds group id twice.
 */
const DROP_SWAP_REQUESTS_IF_OPEN =
  "DELETE FROM swap_requests WHERE group_id = ? AND (SELECT phase FROM groups WHERE id = ?) = 'open'";

/** How often the draw is retried when the group changed while it was being drawn. */
const DRAW_ATTEMPTS = 3;

/**
 * Draws the group: one assignment per participant, then the group is Drawn. Only while
 * open and with at least 3 participants. When no valid draw exists with the exclusions,
 * nothing changes.
 *
 * The assignments are written in one batch whose statements re-check everything against
 * the stored group: the caller's role, the phase, that the assignments cover exactly the
 * current participants and break no current exclusion. If someone joined or an exclusion
 * changed in the meantime, the batch discards its rows and the draw starts over.
 */
export async function drawGroup(db: D1Database, token: string, groupId: string): Promise<ManageResult> {
  const tokenHash = await hashToken(token);
  for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt++) {
    const caller = await findOrganizer(db, token, groupId);
    if (!caller.ok) return caller;
    const { group, participants, exclusions = [] } = caller.me;
    if (group.phase !== "open") return { ok: false, reason: "drawn" };
    if (participants.length < MIN_PARTICIPANTS_TO_DRAW) return { ok: false, reason: "too_few" };
    const assignments = drawAssignments(
      participants.map((p) => p.id),
      exclusions.map((e) => e.participantIds),
    );
    if (!assignments) return { ok: false, reason: "impossible" };

    if (await writeDraw(db, tokenHash, groupId, assignments)) return changed(db, token);
  }
  // Someone kept joining, leaving or changing exclusions while we drew.
  return { ok: false, reason: "changed" };
}

/**
 * Stores the assignments and moves the group to Drawn, in one transaction. Every statement
 * re-checks against the stored group; true when the group is now Drawn with them.
 */
async function writeDraw(db: D1Database, tokenHash: string, groupId: string, assignments: Assignments): Promise<boolean> {
  const statements = [
    db
      .prepare(
        `INSERT INTO assignments (giver_id, recipient_id, group_id)
         SELECT json_extract(drawn.value, '$[0]') AS giver, json_extract(drawn.value, '$[1]') AS recipient, g.id
           FROM groups g, json_each(?) drawn
          WHERE g.id = ? AND g.phase = 'open' AND ${CALLER_IS_ORGANIZER}
            -- Someone removed meanwhile gets no row (rather than a foreign key error); the UPDATE then sees too few.
            AND giver IN (SELECT id FROM participants p WHERE p.group_id = g.id)
            AND recipient IN (SELECT id FROM participants p WHERE p.group_id = g.id)`,
      )
      .bind(JSON.stringify([...assignments]), groupId, tokenHash, groupId),
    // Drawn only if the rows cover exactly the current participants and break no current exclusion.
    db
      .prepare(
        `UPDATE groups SET phase = 'drawn'
          WHERE id = ? AND phase = 'open'
            AND ${PARTICIPANT_COUNT} >= ${MIN_PARTICIPANTS_TO_DRAW}
            AND ${PARTICIPANT_COUNT} = (SELECT COUNT(*) FROM assignments a WHERE a.group_id = groups.id)
            AND NOT EXISTS (SELECT 1 FROM assignments a JOIN exclusions e
                  ON (e.participant_a = a.giver_id AND e.participant_b = a.recipient_id)
                  OR (e.participant_b = a.giver_id AND e.participant_a = a.recipient_id)
                 WHERE a.group_id = groups.id)
          RETURNING id`,
      )
      .bind(groupId),
    // A group that is still open has no assignments: drop the rows of a draw that did not go through.
    db
      .prepare(DROP_ASSIGNMENTS_IF_OPEN)
      .bind(groupId, groupId),
  ];
  const [, drawn] = await db.batch(statements);
  return drawn.results.length === 1;
}

/**
 * The Reset: discards all assignments of a drawn group and returns it to Open, so people
 * can join, be removed and exclusions change before the next draw. Since nobody sees the
 * full list (ADR 0003), this is also how any mistake after the draw is fixed.
 *
 * One transaction: the group is reopened only while drawn and the caller an organizer,
 * and then its rows go, since an open group has no assignments. Its swap requests go too:
 * open ones expire, and with the completed swaps gone every Swap Limit count is back at 0.
 */
export async function resetGroup(db: D1Database, token: string, groupId: string): Promise<ManageResult> {
  const [reopened] = await db.batch([
    db
      .prepare(`UPDATE groups SET phase = 'open' WHERE id = ? AND phase = 'drawn' AND ${CALLER_IS_ORGANIZER} RETURNING id`)
      .bind(groupId, await hashToken(token), groupId),
    db
      .prepare(DROP_ASSIGNMENTS_IF_OPEN)
      .bind(groupId, groupId),
    db
      .prepare(DROP_SWAP_REQUESTS_IF_OPEN)
      .bind(groupId, groupId),
  ]);
  if (reopened.results.length === 1) return changed(db, token);

  const caller = await findOrganizer(db, token, groupId);
  if (!caller.ok) return caller;
  return { ok: false, reason: caller.me.group.phase === "open" ? "not_drawn" : "not_organizer" };
}

/**
 * Group Deletion: an organizer deletes the group with everything in it, in either phase,
 * with the same result as its Expiry (see `deleteGroups`). Every statement of the deletion
 * re-checks the caller's role, so an organizer demoted at the same moment deletes nothing.
 * Afterwards the caller's token is unknown like everyone else's, so there is no fresh view.
 */
export async function deleteGroup(
  db: D1Database,
  token: string | null,
  groupId: string,
  pictures?: R2Bucket,
): Promise<{ ok: true } | { ok: false; reason: ManageError }> {
  if (!token) return { ok: false, reason: "unknown_token" };
  const callerIsOrganizer =
    "EXISTS (SELECT 1 FROM participants caller WHERE caller.token_hash = ? AND caller.group_id = groups.id AND caller.is_organizer = 1)";
  const deleted = await deleteGroups(db, [groupId], callerIsOrganizer, [await hashToken(token)], pictures);
  if (deleted.length === 1) return { ok: true };
  const caller = await findOrganizer(db, token, groupId);
  return { ok: false, reason: caller.ok ? "not_organizer" : caller.reason };
}

const statusOf: Record<ManageError, number> = {
  unknown_token: 401,
  not_organizer: 403,
  unknown_participant: 404,
  unknown_exclusion: 404,
  drawn: 409,
  not_drawn: 409,
  last_organizer: 409,
  self: 409,
  too_few: 409,
  impossible: 409,
  changed: 409,
};

/** The error body and status the API answers a refused management action with. */
export function manageErrorResponse(error: ManageError): Response {
  return Response.json({ error }, { status: statusOf[error] });
}

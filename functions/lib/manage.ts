import type { ManageError, Me } from "../../shared/api";
import type { GroupSettings } from "../../shared/group-input";
import { findMe } from "./groups";
import { hashToken } from "./tokens";

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
 * Removes a participant while the group is open. Removing yourself is refused: it would
 * cut you off from the group, and leaving is not something this action offers. Since the
 * caller is an organizer who stays, the last organizer is never removed; the statement
 * still guards that invariant itself.
 */
export async function removeParticipant(
  db: D1Database,
  token: string,
  groupId: string,
  participantId: string,
): Promise<ManageResult> {
  const tokenHash = await hashToken(token);
  const deleted = await db
    .prepare(
      `DELETE FROM participants
        WHERE id = ? AND group_id = ? AND token_hash != ?
          AND (SELECT phase FROM groups WHERE id = participants.group_id) = 'open'
          AND ${NOT_LAST_ORGANIZER}
          AND ${CALLER_IS_ORGANIZER}
        RETURNING id`,
    )
    .bind(participantId, groupId, tokenHash, tokenHash, groupId)
    .all();
  // Not meta.changes: D1 counts the exclusions removed with the participant (ON DELETE CASCADE) too.
  if (deleted.results.length === 1) return changed(db, token);
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

const statusOf: Record<ManageError, number> = {
  unknown_token: 401,
  not_organizer: 403,
  unknown_participant: 404,
  unknown_exclusion: 404,
  drawn: 409,
  last_organizer: 409,
  self: 409,
};

/** The error body and status the API answers a refused management action with. */
export function manageErrorResponse(error: ManageError): Response {
  return Response.json({ error }, { status: statusOf[error] });
}

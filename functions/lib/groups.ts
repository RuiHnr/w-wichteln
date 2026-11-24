import type { ExclusionView, GroupPhase, GroupView, InviteResponse, Me, ParticipantView, RecipientView, SwapsView } from "../../shared/api";
import { DEFAULT_SWAP_LIMIT, type GroupInput } from "../../shared/group-input";
import { pictureUrl } from "./picture-storage";
import { hashToken, newInviteCode, newToken } from "./tokens";

/** Creates a group with its creator as first organizer and participant. */
export async function createGroup(db: D1Database, input: GroupInput): Promise<{ token: string; me: Me }> {
  const groupId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const inviteCode = newInviteCode();
  const token = newToken();

  const row: MeRow = {
    group_id: groupId,
    group_name: input.name,
    budget_cents: input.budgetCents,
    exchange_date: input.exchangeDate,
    phase: "open",
    invite_code: inviteCode,
    swap_limit: DEFAULT_SWAP_LIMIT,
    participant_id: participantId,
    participant_name: input.organizerName,
    is_organizer: 1,
    wishlist: "",
  };

  await db.batch([
    db
      .prepare("INSERT INTO groups (id, invite_code, name, budget_cents, exchange_date) VALUES (?, ?, ?, ?, ?)")
      .bind(row.group_id, row.invite_code, row.group_name, row.budget_cents, row.exchange_date),
    db
      .prepare("INSERT INTO participants (id, group_id, name, token_hash, is_organizer) VALUES (?, ?, ?, ?, 1)")
      .bind(row.participant_id, row.group_id, row.participant_name, await hashToken(token)),
  ]);

  const organizer: ParticipantView = { id: participantId, name: input.organizerName, isOrganizer: true };
  return { token, me: { ...toMe(row, [organizer]), exclusions: [] } };
}

/** The public facts of the group behind an invite code; null for an unknown code. */
export async function findInvite(db: D1Database, inviteCode: string): Promise<InviteResponse | null> {
  const row = await db
    .prepare(
      "SELECT id AS group_id, name AS group_name, budget_cents, exchange_date, phase, invite_code, swap_limit FROM groups WHERE invite_code = ?",
    )
    .bind(inviteCode)
    .first<GroupRow>();
  if (!row) return null;
  const { inviteCode: _notShown, swapLimit: _alsoNotShown, picture: _neither, ...group } = toGroupView(row);
  return { group };
}

export type JoinResult =
  | { ok: true; token: string; me: Me }
  | { ok: false; reason: "unknownGroup" | "closed" | "taken" };

/**
 * Adds a participant to the open group behind an invite code. Names are unique within a
 * group, ignoring the case of ASCII letters (SQLite NOCASE), so "Lea" and "lea" cannot both join.
 */
export async function joinGroup(db: D1Database, inviteCode: string, name: string): Promise<JoinResult> {
  const token = newToken();
  try {
    const inserted = await db
      .prepare(
        `INSERT INTO participants (id, group_id, name, token_hash)
         SELECT ?, g.id, ?, ? FROM groups g
          WHERE g.invite_code = ? AND g.phase = 'open'
            AND NOT EXISTS (SELECT 1 FROM participants p WHERE p.group_id = g.id AND p.name = ? COLLATE NOCASE)`,
      )
      .bind(crypto.randomUUID(), name, await hashToken(token), inviteCode, name)
      .run();
    if (inserted.meta.changes === 1) return { ok: true, token, me: (await findMe(db, token))! };
  } catch (error) {
    // Two people sending the same name at the same moment: the unique index on
    // (group_id, name COLLATE NOCASE) catches the second.
    if (!String(error).includes("UNIQUE")) throw error;
    return { ok: false, reason: "taken" };
  }

  const invite = await findInvite(db, inviteCode);
  if (!invite) return { ok: false, reason: "unknownGroup" };
  return { ok: false, reason: invite.group.phase === "open" ? "taken" : "closed" };
}

interface GroupRow {
  group_id: string;
  group_name: string;
  budget_cents: number;
  exchange_date: string;
  phase: GroupPhase;
  invite_code: string;
  swap_limit: number;
  picture_key?: string | null;
}

interface ParticipantRow {
  id: string;
  name: string;
  is_organizer: number;
  picture_key: string | null;
  link_renewed_by: string | null;
  link_renewed_by_id: string | null;
  link_renewed_at: string | null;
}

interface MeRow extends GroupRow {
  participant_id: string;
  participant_name: string;
  is_organizer: number;
  participant_picture_key?: string | null;
  wishlist: string;
}

/** SQL: the wishlist of the `participants p` row in scope, or '' when they wrote none. */
const WISHLIST_OF_P = "COALESCE((SELECT w.text FROM wishlists w WHERE w.participant_id = p.id), '')";

/**
 * The participant a token belongs to, with their group; null for an unknown token.
 * Organizers also get the group's exclusions; nobody else sees them.
 */
export async function findMe(db: D1Database, token: string): Promise<Me | null> {
  const row = await db
    .prepare(
      `SELECT g.id AS group_id, g.name AS group_name, g.budget_cents, g.exchange_date, g.phase, g.invite_code, g.swap_limit, g.picture_key,
              p.id AS participant_id, p.name AS participant_name, p.is_organizer, p.picture_key AS participant_picture_key,
              ${WISHLIST_OF_P} AS wishlist
         FROM participants p JOIN groups g ON g.id = p.group_id
        WHERE p.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<MeRow>();
  if (!row) return null;
  const { results } = await db
    .prepare(
      `SELECT id, name, is_organizer, picture_key, link_renewed_by, link_renewed_by_id, link_renewed_at
         FROM participants WHERE group_id = ? ORDER BY created_at, rowid`,
    )
    .bind(row.group_id)
    .all<ParticipantRow>();
  const me = toMe(
    row,
    results.map((p) => {
      const view: ParticipantView = { id: p.id, name: p.name, isOrganizer: p.is_organizer === 1 };
      if (p.picture_key) view.picture = pictureUrl(row.group_id, p.picture_key);
      if (p.link_renewed_by !== null && p.link_renewed_by_id !== null && p.link_renewed_at !== null) {
        view.linkRenewal = { by: p.link_renewed_by, byId: p.link_renewed_by_id, at: p.link_renewed_at };
      }
      return view;
    }),
  );
  if (row.phase === "drawn") {
    const recipient = await findRecipient(db, row.participant_id, row.group_id);
    if (recipient) me.recipient = recipient;
    me.swaps = await findSwaps(db, row.participant_id);
  }
  return row.is_organizer === 1 ? { ...me, exclusions: await findExclusions(db, row.group_id) } : me;
}

/**
 * The recipient of one giver's assignment, with their wishlist: the only assignment the API
 * ever reads (ADR 0003), and the only wishlist besides the caller's own.
 */
async function findRecipient(db: D1Database, giverId: string, groupId: string): Promise<RecipientView | null> {
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.picture_key, ${WISHLIST_OF_P} AS wishlist
         FROM assignments a JOIN participants p ON p.id = a.recipient_id
        WHERE a.giver_id = ?`,
    )
    .bind(giverId)
    .first<{ id: string; name: string; picture_key: string | null; wishlist: string }>();
  if (!row) return null;
  const recipient: RecipientView = { id: row.id, name: row.name, wishlist: row.wishlist };
  if (row.picture_key) recipient.picture = pictureUrl(groupId, row.picture_key);
  return recipient;
}

/**
 * SQL: how many completed swaps the participant in `column` took part in, sent or accepted:
 * what counts against the Swap Limit. Declined, withdrawn and expired requests are gone.
 */
export const completedSwapsOf = (column: string) =>
  `(SELECT COUNT(*) FROM swap_requests done WHERE done.status = 'accepted' AND (done.sender_id = ${column} OR done.receiver_id = ${column}))`;

/**
 * One participant's swaps: the group's Swap Limit, how many they took part in, and their
 * open requests in both directions. The other side shows by name only (ADR 0003).
 */
async function findSwaps(db: D1Database, participantId: string): Promise<SwapsView> {
  const [counts, requests] = await db.batch([
    db
      .prepare(`SELECT g.swap_limit, ${completedSwapsOf("p.id")} AS completed FROM participants p JOIN groups g ON g.id = p.group_id WHERE p.id = ?`)
      .bind(participantId),
    db
      .prepare(
        `SELECT s.id, s.sender_id = ?1 AS outgoing, other.id AS other_id, other.name AS other_name
           FROM swap_requests s JOIN participants other
             ON other.id = CASE WHEN s.sender_id = ?1 THEN s.receiver_id ELSE s.sender_id END
          WHERE s.status = 'open' AND (s.sender_id = ?1 OR s.receiver_id = ?1)
          ORDER BY s.created_at, s.rowid`,
      )
      .bind(participantId),
  ]);
  const { swap_limit, completed } = (counts.results as { swap_limit: number; completed: number }[])[0];
  const swaps: SwapsView = { limit: swap_limit, completed, incoming: [] };
  for (const r of requests.results as { id: string; outgoing: number; other_id: string; other_name: string }[]) {
    const other = { id: r.other_id, name: r.other_name };
    if (r.outgoing === 1) swaps.outgoing = { id: r.id, receiver: other };
    else swaps.incoming.push({ id: r.id, sender: other });
  }
  return swaps;
}

async function findExclusions(db: D1Database, groupId: string): Promise<ExclusionView[]> {
  const { results } = await db
    .prepare("SELECT id, participant_a, participant_b FROM exclusions WHERE group_id = ? ORDER BY created_at, rowid")
    .bind(groupId)
    .all<{ id: string; participant_a: string; participant_b: string }>();
  return results.map((e) => ({ id: e.id, participantIds: [e.participant_a, e.participant_b] }));
}

function toGroupView(row: GroupRow): GroupView {
  const view: GroupView = {
    id: row.group_id,
    name: row.group_name,
    budgetCents: row.budget_cents,
    exchangeDate: row.exchange_date,
    phase: row.phase,
    inviteCode: row.invite_code,
    swapLimit: row.swap_limit,
  };
  if (row.picture_key) view.picture = pictureUrl(row.group_id, row.picture_key);
  return view;
}

function toParticipantView(row: MeRow): ParticipantView {
  const view: ParticipantView = { id: row.participant_id, name: row.participant_name, isOrganizer: row.is_organizer === 1 };
  if (row.participant_picture_key) view.picture = pictureUrl(row.group_id, row.participant_picture_key);
  return view;
}

function toMe(row: MeRow, participants: ParticipantView[]): Me {
  return {
    group: toGroupView(row),
    participant: toParticipantView(row),
    wishlist: row.wishlist,
    participants,
  };
}

/** Replaces the caller's own wishlist; an empty one is removed. Null for an unknown token. */
export async function saveWishlist(db: D1Database, token: string, wishlist: string): Promise<Me | null> {
  const tokenHash = await hashToken(token);
  const statement = wishlist
    ? db
        .prepare(
          `INSERT INTO wishlists (participant_id, text)
           SELECT id, ? FROM participants WHERE token_hash = ?
           ON CONFLICT (participant_id) DO UPDATE SET text = excluded.text`,
        )
        .bind(wishlist, tokenHash)
    : db
        .prepare("DELETE FROM wishlists WHERE participant_id = (SELECT id FROM participants WHERE token_hash = ?)")
        .bind(tokenHash);
  await statement.run();
  return findMe(db, token);
}

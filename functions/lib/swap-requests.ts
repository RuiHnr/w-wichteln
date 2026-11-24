import type { Me, SwapError } from "../../shared/api";
import { completedSwapsOf, findMe } from "./groups";
import { checkSwap, type SwapSide } from "./swap";
import { hashToken } from "./tokens";

/**
 * Swap Requests between givers of a drawn group. The swap rules (checkSwap) are checked when
 * a request is sent and again when it is accepted; the accepting transaction re-checks that
 * nothing changed in between. Answers only ever hold the caller's own view (ADR 0003).
 */

export type SwapResult = { ok: true; me: Me } | { ok: false; reason: SwapError };

interface GiverRow {
  id: string;
  group_id: string;
  phase: string;
  swap_limit: number;
  recipient_id: string | null;
  completed: number;
}

const GIVER = `SELECT p.id, p.group_id, g.phase, g.swap_limit, a.recipient_id, ${completedSwapsOf("p.id")} AS completed
                 FROM participants p JOIN groups g ON g.id = p.group_id LEFT JOIN assignments a ON a.giver_id = p.id`;

async function giverByToken(db: D1Database, token: string): Promise<GiverRow | null> {
  return db.prepare(`${GIVER} WHERE p.token_hash = ?`).bind(await hashToken(token)).first<GiverRow>();
}

async function giverById(db: D1Database, groupId: string, participantId: string): Promise<GiverRow | null> {
  return db.prepare(`${GIVER} WHERE p.id = ? AND p.group_id = ?`).bind(participantId, groupId).first<GiverRow>();
}

const side = (row: GiverRow): SwapSide => ({ id: row.id, recipientId: row.recipient_id!, completedSwaps: row.completed });

async function exclusionsOf(db: D1Database, groupId: string): Promise<[string, string][]> {
  const { results } = await db
    .prepare("SELECT participant_a, participant_b FROM exclusions WHERE group_id = ?")
    .bind(groupId)
    .all<{ participant_a: string; participant_b: string }>();
  return results.map((e) => [e.participant_a, e.participant_b]);
}

/** The caller's fresh view after a successful change. */
async function changed(db: D1Database, token: string): Promise<SwapResult> {
  const me = await findMe(db, token);
  return me ? { ok: true, me } : { ok: false, reason: "unknown_token" };
}

/**
 * The caller asks another giver of their drawn group for a swap. Refused while they have an
 * open request already, at either side's Swap Limit, or when the swap would make someone
 * draw themselves or break an exclusion ("blocked").
 */
export async function sendSwapRequest(db: D1Database, token: string, receiverId: string): Promise<SwapResult> {
  const caller = await giverByToken(db, token);
  if (!caller) return { ok: false, reason: "unknown_token" };
  if (caller.phase !== "drawn" || !caller.recipient_id) return { ok: false, reason: "not_drawn" };
  if (receiverId === caller.id) return { ok: false, reason: "self" };
  const receiver = await giverById(db, caller.group_id, receiverId);
  if (!receiver?.recipient_id) return { ok: false, reason: "unknown_participant" };
  const open = await db.prepare("SELECT 1 FROM swap_requests WHERE sender_id = ? AND status = 'open'").bind(caller.id).first();
  if (open) return { ok: false, reason: "outgoing_open" };
  const check = checkSwap(side(caller), side(receiver), await exclusionsOf(db, caller.group_id), caller.swap_limit);
  if (!check.ok) return check;

  try {
    // Only while everything checked is as read: a reset and new draw, or a swap of either
    // giver committed meanwhile, would otherwise leave a request the expiry already passed by.
    const inserted = await db
      .prepare(
        `INSERT INTO swap_requests (id, group_id, sender_id, receiver_id)
         SELECT ?, g.id, ?, ? FROM groups g
          WHERE g.id = ? AND g.phase = 'drawn' AND g.swap_limit = ?
            AND (SELECT recipient_id FROM assignments a WHERE a.giver_id = ?) = ?
            AND (SELECT recipient_id FROM assignments a WHERE a.giver_id = ?) = ?
            AND ${completedSwapsOf("?")} = ? AND ${completedSwapsOf("?")} = ?`,
      )
      .bind(
        crypto.randomUUID(),
        caller.id,
        receiver.id,
        caller.group_id,
        caller.swap_limit,
        caller.id,
        caller.recipient_id,
        receiver.id,
        receiver.recipient_id,
        // completedSwapsOf names its participant twice
        caller.id,
        caller.id,
        caller.completed,
        receiver.id,
        receiver.id,
        receiver.completed,
      )
      .run();
    if (inserted.meta.changes !== 1) return { ok: false, reason: "changed" };
  } catch (error) {
    // Two requests sent at the same moment: the partial unique index lets only one stay open.
    if (!String(error).includes("UNIQUE")) throw error;
    return { ok: false, reason: "outgoing_open" };
  }
  return changed(db, token);
}

/** How often accepting is retried when something changed while it was being checked. */
const ACCEPT_ATTEMPTS = 3;

/**
 * The receiver accepts an open request: the Swap. Each of the two now gives to the other's
 * former recipient, the swap counts for both against the Swap Limit, and every other open
 * request that involves either of them expires. The swap rules are checked again first.
 */
export async function acceptSwapRequest(db: D1Database, token: string, requestId: string): Promise<SwapResult> {
  for (let attempt = 0; attempt < ACCEPT_ATTEMPTS; attempt++) {
    const caller = await giverByToken(db, token);
    if (!caller) return { ok: false, reason: "unknown_token" };
    const request = await db
      .prepare("SELECT sender_id FROM swap_requests WHERE id = ? AND receiver_id = ? AND status = 'open'")
      .bind(requestId, caller.id)
      .first<{ sender_id: string }>();
    if (!request) return { ok: false, reason: "unknown_swap_request" };
    const sender = await giverById(db, caller.group_id, request.sender_id);
    if (caller.phase !== "drawn" || !caller.recipient_id || !sender?.recipient_id) return { ok: false, reason: "not_drawn" };
    const check = checkSwap(side(caller), side(sender), await exclusionsOf(db, caller.group_id), caller.swap_limit);
    if (!check.ok) return check;

    if (await writeSwap(db, requestId, sender, caller)) return changed(db, token);
  }
  return { ok: false, reason: "changed" };
}

/**
 * Carries out an accepted request in one transaction. The first statement marks it
 * 'swapping' only if everything checked is still as read: the group drawn, both recipients,
 * both swap counts and the limit (exclusions cannot change while drawn). The others only act
 * on a 'swapping' request, so if anything changed, nothing does. True when the swap happened.
 */
async function writeSwap(db: D1Database, requestId: string, sender: GiverRow, receiver: GiverRow): Promise<boolean> {
  const swapping = "SELECT sender_id, receiver_id, sender_recipient_id, receiver_recipient_id, group_id FROM swap_requests WHERE id = ? AND status = 'swapping'";
  const [marked] = await db.batch([
    db
      .prepare(
        `UPDATE swap_requests SET status = 'swapping', sender_recipient_id = ?, receiver_recipient_id = ?
          WHERE id = ? AND status = 'open' AND sender_id = ? AND receiver_id = ?
            AND (SELECT phase FROM groups g WHERE g.id = swap_requests.group_id) = 'drawn'
            AND (SELECT swap_limit FROM groups g WHERE g.id = swap_requests.group_id) = ?
            AND (SELECT recipient_id FROM assignments a WHERE a.giver_id = swap_requests.sender_id) = ?
            AND (SELECT recipient_id FROM assignments a WHERE a.giver_id = swap_requests.receiver_id) = ?
            AND ${completedSwapsOf("swap_requests.sender_id")} = ? AND ${completedSwapsOf("swap_requests.receiver_id")} = ?
          RETURNING id`,
      )
      .bind(
        sender.recipient_id,
        receiver.recipient_id,
        requestId,
        sender.id,
        receiver.id,
        receiver.swap_limit,
        sender.recipient_id,
        receiver.recipient_id,
        sender.completed,
        receiver.completed,
      ),
    // Recipients are unique, which SQLite checks row by row, so the two rows are replaced rather than updated.
    db
      .prepare(
        `DELETE FROM assignments WHERE giver_id IN (
           SELECT sender_id FROM (${swapping}) UNION SELECT receiver_id FROM (${swapping}))`,
      )
      .bind(requestId, requestId),
    db
      .prepare(
        `INSERT INTO assignments (giver_id, recipient_id, group_id)
         SELECT sender_id, receiver_recipient_id, group_id FROM (${swapping})
         UNION ALL SELECT receiver_id, sender_recipient_id, group_id FROM (${swapping})`,
      )
      .bind(requestId, requestId),
    // Every other open request involving either of the two expires.
    db
      .prepare(
        `DELETE FROM swap_requests WHERE status = 'open' AND EXISTS (
           SELECT 1 FROM (${swapping}) done
            WHERE swap_requests.sender_id IN (done.sender_id, done.receiver_id)
               OR swap_requests.receiver_id IN (done.sender_id, done.receiver_id))`,
      )
      .bind(requestId),
    db.prepare("UPDATE swap_requests SET status = 'accepted' WHERE id = ? AND status = 'swapping'").bind(requestId),
  ]);
  return marked.results.length === 1;
}

/**
 * Ends an open request without a swap: the receiver declines it or the sender withdraws it.
 * The row goes, so it counts for nothing.
 */
export async function endSwapRequest(
  db: D1Database,
  token: string,
  requestId: string,
  as: "receiver" | "sender",
): Promise<SwapResult> {
  const column = as === "receiver" ? "receiver_id" : "sender_id";
  const deleted = await db
    .prepare(
      `DELETE FROM swap_requests WHERE id = ? AND status = 'open'
          AND ${column} = (SELECT id FROM participants WHERE token_hash = ?)
        RETURNING id`,
    )
    .bind(requestId, await hashToken(token))
    .all();
  if (deleted.results.length === 1) return changed(db, token);
  return (await findMe(db, token)) ? { ok: false, reason: "unknown_swap_request" } : { ok: false, reason: "unknown_token" };
}

const statusOf: Record<SwapError, number> = {
  unknown_token: 401,
  unknown_participant: 404,
  unknown_swap_request: 404,
  not_drawn: 409,
  self: 409,
  outgoing_open: 409,
  limit_reached: 409,
  partner_limit_reached: 409,
  blocked: 409,
  changed: 409,
};

/** The error body and status the API answers a refused swap action with. */
export function swapErrorResponse(error: SwapError): Response {
  return Response.json({ error }, { status: statusOf[error] });
}

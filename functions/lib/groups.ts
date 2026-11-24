import type { GroupPhase, Me } from "../../shared/api";
import type { GroupInput } from "../../shared/group-input";
import { hashToken, newInviteCode, newToken } from "./tokens";

/** Creates a group with its creator as first organizer and participant. */
export async function createGroup(db: D1Database, input: GroupInput): Promise<{ token: string; me: Me }> {
  const groupId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const inviteCode = newInviteCode();
  const token = newToken();

  await db.batch([
    db
      .prepare("INSERT INTO groups (id, invite_code, name, budget_cents, exchange_date) VALUES (?, ?, ?, ?, ?)")
      .bind(groupId, inviteCode, input.name, input.budgetCents, input.exchangeDate),
    db
      .prepare("INSERT INTO participants (id, group_id, name, token_hash, is_organizer) VALUES (?, ?, ?, ?, 1)")
      .bind(participantId, groupId, input.organizerName, await hashToken(token)),
  ]);

  return {
    token,
    me: {
      group: {
        id: groupId,
        name: input.name,
        budgetCents: input.budgetCents,
        exchangeDate: input.exchangeDate,
        phase: "open",
        inviteCode,
      },
      participant: { id: participantId, name: input.organizerName, isOrganizer: true },
    },
  };
}

interface MeRow {
  group_id: string;
  group_name: string;
  budget_cents: number;
  exchange_date: string;
  phase: GroupPhase;
  invite_code: string;
  participant_id: string;
  participant_name: string;
  is_organizer: number;
}

/** The participant a token belongs to, with their group; null for an unknown token. */
export async function findMe(db: D1Database, token: string): Promise<Me | null> {
  const row = await db
    .prepare(
      `SELECT g.id AS group_id, g.name AS group_name, g.budget_cents, g.exchange_date, g.phase, g.invite_code,
              p.id AS participant_id, p.name AS participant_name, p.is_organizer
         FROM participants p JOIN groups g ON g.id = p.group_id
        WHERE p.token_hash = ?`,
    )
    .bind(await hashToken(token))
    .first<MeRow>();
  if (!row) return null;
  return {
    group: {
      id: row.group_id,
      name: row.group_name,
      budgetCents: row.budget_cents,
      exchangeDate: row.exchange_date,
      phase: row.phase,
      inviteCode: row.invite_code,
    },
    participant: { id: row.participant_id, name: row.participant_name, isOrganizer: row.is_organizer === 1 },
  };
}

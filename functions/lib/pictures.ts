import type { Me, PictureError } from "../../shared/api";
import { validatePicture } from "../../shared/picture";
import type { Env } from "../env";
import { findMe } from "./groups";
import { findOrganizer } from "./manage";
import { deletePictureObjects, newPictureKey } from "./picture-storage";
import { hashToken } from "./tokens";

export type PictureResult = { ok: true; me: Me } | { ok: false; reason: PictureError };

export const pictureErrorStatus: Record<PictureError, number> = {
  unknown_token: 401,
  not_organizer: 403,
  not_self: 403,
  too_large: 413,
  wrong_format: 415,
  unavailable: 503,
};

export function pictureErrorResponse(error: PictureError): Response {
  return Response.json({ error }, { status: pictureErrorStatus[error] });
}

/** What differs between the two kinds of picture: whose row it is and who may change it. */
interface Target {
  groupId: string;
  /** Who may change it, as `[SQL condition on the row, its binds]`, and the error otherwise. */
  guard: { table: "groups" | "participants"; where: string; binds: unknown[]; refusal: PictureError };
  /** The caller's rights, checked before anything else. */
  authorise: () => Promise<{ ok: true; currentKey: string | null } | { ok: false; reason: PictureError }>;
}

async function groupTarget(env: Env, token: string | null, groupId: string): Promise<Target> {
  const tokenHash = token ? await hashToken(token) : "";
  return {
    groupId,
    guard: {
      table: "groups",
      where: `id = ? AND EXISTS (SELECT 1 FROM participants caller WHERE caller.token_hash = ? AND caller.group_id = groups.id AND caller.is_organizer = 1)`,
      binds: [groupId, tokenHash],
      refusal: "not_organizer",
    },
    async authorise() {
      const caller = await findOrganizer(env.DB, token, groupId);
      if (!caller.ok) return { ok: false, reason: caller.reason === "unknown_token" ? "unknown_token" : "not_organizer" };
      const row = await env.DB.prepare("SELECT picture_key FROM groups WHERE id = ?").bind(groupId).first<{ picture_key: string | null }>();
      return { ok: true, currentKey: row?.picture_key ?? null };
    },
  };
}

async function participantTarget(env: Env, token: string | null, groupId: string, participantId: string): Promise<Target> {
  const tokenHash = token ? await hashToken(token) : "";
  return {
    groupId,
    guard: { table: "participants", where: "id = ? AND group_id = ? AND token_hash = ?", binds: [participantId, groupId, tokenHash], refusal: "not_self" },
    async authorise() {
      const me = token ? await findMe(env.DB, token) : null;
      if (!me) return { ok: false, reason: "unknown_token" };
      // Only ever the caller's own picture, whoever else is named: no organizer exception.
      if (me.group.id !== groupId || me.participant.id !== participantId) return { ok: false, reason: "not_self" };
      const row = await env.DB.prepare("SELECT picture_key FROM participants WHERE id = ?")
        .bind(participantId)
        .first<{ picture_key: string | null }>();
      return { ok: true, currentKey: row?.picture_key ?? null };
    },
  };
}

/** Sets the row's picture key, if the guard still holds; true when it did. */
async function setKey(env: Env, target: Target, key: string | null): Promise<boolean> {
  const { table, where, binds } = target.guard;
  const updated = await env.DB.prepare(`UPDATE ${table} SET picture_key = ? WHERE ${where}`).bind(key, ...binds).run();
  return updated.meta.changes === 1;
}

/** The caller's fresh view after a change. */
async function fresh(env: Env, token: string): Promise<PictureResult> {
  const me = await findMe(env.DB, token);
  return me ? { ok: true, me } : { ok: false, reason: "unknown_token" };
}

/**
 * Replaces the picture: rights first, then what the upload is, then the bucket. The new image is
 * stored before the row points at it, and the old one is deleted after, so the row never points
 * at a missing image. `bytes` is null when the upload was over the limit and left unread.
 */
async function replace(env: Env, token: string | null, target: Target, bytes: Uint8Array | null): Promise<PictureResult> {
  const allowed = await target.authorise();
  if (!allowed.ok) return allowed;
  const checked = validatePicture(bytes);
  if (!checked.ok) return { ok: false, reason: checked.error };
  if (!env.PICTURES) return { ok: false, reason: "unavailable" };

  const key = newPictureKey();
  await env.PICTURES.put(`${target.groupId}/${key}`, bytes!, { httpMetadata: { contentType: checked.type } });
  if (!(await setKey(env, target, key))) {
    await deletePictureObjects(env.PICTURES, target.groupId, [key]);
    return { ok: false, reason: target.guard.refusal };
  }
  await deletePictureObjects(env.PICTURES, target.groupId, [allowed.currentKey]);
  return fresh(env, token!);
}

async function remove(env: Env, token: string | null, target: Target): Promise<PictureResult> {
  const allowed = await target.authorise();
  if (!allowed.ok) return allowed;
  if (!(await setKey(env, target, null))) return { ok: false, reason: target.guard.refusal };
  await deletePictureObjects(env.PICTURES, target.groupId, [allowed.currentKey]);
  return fresh(env, token!);
}

/** Any organizer sets or replaces the Group Picture, in either phase. */
export async function setGroupPicture(env: Env, token: string | null, groupId: string, bytes: Uint8Array | null) {
  return replace(env, token, await groupTarget(env, token, groupId), bytes);
}

/** Any organizer removes the Group Picture. */
export async function removeGroupPicture(env: Env, token: string | null, groupId: string) {
  return remove(env, token, await groupTarget(env, token, groupId));
}

/** A participant sets or replaces their own Participant Picture, in either phase; nobody else may. */
export async function setParticipantPicture(env: Env, token: string | null, groupId: string, participantId: string, bytes: Uint8Array | null) {
  return replace(env, token, await participantTarget(env, token, groupId, participantId), bytes);
}

/** A participant removes their own Participant Picture; nobody else may. */
export async function removeParticipantPicture(env: Env, token: string | null, groupId: string, participantId: string) {
  return remove(env, token, await participantTarget(env, token, groupId, participantId));
}

/** Reads an upload's body unless it is announced as over the limit; null then, which `validatePicture` reports as too large. */
export async function readUpload(request: Request, limit: number): Promise<Uint8Array | null> {
  const announced = Number(request.headers.get("content-length"));
  if (announced > limit) return null;
  return new Uint8Array(await request.arrayBuffer());
}

import type { Me, PictureError } from "../../shared/api";
import { validatePicture } from "../../shared/picture";
import type { Env } from "../env";
import { findMe } from "./groups";
import { findOrganizer } from "./manage";
import { newPictureKey } from "./picture-storage";
import { hashToken } from "./tokens";

/** Reads the uploaded image; null when it is over the size limit. Called only for callers who may upload. */
export type Upload = () => Promise<Uint8Array | null>;

export type PictureResult = { ok: true; me: Me } | { ok: false; reason: PictureError };

export const pictureErrorStatus: Record<PictureError, number> = {
  unknown_token: 401,
  not_organizer: 403,
  not_self: 403,
  too_large: 413,
  wrong_format: 415,
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
  authorise: () => Promise<{ ok: true } | { ok: false; reason: PictureError }>;
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
      return { ok: true };
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
      return { ok: true };
    },
  };
}

/** The caller's fresh view after a change. */
async function fresh(env: Env, token: string): Promise<PictureResult> {
  const me = await findMe(env.DB, token);
  return me ? { ok: true, me } : { ok: false, reason: "unknown_token" };
}

/** The current picture of the row, if the guard holds: the one to delete when it is replaced or removed. */
function deleteCurrent(env: Env, target: Target): D1PreparedStatement {
  const { table, where, binds } = target.guard;
  return env.DB.prepare(`DELETE FROM pictures WHERE key = (SELECT picture_key FROM ${table} WHERE ${where})`).bind(...binds);
}

/** Points the row at `key`, if the guard still holds. */
function pointAt(env: Env, target: Target, key: string | null): D1PreparedStatement {
  const { table, where, binds } = target.guard;
  return env.DB.prepare(`UPDATE ${table} SET picture_key = ? WHERE ${where}`).bind(key, ...binds);
}

/**
 * Replaces the picture: rights first, then what the upload is. Storing the new image, deleting
 * the old one and pointing the row at the new one are one batch (a transaction), each guarded
 * by the same condition, so either all happen or none: no image is ever left without its row.
 * The upload is read only once the caller is known to be allowed.
 */
async function replace(env: Env, token: string | null, target: Target, upload: Upload): Promise<PictureResult> {
  const allowed = await target.authorise();
  if (!allowed.ok) return allowed;
  const bytes = await upload();
  const checked = validatePicture(bytes);
  if (!checked.ok) return { ok: false, reason: checked.error };

  const key = newPictureKey();
  const { table, where, binds } = target.guard;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO pictures (key, group_id, content_type, data) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${where})`,
    ).bind(key, target.groupId, checked.type, bytes!.buffer.slice(bytes!.byteOffset, bytes!.byteOffset + bytes!.byteLength), ...binds),
    deleteCurrent(env, target),
    pointAt(env, target, key),
  ]);
  if (results[2].meta.changes !== 1) return { ok: false, reason: target.guard.refusal };
  return fresh(env, token!);
}

/** Removes the picture: deleting the image and clearing the row are one batch, guarded alike. */
async function remove(env: Env, token: string | null, target: Target): Promise<PictureResult> {
  const allowed = await target.authorise();
  if (!allowed.ok) return allowed;
  const results = await env.DB.batch([deleteCurrent(env, target), pointAt(env, target, null)]);
  if (results[1].meta.changes !== 1) return { ok: false, reason: target.guard.refusal };
  return fresh(env, token!);
}

/** Any organizer sets or replaces the Group Picture, in either phase. */
export async function setGroupPicture(env: Env, token: string | null, groupId: string, upload: Upload) {
  return replace(env, token, await groupTarget(env, token, groupId), upload);
}

/** Any organizer removes the Group Picture. */
export async function removeGroupPicture(env: Env, token: string | null, groupId: string) {
  return remove(env, token, await groupTarget(env, token, groupId));
}

/** A participant sets or replaces their own Participant Picture, in either phase; nobody else may. */
export async function setParticipantPicture(env: Env, token: string | null, groupId: string, participantId: string, upload: Upload) {
  return replace(env, token, await participantTarget(env, token, groupId, participantId), upload);
}

/** A participant removes their own Participant Picture; nobody else may. */
export async function removeParticipantPicture(env: Env, token: string | null, groupId: string, participantId: string) {
  return remove(env, token, await participantTarget(env, token, groupId, participantId));
}

/**
 * Reads the body of an upload, stopping as soon as it is over `limit` bytes, whatever the
 * request announces: null then, which `validatePicture` reports as too large.
 */
export async function readUpload(request: Request, limit: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > limit) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

import type { ExclusionErrorResponse, ExclusionInputError, Me } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { addExclusion, findOrganizer, manageErrorResponse } from "../../../../lib/manage";
import { bearerToken } from "../../../../lib/tokens";

/** The two participant ids of `{ participantIds: [a, b] }`, or why the body is not that. */
function readParticipantIds(body: unknown): { ok: true; ids: [string, string] } | { ok: false; error: ExclusionInputError } {
  const ids = typeof body === "object" && body !== null ? (body as { participantIds?: unknown }).participantIds : null;
  if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((id) => typeof id === "string" && id !== "")) {
    return { ok: false, error: "invalid" };
  }
  if (ids[0] === ids[1]) return { ok: false, error: "same" };
  return { ok: true, ids: [ids[0], ids[1]] };
}

/**
 * An organizer adds an exclusion with `{ participantIds: [a, b] }` while the group is open.
 * Adding one that exists already, in either order, changes nothing. Answers with the caller's fresh view.
 */
export const onRequestPost: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const input = readParticipantIds(await request.json().catch(() => null));
  if (!input.ok) {
    return Response.json({ errors: { participantIds: input.error } } satisfies ExclusionErrorResponse, { status: 400 });
  }

  const result = await addExclusion(env.DB, token!, groupId, input.ids);
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

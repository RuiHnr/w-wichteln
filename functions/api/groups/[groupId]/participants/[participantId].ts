import type { Me, OrganizerErrorResponse } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { findOrganizer, manageErrorResponse, removeParticipant, setOrganizer } from "../../../../lib/manage";
import { bearerToken } from "../../../../lib/tokens";

type Params = "groupId" | "participantId";

/** An organizer grants or revokes the Organizer role with `{ isOrganizer }`. Answers with the caller's fresh view. */
export const onRequestPatch: PagesFunction<Env, Params> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const body: unknown = await request.json().catch(() => null);
  const isOrganizer = typeof body === "object" && body !== null ? (body as { isOrganizer?: unknown }).isOrganizer : null;
  if (typeof isOrganizer !== "boolean") {
    return Response.json({ errors: { isOrganizer: "invalid" } } satisfies OrganizerErrorResponse, { status: 400 });
  }

  const result = await setOrganizer(env.DB, token!, groupId, String(params.participantId), isOrganizer);
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

/** An organizer removes a participant while the group is open. Answers with the caller's fresh view. */
export const onRequestDelete: PagesFunction<Env, Params> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const result = await removeParticipant(env.DB, token!, groupId, String(params.participantId));
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

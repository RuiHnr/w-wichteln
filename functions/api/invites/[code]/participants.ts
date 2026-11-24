import type { CreateGroupResponse, JoinErrorResponse } from "../../../../shared/api";
import { validateParticipantName } from "../../../../shared/group-input";
import type { Env } from "../../../env";
import { joinGroup } from "../../../lib/groups";

/** Joins the group behind the Invite Link under the name in the body. */
export const onRequestPost: PagesFunction<Env, "code"> = async ({ request, env, params }) => {
  const body: unknown = await request.json().catch(() => null);
  const name = validateParticipantName(typeof body === "object" && body !== null ? (body as { name?: unknown }).name : null);
  if (!name.ok) return Response.json({ errors: { name: name.error } } satisfies JoinErrorResponse, { status: 400 });

  const result = await joinGroup(env.DB, String(params.code), name.value);
  if (result.ok) return Response.json({ token: result.token, me: result.me } satisfies CreateGroupResponse, { status: 201 });
  if (result.reason === "taken") return Response.json({ errors: { name: "taken" } } satisfies JoinErrorResponse, { status: 409 });
  if (result.reason === "closed") return Response.json({ error: "closed" }, { status: 409 });
  return Response.json({ error: "unknown_group" }, { status: 404 });
};

import type { Me } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { findOrganizer, manageErrorResponse, removeExclusion } from "../../../../lib/manage";
import { bearerToken } from "../../../../lib/tokens";

/** An organizer removes an exclusion while the group is open. Answers with the caller's fresh view. */
export const onRequestDelete: PagesFunction<Env, "groupId" | "exclusionId"> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const result = await removeExclusion(env.DB, token!, groupId, String(params.exclusionId));
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

import type { Me } from "../../../../shared/api";
import type { Env } from "../../../env";
import { drawGroup, findOrganizer, manageErrorResponse } from "../../../lib/manage";
import { bearerToken } from "../../../lib/tokens";

/**
 * An organizer draws the open group. Answers with the caller's fresh view, which holds
 * only their own recipient (ADR 0003); 409 too_few or impossible leaves the group open.
 */
export const onRequestPost: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const result = await drawGroup(env.DB, token!, groupId);
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

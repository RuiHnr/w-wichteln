import type { RenewLinkResponse } from "../../../../../../shared/api";
import type { Env } from "../../../../../env";
import { manageErrorResponse, renewLink } from "../../../../../lib/manage";
import { bearerToken } from "../../../../../lib/tokens";

/**
 * Link Renewal (ADR 0004): an organizer creates a new Personal Link for a participant, in
 * either phase. Answers with the new token, which is never shown again, and the caller's fresh view.
 */
export const onRequestPost: PagesFunction<Env, "groupId" | "participantId"> = async ({ request, env, params }) => {
  const token = bearerToken(request);
  if (!token) return manageErrorResponse("unknown_token");
  const result = await renewLink(env.DB, token, String(params.groupId), String(params.participantId));
  if (!result.ok) return manageErrorResponse(result.reason);
  return Response.json({ token: result.token, me: result.me } satisfies RenewLinkResponse);
};

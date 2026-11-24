import type { Me } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { acceptSwapRequest, swapErrorResponse } from "../../../../lib/swap-requests";
import { bearerToken } from "../../../../lib/tokens";

/**
 * The receiver accepts a Swap Request: the Swap. Answers with the caller's fresh view, which
 * shows their new recipient and nobody else's.
 */
export const onRequestPost: PagesFunction<Env, "requestId"> = async ({ request, env, params }) => {
  const token = bearerToken(request);
  if (!token) return swapErrorResponse("unknown_token");
  const result = await acceptSwapRequest(env.DB, token, String(params.requestId));
  return result.ok ? Response.json(result.me satisfies Me) : swapErrorResponse(result.reason);
};

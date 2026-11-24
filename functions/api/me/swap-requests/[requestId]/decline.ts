import type { Me } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { endSwapRequest, swapErrorResponse } from "../../../../lib/swap-requests";
import { bearerToken } from "../../../../lib/tokens";

/** The receiver declines a Swap Request. Nothing is swapped and it does not count. */
export const onRequestPost: PagesFunction<Env, "requestId"> = async ({ request, env, params }) => {
  const token = bearerToken(request);
  if (!token) return swapErrorResponse("unknown_token");
  const result = await endSwapRequest(env.DB, token, String(params.requestId), "receiver");
  return result.ok ? Response.json(result.me satisfies Me) : swapErrorResponse(result.reason);
};

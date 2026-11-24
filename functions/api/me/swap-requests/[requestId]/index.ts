import type { Me } from "../../../../../shared/api";
import type { Env } from "../../../../env";
import { endSwapRequest, swapErrorResponse } from "../../../../lib/swap-requests";
import { bearerToken } from "../../../../lib/tokens";

/** The sender withdraws their open Swap Request, and can then send a new one. */
export const onRequestDelete: PagesFunction<Env, "requestId"> = async ({ request, env, params }) => {
  const token = bearerToken(request);
  if (!token) return swapErrorResponse("unknown_token");
  const result = await endSwapRequest(env.DB, token, String(params.requestId), "sender");
  return result.ok ? Response.json(result.me satisfies Me) : swapErrorResponse(result.reason);
};

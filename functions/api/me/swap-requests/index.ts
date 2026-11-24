import type { Me } from "../../../../shared/api";
import type { Env } from "../../../env";
import { sendSwapRequest, swapErrorResponse } from "../../../lib/swap-requests";
import { bearerToken } from "../../../lib/tokens";

/**
 * The caller sends a Swap Request to another giver of their drawn group, picked by
 * participant id: `{ receiverId }`. Answers with the caller's fresh view.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = bearerToken(request);
  if (!token) return swapErrorResponse("unknown_token");
  const body: unknown = await request.json().catch(() => null);
  const receiverId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).receiverId : undefined;
  if (typeof receiverId !== "string") return swapErrorResponse("unknown_participant");

  const result = await sendSwapRequest(env.DB, token, receiverId);
  return result.ok ? Response.json(result.me satisfies Me) : swapErrorResponse(result.reason);
};

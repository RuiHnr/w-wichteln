import type { Me, SwapLimitErrorResponse } from "../../../../shared/api";
import { validateSwapLimit } from "../../../../shared/group-input";
import type { Env } from "../../../env";
import { findOrganizer, manageErrorResponse, setSwapLimit } from "../../../lib/manage";
import { bearerToken } from "../../../lib/tokens";

/** An organizer sets the Swap Limit, 0 to 5, in either phase. Answers with the caller's fresh view. */
export const onRequestPut: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const body: unknown = await request.json().catch(() => null);
  const swapLimit = validateSwapLimit(body);
  if (swapLimit === null) return Response.json({ errors: { swapLimit: "invalid" } } satisfies SwapLimitErrorResponse, { status: 400 });

  const result = await setSwapLimit(env.DB, token!, groupId, swapLimit);
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

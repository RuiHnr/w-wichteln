import type { Me, SettingsErrorResponse } from "../../../../shared/api";
import { validateGroupSettings } from "../../../../shared/group-input";
import type { Env } from "../../../env";
import { earliestExchangeDate } from "../../../lib/dates";
import { findOrganizer, manageErrorResponse, updateGroupSettings } from "../../../lib/manage";
import { bearerToken } from "../../../lib/tokens";

/** An organizer changes budget and exchange date, in either phase. Answers with the caller's fresh view. */
export const onRequestPatch: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const groupId = String(params.groupId);
  const token = bearerToken(request);
  const caller = await findOrganizer(env.DB, token, groupId);
  if (!caller.ok) return manageErrorResponse(caller.reason);

  const body: unknown = await request.json().catch(() => null);
  const settings = validateGroupSettings(body, earliestExchangeDate(), caller.me.group.exchangeDate);
  if (!settings.ok) return Response.json({ errors: settings.errors } satisfies SettingsErrorResponse, { status: 400 });

  const result = await updateGroupSettings(env.DB, token!, groupId, settings.value);
  return result.ok ? Response.json(result.me satisfies Me) : manageErrorResponse(result.reason);
};

import type { Me, SettingsErrorResponse } from "../../../../shared/api";
import { validateGroupSettings } from "../../../../shared/group-input";
import type { Env } from "../../../env";
import { earliestExchangeDate } from "../../../lib/dates";
import { deleteGroup, findOrganizer, manageErrorResponse, updateGroupSettings } from "../../../lib/manage";
import { bearerToken } from "../../../lib/tokens";

/**
 * Whether the group still exists, so the page can tell a deleted group (expired, or by a
 * Group Deletion) from a link this device just has no valid token for. Reveals nothing else.
 */
export const onRequestGet: PagesFunction<Env, "groupId"> = async ({ env, params }) => {
  const found = await env.DB.prepare("SELECT 1 AS found FROM groups WHERE id = ?").bind(String(params.groupId)).first();
  return found ? new Response(null, { status: 204 }) : Response.json({ error: "unknown_group" }, { status: 404 });
};

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

/**
 * Group Deletion: an organizer deletes the group with everything in it, in either phase.
 * Answers 204; afterwards the group, its Invite Link and every Personal Link are unknown.
 */
export const onRequestDelete: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const result = await deleteGroup(env.DB, bearerToken(request), String(params.groupId), env.PICTURES);
  return result.ok ? new Response(null, { status: 204 }) : manageErrorResponse(result.reason);
};

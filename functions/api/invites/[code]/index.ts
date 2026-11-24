import type { Env } from "../../../env";
import { findInvite } from "../../../lib/groups";

/** What the Invite Link leads to, so the join page can show it before anyone enters a name. */
export const onRequestGet: PagesFunction<Env, "code"> = async ({ env, params }) => {
  const invite = await findInvite(env.DB, String(params.code));
  if (!invite) return Response.json({ error: "unknown_group" }, { status: 404 });
  return Response.json(invite);
};

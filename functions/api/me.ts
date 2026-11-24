import type { Env } from "../env";
import { findMe } from "../lib/groups";
import { bearerToken } from "../lib/tokens";

/** Who the caller is, from the token in `Authorization: Bearer <token>`. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = bearerToken(request);
  const me = token ? await findMe(env.DB, token) : null;
  if (!me) return Response.json({ error: "unknown_token" }, { status: 401 });
  return Response.json(me);
};

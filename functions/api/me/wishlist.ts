import type { Me, WishlistErrorResponse } from "../../../shared/api";
import { validateWishlist } from "../../../shared/wishlist";
import type { Env } from "../../env";
import { saveWishlist } from "../../lib/groups";
import { bearerToken } from "../../lib/tokens";

/**
 * The caller writes, edits or clears (empty text) their own wishlist, in either phase.
 * Answers with the caller's fresh view.
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: "unknown_token" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).wishlist : undefined;
  const wishlist = validateWishlist(raw);
  if (!wishlist.ok) return Response.json({ errors: { wishlist: wishlist.error } } satisfies WishlistErrorResponse, { status: 400 });

  const me = await saveWishlist(env.DB, token, wishlist.value);
  if (!me) return Response.json({ error: "unknown_token" }, { status: 401 });
  return Response.json(me satisfies Me);
};

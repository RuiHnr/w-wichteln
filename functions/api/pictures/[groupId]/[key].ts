import type { Env } from "../../../env";
import { PICTURE_KEY } from "../../../lib/picture-storage";

/**
 * Serves a Group Picture or Participant Picture by its random key. Not behind a token: the
 * unguessable key is the protection. A key is never reused; the cache lifetime is short so a
 * removed picture does not linger in caches for long.
 */
export const onRequestGet: PagesFunction<Env, "groupId" | "key"> = async ({ env, params }) => {
  const groupId = String(params.groupId);
  const key = String(params.key);
  const notFound = () => Response.json({ error: "unknown_picture" }, { status: 404 });
  if (!env.PICTURES || !PICTURE_KEY.test(key) || groupId.includes("/")) return notFound();

  const object = await env.PICTURES.get(`${groupId}/${key}`);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
};

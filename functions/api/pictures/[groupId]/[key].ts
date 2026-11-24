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
  if (!PICTURE_KEY.test(key)) return notFound();

  const picture = await env.DB.prepare("SELECT content_type, data FROM pictures WHERE key = ? AND group_id = ?")
    .bind(key, groupId)
    .first<{ content_type: string; data: ArrayBuffer | number[] }>();
  if (!picture) return notFound();
  return new Response(new Uint8Array(picture.data), {
    headers: {
      "content-type": picture.content_type,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
};

import type { Me } from "../../../../shared/api";
import { MAX_PICTURE_BYTES } from "../../../../shared/picture";
import type { Env } from "../../../env";
import { pictureErrorResponse, readUpload, removeGroupPicture, setGroupPicture } from "../../../lib/pictures";
import { bearerToken } from "../../../lib/tokens";

/**
 * An organizer sets or replaces the Group Picture, in either phase: the body is the image itself
 * (JPEG, PNG or WebP). Answers with the caller's fresh view.
 */
export const onRequestPut: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const upload = await readUpload(request, MAX_PICTURE_BYTES);
  const result = await setGroupPicture(env, bearerToken(request), String(params.groupId), upload);
  return result.ok ? Response.json(result.me satisfies Me) : pictureErrorResponse(result.reason);
};

/** An organizer removes the Group Picture. Answers with the caller's fresh view. */
export const onRequestDelete: PagesFunction<Env, "groupId"> = async ({ request, env, params }) => {
  const result = await removeGroupPicture(env, bearerToken(request), String(params.groupId));
  return result.ok ? Response.json(result.me satisfies Me) : pictureErrorResponse(result.reason);
};

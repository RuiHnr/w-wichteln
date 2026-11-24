import type { Me } from "../../../../../../shared/api";
import { MAX_PICTURE_BYTES } from "../../../../../../shared/picture";
import type { Env } from "../../../../../env";
import { pictureErrorResponse, readUpload, removeParticipantPicture, setParticipantPicture } from "../../../../../lib/pictures";
import { bearerToken } from "../../../../../lib/tokens";

type Params = "groupId" | "participantId";

/**
 * A participant sets or replaces their own Participant Picture, in either phase: the body is the
 * image itself (JPEG, PNG or WebP). Anyone else, organizers included, is refused with 403 not_self.
 * Answers with the caller's fresh view.
 */
export const onRequestPut: PagesFunction<Env, Params> = async ({ request, env, params }) => {
  const upload = () => readUpload(request, MAX_PICTURE_BYTES);
  const result = await setParticipantPicture(env, bearerToken(request), String(params.groupId), String(params.participantId), upload);
  return result.ok ? Response.json(result.me satisfies Me) : pictureErrorResponse(result.reason);
};

/** A participant removes their own Participant Picture; nobody else may. Answers with the caller's fresh view. */
export const onRequestDelete: PagesFunction<Env, Params> = async ({ request, env, params }) => {
  const result = await removeParticipantPicture(env, bearerToken(request), String(params.groupId), String(params.participantId));
  return result.ok ? Response.json(result.me satisfies Me) : pictureErrorResponse(result.reason);
};

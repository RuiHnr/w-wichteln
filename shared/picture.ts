/** What a Group Picture or Participant Picture may be; the server enforces it, the browser scales to fit. */

/** The most bytes an uploaded picture may have. */
export const MAX_PICTURE_BYTES = 1_000_000;

export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PictureType = (typeof PICTURE_TYPES)[number];

/** The longest side the browser scales a picture down to before uploading it. */
export const PICTURE_MAX_SIDE = 1024;

/** The format of the image bytes judged by their signature, not by what the sender claims; null when it is none of ours. */
export function sniffPictureType(bytes: Uint8Array): PictureType | null {
  const starts = (signature: number[], at = 0) => signature.every((byte, i) => bytes[at + i] === byte);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Why an upload was refused for what it is, as opposed to who sends it. */
export type PictureInputError = "too_large" | "wrong_format";

/** `bytes` is null when the upload was already known to be over the limit and was not read. */
export function validatePicture(bytes: Uint8Array | null): { ok: true; type: PictureType } | { ok: false; error: PictureInputError } {
  if (bytes === null || bytes.byteLength > MAX_PICTURE_BYTES) return { ok: false, error: "too_large" };
  const type = sniffPictureType(bytes);
  return type ? { ok: true, type } : { ok: false, error: "wrong_format" };
}

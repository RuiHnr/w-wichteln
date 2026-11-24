import { PICTURE_MAX_SIDE } from "../shared/picture";

/** The size an image gets when its longer side may be at most `max`; never larger than it is. */
export function fitWithin(width: number, height: number, max = PICTURE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The letters that stand in for a participant without a Participant Picture: the first letters of their first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return letters.map((word) => [...word][0].toLocaleUpperCase("de")).join("");
}

/**
 * Scales a chosen image down in the browser and re-encodes it as JPEG, so the upload is small
 * whatever the camera produced. Transparent areas turn white. Rejects when the browser cannot
 * read the file as an image (HEIC, a text file renamed .jpg, ...).
 */
export async function scaleDown(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("the browser could not encode the picture");
    return blob;
  } finally {
    bitmap.close();
  }
}

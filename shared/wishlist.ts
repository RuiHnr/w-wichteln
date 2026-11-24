/**
 * Rules for a participant's Wishlist. Shared by the form (instant feedback) and the API
 * (the authority), so both always agree.
 */

export const MAX_WISHLIST_LENGTH = 1000;

export type WishlistError = "invalid" | "tooLong";

export type WishlistResult = { ok: true; value: string } | { ok: false; error: WishlistError };

/** Free text, trimmed; empty clears the wishlist. At most 1000 characters (UTF-16 code units). */
export function validateWishlist(raw: unknown): WishlistResult {
  if (typeof raw !== "string") return { ok: false, error: "invalid" };
  const wishlist = raw.trim();
  // UTF-16 code units, as the textarea's maxlength counts them, so form and API agree.
  if (wishlist.length > MAX_WISHLIST_LENGTH) return { ok: false, error: "tooLong" };
  return { ok: true, value: wishlist };
}

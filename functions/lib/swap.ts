/**
 * Whether a Swap between two givers may happen: the rules the server checks both when a
 * Swap Request is sent and when it is accepted. Pure, so it runs and is tested without
 * the database.
 */

/** One giver of a swap, as the server knows them. */
export interface SwapSide {
  id: string;
  /** Whom they give to now. */
  recipientId: string;
  /** How many swaps they took part in so far, whether they sent or accepted the request. */
  completedSwaps: number;
}

export type SwapCheck = { ok: true } | { ok: false; reason: "limit_reached" | "partner_limit_reached" | "blocked" };

/**
 * Checks a swap between the caller and their partner under the group's Swap Limit. After it,
 * each gives to the other's former recipient, so nobody may end up with themselves and no
 * exclusion may be broken. A participant at the limit can take part in no further swap.
 */
export function checkSwap(
  caller: SwapSide,
  partner: SwapSide,
  exclusions: readonly (readonly [string, string])[],
  swapLimit: number,
): SwapCheck {
  if (caller.completedSwaps >= swapLimit) return { ok: false, reason: "limit_reached" };
  if (partner.completedSwaps >= swapLimit) return { ok: false, reason: "partner_limit_reached" };

  const excluded = (a: string, b: string) => exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const allowed = (giver: string, recipient: string) => giver !== recipient && !excluded(giver, recipient);
  if (!allowed(caller.id, partner.recipientId) || !allowed(partner.id, caller.recipientId)) return { ok: false, reason: "blocked" };
  return { ok: true };
}

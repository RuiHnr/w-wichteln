/**
 * Whether this browser has already unwrapped the gift on the group page, so later visits
 * show the recipient directly. Kept in localStorage per group, together with the recipient's
 * id: after a reset and a new draw with a different recipient the gift is wrapped again.
 */

const KEY = "w-wichteln:unwrapped";

/** How the gift reveal starts: the wrapped gift waiting for a tap, or the recipient's name. */
export type RevealState = "wrapped" | "shown";

export interface RevealStore {
  hasUnwrapped(groupId: string, recipientId: string): boolean;
  rememberUnwrapped(groupId: string, recipientId: string): void;
}

type Unwrapped = Record<string, string>;

export function createRevealStore(storage: Pick<Storage, "getItem" | "setItem">): RevealStore {
  const read = (): Unwrapped => {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? "{}");
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Unwrapped) : {};
    } catch {
      return {};
    }
  };

  return {
    hasUnwrapped: (groupId, recipientId) => read()[groupId] === recipientId,
    rememberUnwrapped: (groupId, recipientId) => storage.setItem(KEY, JSON.stringify({ ...read(), [groupId]: recipientId })),
  };
}

/** Under reduced motion there is nothing to play, so the name shows at once. */
export function initialRevealState({ unwrappedBefore, reducedMotion }: { unwrappedBefore: boolean; reducedMotion: boolean }): RevealState {
  return unwrappedBefore || reducedMotion ? "shown" : "wrapped";
}

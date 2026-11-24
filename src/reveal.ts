/**
 * Whether this browser has already unwrapped the gift on the group page, so later visits
 * show the recipient directly. Kept in localStorage per group, together with the recipient's
 * id: after a reset and a new draw with a different recipient the gift is wrapped again.
 */

import { readStoredRecord } from "./stored-record";

const KEY = "w-wichteln:unwrapped";

/** How the gift reveal starts: the wrapped gift waiting for a tap, or the recipient's name. */
export type RevealState = "wrapped" | "shown";

export interface RevealStore {
  hasUnwrapped(groupId: string, recipientId: string): boolean;
  rememberUnwrapped(groupId: string, recipientId: string): void;
}

export function createRevealStore(storage: Pick<Storage, "getItem" | "setItem">): RevealStore {
  const read = () => readStoredRecord(storage, KEY);

  return {
    hasUnwrapped: (groupId, recipientId) => read()[groupId] === recipientId,
    rememberUnwrapped: (groupId, recipientId) => storage.setItem(KEY, JSON.stringify({ ...read(), [groupId]: recipientId })),
  };
}

/** Whether the visitor asked their system for reduced motion. */
export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Under reduced motion there is nothing to play, so the name shows at once. */
export function initialRevealState({ unwrappedBefore, reducedMotion }: { unwrappedBefore: boolean; reducedMotion: boolean }): RevealState {
  return unwrappedBefore || reducedMotion ? "shown" : "wrapped";
}

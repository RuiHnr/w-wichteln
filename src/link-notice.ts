/**
 * Whether this browser has dismissed the notice about saving the Personal Link at the top
 * of a group page. Kept in localStorage per group, so each group asks once on each device.
 */

import { readStoredRecord } from "./stored-record";

const KEY = "w-wichteln:link-notice-dismissed";

export interface LinkNoticeStore {
  isDismissed(groupId: string): boolean;
  dismiss(groupId: string): void;
}

export function createLinkNoticeStore(storage: Pick<Storage, "getItem" | "setItem">): LinkNoticeStore {
  const read = () => readStoredRecord(storage, KEY);

  return {
    isDismissed: (groupId) => read()[groupId] !== undefined,
    dismiss: (groupId) => storage.setItem(KEY, JSON.stringify({ ...read(), [groupId]: "dismissed" })),
  };
}

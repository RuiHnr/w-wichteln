import { describe, expect, it } from "vitest";
import { createLinkNoticeStore } from "./link-notice";

/** The part of localStorage the store uses, kept in memory. */
function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("Personal Link notice", () => {
  it("shows on the group page until the participant dismisses it", () => {
    const notices = createLinkNoticeStore(memoryStorage());

    expect(notices.isDismissed("group-1")).toBe(false);
  });

  it("stays dismissed on this device after a reload", () => {
    const storage = memoryStorage();
    createLinkNoticeStore(storage).dismiss("group-1");

    const afterReload = createLinkNoticeStore(storage);

    expect(afterReload.isDismissed("group-1")).toBe(true);
  });

  it("asks again in every other group", () => {
    const notices = createLinkNoticeStore(memoryStorage());
    notices.dismiss("group-1");
    notices.dismiss("group-2");

    expect(notices.isDismissed("group-1")).toBe(true);
    expect(notices.isDismissed("group-3")).toBe(false);
  });

  it("shows again instead of failing when the stored data is damaged", () => {
    const notices = createLinkNoticeStore(memoryStorage({ "w-wichteln:link-notice-dismissed": "{not json" }));

    expect(notices.isDismissed("group-1")).toBe(false);
    notices.dismiss("group-1");
    expect(notices.isDismissed("group-1")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createRevealStore, initialRevealState } from "./reveal";

/** The part of localStorage the store uses, kept in memory. */
function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("gift reveal", () => {
  it("waits wrapped on the first visit after the draw", () => {
    const reveals = createRevealStore(memoryStorage());

    expect(initialRevealState({ unwrappedBefore: reveals.hasUnwrapped("group-1", "anna"), reducedMotion: false })).toBe(
      "wrapped",
    );
  });

  it("shows the recipient straight away once the gift was unwrapped, even after a reload", () => {
    const storage = memoryStorage();
    createRevealStore(storage).rememberUnwrapped("group-1", "anna");

    const afterReload = createRevealStore(storage);

    expect(afterReload.hasUnwrapped("group-1", "anna")).toBe(true);
    expect(initialRevealState({ unwrappedBefore: true, reducedMotion: false })).toBe("shown");
  });

  it("wraps the gift again when a new draw gives a different recipient", () => {
    const reveals = createRevealStore(memoryStorage());
    reveals.rememberUnwrapped("group-1", "anna");

    expect(reveals.hasUnwrapped("group-1", "ben")).toBe(false);
  });

  it("remembers each group on its own", () => {
    const reveals = createRevealStore(memoryStorage());
    reveals.rememberUnwrapped("group-1", "anna");

    expect(reveals.hasUnwrapped("group-2", "anna")).toBe(false);
  });

  it("shows the recipient at once under reduced motion", () => {
    expect(initialRevealState({ unwrappedBefore: false, reducedMotion: true })).toBe("shown");
  });

  it("starts wrapped instead of failing when the stored data is damaged", () => {
    const reveals = createRevealStore(memoryStorage({ "w-wichteln:unwrapped": "[1,2" }));

    expect(reveals.hasUnwrapped("group-1", "anna")).toBe(false);
    reveals.rememberUnwrapped("group-1", "anna");
    expect(reveals.hasUnwrapped("group-1", "anna")).toBe(true);
  });
});

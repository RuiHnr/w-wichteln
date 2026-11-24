import { describe, expect, it } from "vitest";
import { createIdentityStore } from "./identity";

/** The part of localStorage the store uses, kept in memory. */
function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("identity store", () => {
  it("still knows a participant's token after a reload", () => {
    const storage = memoryStorage();
    createIdentityStore(storage).remember("group-1", "token-a");

    const afterReload = createIdentityStore(storage);

    expect(afterReload.tokenFor("group-1")).toBe("token-a");
  });

  it("keeps one token per group", () => {
    const store = createIdentityStore(memoryStorage());
    store.remember("group-1", "token-a");
    store.remember("group-2", "token-b");

    expect(store.tokenFor("group-1")).toBe("token-a");
    expect(store.tokenFor("group-2")).toBe("token-b");
    expect(store.tokenFor("group-3")).toBeNull();
  });

  it("forgets a group's token", () => {
    const storage = memoryStorage();
    createIdentityStore(storage).remember("group-1", "token-a");

    createIdentityStore(storage).forget("group-1");

    expect(createIdentityStore(storage).tokenFor("group-1")).toBeNull();
  });

  it("starts empty instead of failing when the stored data is damaged", () => {
    const store = createIdentityStore(memoryStorage({ "w-wichteln:tokens": "{not json" }));

    expect(store.tokenFor("group-1")).toBeNull();
    store.remember("group-1", "token-a");
    expect(store.tokenFor("group-1")).toBe("token-a");
  });
});

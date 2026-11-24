import { afterEach, describe, expect, it, vi } from "vitest";
import { groupStillExists } from "./api";

afterEach(() => vi.unstubAllGlobals());

const answerWith = (response: Response) => {
  const fetchStub = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
};

describe("groupStillExists", () => {
  it("is true for a group the server knows", async () => {
    const fetchStub = answerWith(new Response(null, { status: 204 }));
    expect(await groupStillExists("a/b")).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith("/api/groups/a%2Fb");
  });

  it("is false when the group is gone, which is how a deleted group looks", async () => {
    answerWith(Response.json({ error: "unknown_group" }, { status: 404 }));
    expect(await groupStillExists("g")).toBe(false);
  });

  it("is unknown (null) when the server cannot say, so the page does not claim the group is gone", async () => {
    answerWith(new Response("oops", { status: 500 }));
    expect(await groupStillExists("g")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await groupStillExists("g")).toBeNull();
  });
});

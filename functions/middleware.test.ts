import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupMiddleware } from "./_middleware";
import type { Env } from "./env";
import { createTestEnv } from "./test/d1";
import { groupHelpers } from "./test/groups";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup } = groupHelpers(() => env);

/** Runs the middleware like Pages does: the response comes first, `waitUntil` work after. */
async function visit(now: number): Promise<{ response: Response; background: Promise<unknown> }> {
  const pending: Promise<unknown>[] = [];
  const response = await cleanupMiddleware(() => now)({
    request: new Request("http://app.test/api/health"),
    env,
    next: async () => Response.json({ status: "ok" }),
    waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
  } as unknown as Parameters<PagesFunction<Env>>[0]);
  return { response, background: Promise.all(pending) };
}

const groupExists = async (groupId: string) =>
  (await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(groupId).first()) !== null;

describe("cleanup middleware", () => {
  it("passes the response through and deletes expired groups in the background", async () => {
    const { me } = await newGroup(); // exchange date 2099-12-20
    const groupId = me.group.id;

    const early = await visit(Date.parse("2100-02-18T00:00:00Z"));
    await early.background;
    expect(await groupExists(groupId)).toBe(true);

    const late = await visit(Date.parse("2100-02-19T00:00:00Z")); // 2099-12-20 + 61 days
    expect(await late.response.json()).toEqual({ status: "ok" });
    await late.background;
    expect(await groupExists(groupId)).toBe(false);
  });

  it("does not fail the request when the cleanup fails", async () => {
    const broken = { DB: { prepare: () => { throw new Error("d1 down"); } } } as unknown as Env;
    const pending: Promise<unknown>[] = [];
    const response = await cleanupMiddleware()({
      request: new Request("http://app.test/api/health"),
      env: broken,
      next: async () => new Response("ok"),
      waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    } as unknown as Parameters<PagesFunction<Env>>[0]);
    expect(response.status).toBe(200);
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestGet as getGroup } from "./[groupId]/index";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup } = groupHelpers(() => env);

const get = (groupId: string) => call(getGroup, request("GET", `/api/groups/${groupId}`, null), env, { groupId });

describe("GET /api/groups/:groupId (does the group still exist?)", () => {
  it("answers 204 for an existing group, without telling anything about it", async () => {
    const { me } = await newGroup();
    const response = await get(me.group.id);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("answers 404 unknown_group for a group that was deleted or never existed", async () => {
    const { me } = await newGroup();
    await env.DB.prepare("DELETE FROM groups WHERE id = ?").bind(me.group.id).run();

    for (const id of [me.group.id, "never-existed"]) {
      const response = await get(id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "unknown_group" });
    }
  });
});

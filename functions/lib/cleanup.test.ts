import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onRequestPost as postExclusion } from "../api/groups/[groupId]/exclusions/index";
import { onRequestPatch as patchGroup } from "../api/groups/[groupId]/index";
import { onRequestPost as postSwapRequest } from "../api/me/swap-requests/index";
import { onRequestPut as putWishlist } from "../api/me/wishlist";
import type { Env } from "../env";
import { call, createTestEnv } from "../test/d1";
import { groupHelpers, request } from "../test/groups";
import { deleteExpiredGroups } from "./cleanup";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

const NOW = Date.parse("2026-11-24T10:00:00Z");
const TABLES = ["groups", "participants", "assignments", "exclusions", "wishlists", "swap_requests"];

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    counts[table] = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  }
  return counts;
}

const setDate = (groupId: string, date: string) =>
  env.DB.prepare("UPDATE groups SET exchange_date = ? WHERE id = ?").bind(date, groupId).run();

const groupExists = async (groupId: string) =>
  (await env.DB.prepare("SELECT 1 AS x FROM groups WHERE id = ?").bind(groupId).first()) !== null;

/** A drawn group with an exclusion, a wishlist and an open swap request: a row in every table. */
async function fullGroup() {
  const lea = await newGroup();
  const max = await joinAs(lea.me.group.inviteCode, "Max");
  const ina = await joinAs(lea.me.group.inviteCode, "Ina");
  const tom = await joinAs(lea.me.group.inviteCode, "Tom");
  const groupId = lea.me.group.id;
  const excluded = await call(
    postExclusion,
    request("POST", `/api/groups/${groupId}/exclusions`, lea.token, { participantIds: [max.me.participant.id, ina.me.participant.id] }),
    env,
    { groupId },
  );
  expect(excluded.status).toBe(200);
  await draw(lea.token, groupId);
  await call(putWishlist, request("PUT", "/api/me/wishlist", max.token, { wishlist: "Socken" }), env);
  const sent = await call(
    postSwapRequest,
    request("POST", "/api/me/swap-requests", lea.token, { receiverId: tom.me.participant.id }),
    env,
  );
  expect(sent.status).toBe(200);
  return { lea, groupId };
}

describe("deleteExpiredGroups", () => {
  it("deletes an expired group with its participants, assignments, exclusions, wishlists and swap requests", async () => {
    const before = await rowCounts();
    const { groupId } = await fullGroup();
    const filled = await rowCounts();
    for (const table of TABLES) expect(filled[table]).toBeGreaterThan(before[table]);

    await setDate(groupId, "2026-09-01"); // 84 days ago
    await deleteExpiredGroups(env.DB, NOW);

    expect(await rowCounts()).toEqual(before);
  });

  it("keeps groups that are not expired, including the 60th day, and everything in them", async () => {
    const day60 = await fullGroup();
    await setDate(day60.groupId, "2026-09-25"); // 60 days ago
    const future = await fullGroup();
    const before = await rowCounts();

    await deleteExpiredGroups(env.DB, NOW);

    expect(await rowCounts()).toEqual(before);
    expect(await groupExists(day60.groupId)).toBe(true);
    expect((await meWith(future.lea.token)).participants).toHaveLength(4);
  });

  it("deletes an expired group on the 61st day", async () => {
    const { groupId } = await fullGroup();
    await setDate(groupId, "2026-09-24"); // 61 days ago

    await deleteExpiredGroups(env.DB, NOW);

    expect(await groupExists(groupId)).toBe(false);
  });

  it("deletes at most the given number of groups per call, oldest first", async () => {
    const ids: string[] = [];
    for (const date of ["2020-03-01", "2020-01-01", "2020-02-01"]) {
      const { groupId } = await fullGroup();
      await setDate(groupId, date);
      ids.push(groupId);
    }

    await deleteExpiredGroups(env.DB, NOW, 2);
    expect(await Promise.all(ids.map(groupExists))).toEqual([true, false, false]);

    await deleteExpiredGroups(env.DB, NOW, 2);
    expect(await groupExists(ids[0])).toBe(false);
  });

  it("does nothing when no group is expired", async () => {
    await fullGroup();
    const before = await rowCounts();
    await deleteExpiredGroups(env.DB, NOW);
    expect(await rowCounts()).toEqual(before);
  });

  it("moves the deletion when an organizer changes the date", async () => {
    const { lea, groupId } = await fullGroup();
    await setDate(groupId, "2026-09-01"); // would be expired
    // The organizer moves it to a future date (the API only accepts dates from yesterday on).
    const moved = await call(
      patchGroup,
      request("PATCH", `/api/groups/${groupId}`, lea.token, { budget: "20", exchangeDate: "2099-12-24" }),
      env,
      { groupId },
    );
    expect(moved.status).toBe(200);

    await deleteExpiredGroups(env.DB, NOW);
    expect(await groupExists(groupId)).toBe(true);

    // And later than the new date + 60 days, it goes.
    await deleteExpiredGroups(env.DB, Date.parse("2100-02-22T00:00:00Z")); // day 60
    expect(await groupExists(groupId)).toBe(true);
    await deleteExpiredGroups(env.DB, Date.parse("2100-02-23T00:00:00Z")); // day 61
    expect(await groupExists(groupId)).toBe(false);
  });
});

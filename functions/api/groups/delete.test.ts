import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onRequestGet as getInvite } from "../invites/[code]/index";
import { onRequestGet as getMe } from "../me";
import { onRequestPost as postSwapRequest } from "../me/swap-requests/index";
import { onRequestPut as putWishlist } from "../me/wishlist";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestPost as postExclusion } from "./[groupId]/exclusions/index";
import { onRequestDelete as deleteGroup, onRequestGet as getGroup } from "./[groupId]/index";
import { onRequestPatch as patchParticipant } from "./[groupId]/participants/[participantId]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

const remove = (token: string | null, groupId: string) =>
  call(deleteGroup, request("DELETE", `/api/groups/${groupId}`, token), env, { groupId });
const exists = async (groupId: string) =>
  (await call(getGroup, request("GET", `/api/groups/${groupId}`, null), env, { groupId })).status === 204;

const TABLES = ["groups", "participants", "assignments", "exclusions", "wishlists", "swap_requests"];

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    counts[table] = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  }
  return counts;
}

/** A drawn group with an exclusion, a wishlist and an open swap request: a row in every table. */
async function drawnGroup() {
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
  const sent = await call(postSwapRequest, request("POST", "/api/me/swap-requests", lea.token, { receiverId: tom.me.participant.id }), env);
  expect(sent.status).toBe(200);
  return { groupId, everyone: [lea, max, ina, tom] };
}

describe("DELETE /api/groups/:groupId (Group Deletion)", () => {
  it("lets an organizer delete an open group: it answers 204 and the group is gone", async () => {
    const lea = await newGroup();
    const groupId = lea.me.group.id;

    const response = await remove(lea.token, groupId);

    expect(response.status).toBe(204);
    expect(await exists(groupId)).toBe(false);
  });

  it("deletes a drawn group with all participants, exclusions, assignments, wishlists and swap requests", async () => {
    const before = await rowCounts();
    const { groupId, everyone } = await drawnGroup();
    const filled = await rowCounts();
    for (const table of TABLES) expect(filled[table]).toBeGreaterThan(before[table]);

    expect((await remove(everyone[0].token, groupId)).status).toBe(204);

    expect(await rowCounts()).toEqual(before);
  });

  it("leaves other groups untouched", async () => {
    const other = await drawnGroup();
    const lea = await newGroup();
    const before = await meWith(other.everyone[1].token);

    expect((await remove(lea.token, lea.me.group.id)).status).toBe(204);

    expect(await meWith(other.everyone[1].token)).toEqual(before);
  });

  it("lets any organizer delete, not only the creator", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    const groupId = lea.me.group.id;
    const granted = await call(
      patchParticipant,
      request("PATCH", `/api/groups/${groupId}/participants/${max.me.participant.id}`, lea.token, { isOrganizer: true }),
      env,
      { groupId, participantId: max.me.participant.id },
    );
    expect(granted.status).toBe(200);

    expect((await remove(max.token, groupId)).status).toBe(204);
    expect(await exists(groupId)).toBe(false);
  });
});

describe("after a Group Deletion", () => {
  it("no Personal Link of the group is known any more, the deleting organizer's included", async () => {
    const { groupId, everyone } = await drawnGroup();

    await remove(everyone[0].token, groupId);

    for (const { token } of everyone) {
      const response = await call(getMe, request("GET", "/api/me", token), env);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unknown_token" });
    }
  });

  it("the Invite Link and the group answer 404 unknown_group, as for an expired group", async () => {
    const lea = await newGroup();
    const { id: groupId, inviteCode } = lea.me.group;

    await remove(lea.token, groupId);

    const invite = await call(getInvite, request("GET", `/api/invites/${inviteCode}`, null), env, { code: inviteCode });
    expect(invite.status).toBe(404);
    expect(await invite.json()).toEqual({ error: "unknown_group" });
    const group = await call(getGroup, request("GET", `/api/groups/${groupId}`, null), env, { groupId });
    expect(group.status).toBe(404);
    expect(await group.json()).toEqual({ error: "unknown_group" });
  });

  it("deleting again answers 401, since the organizer's token is gone with the group", async () => {
    const lea = await newGroup();
    await remove(lea.token, lea.me.group.id);

    const again = await remove(lea.token, lea.me.group.id);
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: "unknown_token" });
  });
});

describe("DELETE /api/groups/:groupId refused", () => {
  it("answers 403 not_organizer to a participant and to an organizer of another group, and 401 without a known token; the group stays", async () => {
    const { groupId, everyone } = await drawnGroup();
    const theirs = await newGroup();
    const before = await rowCounts();

    for (const token of [everyone[1].token, theirs.token]) {
      const response = await remove(token, groupId);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_organizer" });
    }
    for (const token of [null, "nope"]) {
      const response = await remove(token, groupId);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unknown_token" });
    }

    expect(await rowCounts()).toEqual(before);
    expect((await meWith(everyone[1].token)).group.phase).toBe("drawn");
  });
});

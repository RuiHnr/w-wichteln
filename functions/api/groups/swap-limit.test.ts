import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestPost as postSwapRequest } from "../me/swap-requests/index";
import { onRequestPost as postAccept } from "../me/swap-requests/[requestId]/accept";
import { onRequestPut as putSwapLimit } from "./[groupId]/swap-limit";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function setLimit(token: string | null, groupId: string, swapLimit: unknown) {
  return call(putSwapLimit, request("PUT", `/api/groups/${groupId}/swap-limit`, token, { swapLimit }), env, { groupId });
}

function send(token: string, receiverId: string) {
  return call(postSwapRequest, request("POST", "/api/me/swap-requests", token, { receiverId }), env);
}

function accept(token: string, requestId: string) {
  return call(postAccept, request("POST", `/api/me/swap-requests/${requestId}/accept`, token), env, { requestId });
}

interface Giver extends CreateGroupResponse {
  id: string;
  recipientId: string;
}

/** A drawn group of four, each giver with the recipient they see. */
async function drawnGroup() {
  const lea = await newGroup();
  const joined = [lea];
  for (const name of ["Max", "Ina", "Tom"]) joined.push(await joinAs(lea.me.group.inviteCode, name));
  await draw(lea.token, lea.me.group.id);
  const givers: Giver[] = [];
  for (const p of joined) {
    const me = await meWith(p.token);
    givers.push({ ...p, id: me.participant.id, recipientId: me.recipient!.id });
  }
  return { givers, groupId: lea.me.group.id, organizer: lea.token };
}

/** Pairs of givers who may swap: neither gives to the other. */
function swappablePairs(givers: Giver[]): [Giver, Giver][] {
  const pairs: [Giver, Giver][] = [];
  for (const a of givers) for (const b of givers) if (a.id < b.id && a.recipientId !== b.id && b.recipientId !== a.id) pairs.push([a, b]);
  return pairs;
}

async function completeSwap(a: Giver, b: Giver): Promise<void> {
  const sent = await (await send(a.token, b.id)).json<Me>();
  expect((await accept(b.token, sent.swaps!.outgoing!.id)).status).toBe(200);
}

describe("PUT /api/groups/:groupId/swap-limit", () => {
  it("starts at 1 and lets an organizer set 0 to 5, while open and when drawn", async () => {
    const { token, me } = await newGroup();
    expect(me.group.swapLimit).toBe(1);
    await joinAs(me.group.inviteCode, "Max");
    await joinAs(me.group.inviteCode, "Ina");

    for (const limit of [0, 5, 3]) {
      const response = await setLimit(token, me.group.id, limit);
      expect(response.status).toBe(200);
      expect((await response.json<Me>()).group.swapLimit).toBe(limit);
    }

    await draw(token, me.group.id);
    expect((await setLimit(token, me.group.id, 2)).status).toBe(200);
    const fresh = await meWith(token);
    expect(fresh.group.swapLimit).toBe(2);
    expect(fresh.swaps!.limit).toBe(2);
  });

  it.each([-1, 6, 1.5, "2", null, true])("answers 400 to %j and changes nothing", async (value) => {
    const { token, me } = await newGroup();
    const response = await setLimit(token, me.group.id, value);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { swapLimit: "invalid" } });
    expect((await meWith(token)).group.swapLimit).toBe(1);
  });

  it("answers 403 to a participant who is not an organizer, 401 without a token", async () => {
    const { me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");
    const refused = await setLimit(max.token, me.group.id, 3);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "not_organizer" });
    expect((await meWith(max.token)).group.swapLimit).toBe(1);
    expect((await setLimit(null, me.group.id, 3)).status).toBe(401);
  });
});

describe("a changed Swap Limit", () => {
  it("with limit 0 blocks sending", async () => {
    const { givers, groupId, organizer } = await drawnGroup();
    await setLimit(organizer, groupId, 0);
    const [a, b] = swappablePairs(givers)[0];
    const response = await send(a.token, b.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "limit_reached" });
  });

  it("with limit 0 keeps an open request, refuses to accept it, and accepts it once raised", async () => {
    const { givers, groupId, organizer } = await drawnGroup();
    const [a, b] = swappablePairs(givers)[0];
    const sent = await (await send(a.token, b.id)).json<Me>();
    const requestId = sent.swaps!.outgoing!.id;

    await setLimit(organizer, groupId, 0);

    expect((await meWith(a.token)).swaps!.outgoing?.id).toBe(requestId);
    expect((await meWith(b.token)).swaps!.incoming.map((r) => r.id)).toEqual([requestId]);
    const refused = await accept(b.token, requestId);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "limit_reached" });

    await setLimit(organizer, groupId, 1);
    expect((await accept(b.token, requestId)).status).toBe(200);
  });

  it("keeps an open request of two givers still under the new limit", async () => {
    const { givers, groupId, organizer } = await drawnGroup();
    const [a, b] = swappablePairs(givers)[0];
    await send(a.token, b.id);
    await setLimit(organizer, groupId, 3);
    expect((await meWith(a.token)).swaps!.outgoing).toBeDefined();
  });

  it("keeps an open request whose sender is at the lowered limit, refuses it as partner_limit_reached, and accepts it once raised", async () => {
    // After a first swap not every draw leaves a valid second partner, so draw again until one does.
    let open: { sender: Giver; receiver: Giver; groupId: string; organizer: string } | undefined;
    for (let attempt = 0; attempt < 30 && !open; attempt++) {
      const { givers, groupId, organizer } = await drawnGroup();
      await setLimit(organizer, groupId, 2);
      const [a, b] = swappablePairs(givers)[0];
      await completeSwap(a, b);
      for (const receiver of givers.filter((g) => g !== a && g !== b)) {
        if ((await send(a.token, receiver.id)).status === 200) {
          open = { sender: a, receiver, groupId, organizer };
          break;
        }
      }
    }
    if (!open) throw new Error("no draw left a second swap partner in 30 tries");
    const requestId = (await meWith(open.sender.token)).swaps!.outgoing!.id;

    await setLimit(open.organizer, open.groupId, 1);

    expect((await meWith(open.sender.token)).swaps!.outgoing?.id).toBe(requestId);
    expect((await meWith(open.receiver.token)).swaps!.incoming.map((r) => r.id)).toEqual([requestId]);
    const refused = await accept(open.receiver.token, requestId);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "partner_limit_reached" });

    await setLimit(open.organizer, open.groupId, 2);
    expect((await accept(open.receiver.token, requestId)).status).toBe(200);
  });

  it("keeps completed swaps when lowered and blocks further ones", async () => {
    const { givers, groupId, organizer } = await drawnGroup();
    await setLimit(organizer, groupId, 2);
    const [a, b] = swappablePairs(givers)[0];
    await completeSwap(a, b);
    const swapped = await meWith(a.token);

    await setLimit(organizer, groupId, 1);

    const after = await meWith(a.token);
    expect(after.recipient!.id).toBe(swapped.recipient!.id);
    expect(after.swaps).toMatchObject({ limit: 1, completed: 1 });
    const other = givers.find((g) => g !== a && g !== b)!;
    const blocked = await send(a.token, other.id);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({ error: "limit_reached" });
  });

  it("reports completed swaps above a lowered limit as they are", async () => {
    const { givers, groupId, organizer } = await drawnGroup();
    const [a, b] = swappablePairs(givers)[0];
    await completeSwap(a, b);
    await setLimit(organizer, groupId, 0);
    expect((await meWith(a.token)).swaps).toMatchObject({ limit: 0, completed: 1 });
  });

  it("when raised lets participants who used their swaps ask again", async () => {
    // After a first swap not every draw leaves a valid second partner, so draw again until one does.
    for (let attempt = 0; attempt < 30; attempt++) {
      const { givers, groupId, organizer } = await drawnGroup();
      const [a, b] = swappablePairs(givers)[0];
      await completeSwap(a, b);
      const others = givers.filter((g) => g !== a && g !== b);
      expect(await (await send(a.token, others[0].id)).json()).toEqual({ error: "limit_reached" });

      await setLimit(organizer, groupId, 2);

      for (const other of others) {
        if ((await send(a.token, other.id)).status === 200) {
          expect((await meWith(a.token)).swaps!.outgoing?.receiver.id).toBe(other.id);
          return;
        }
      }
    }
    throw new Error("no draw left a second swap partner in 30 tries");
  });
});

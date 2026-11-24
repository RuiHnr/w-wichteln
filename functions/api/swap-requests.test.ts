import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../shared/api";
import type { Env } from "../env";
import { call, createTestEnv } from "../test/d1";
import { groupHelpers, request } from "../test/groups";
import { onRequestPost as postSwapRequest } from "./me/swap-requests/index";
import { onRequestPost as postAccept } from "./me/swap-requests/[requestId]/accept";
import { onRequestPost as postDecline } from "./me/swap-requests/[requestId]/decline";
import { onRequestDelete as deleteSwapRequest } from "./me/swap-requests/[requestId]/index";
import { onRequestPut as putWishlist } from "./me/wishlist";
import { onRequestDelete as deleteDraw } from "./groups/[groupId]/draw";
import { onRequestPost as postExclusion } from "./groups/[groupId]/exclusions/index";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function send(token: string | null, receiverId: unknown) {
  return call(postSwapRequest, request("POST", "/api/me/swap-requests", token, { receiverId }), env);
}

function accept(token: string | null, requestId: string) {
  return call(postAccept, request("POST", `/api/me/swap-requests/${requestId}/accept`, token), env, { requestId });
}

function decline(token: string | null, requestId: string) {
  return call(postDecline, request("POST", `/api/me/swap-requests/${requestId}/decline`, token), env, { requestId });
}

function withdraw(token: string | null, requestId: string) {
  return call(deleteSwapRequest, request("DELETE", `/api/me/swap-requests/${requestId}`, token), env, { requestId });
}

/** The sender's request to the receiver, sent successfully; its id. */
async function sent(sender: Giver, receiver: Giver): Promise<string> {
  const response = await send(sender.token, receiver.id);
  expect(response.status).toBe(200);
  return (await response.json<Me>()).swaps!.outgoing!.id;
}

interface Giver extends CreateGroupResponse {
  name: string;
  id: string;
  recipientId: string;
}

/** Lea's group with the others named in it, drawn; each giver with the recipient they see. */
async function drawnGroupWith(...names: string[]) {
  const lea = await newGroup();
  const joined = [lea];
  for (const name of names) joined.push(await joinAs(lea.me.group.inviteCode, name));
  const groupId = lea.me.group.id;
  await draw(lea.token, groupId);
  const givers: Giver[] = [];
  for (const p of joined) {
    const me = await meWith(p.token);
    givers.push({ ...p, name: me.participant.name, id: me.participant.id, recipientId: me.recipient!.id });
  }
  return { givers, groupId };
}

/** Whether two givers may swap (without exclusions): neither gives to the other. */
const swappable = (a: Giver, b: Giver) => a !== b && a.recipientId !== b.id && b.recipientId !== a.id;

/** Two givers who may swap. Every draw of four has such a pair. */
function swappablePair(givers: Giver[]): [Giver, Giver] {
  for (const a of givers) {
    const b = givers.find((b) => swappable(a, b));
    if (b) return [a, b];
  }
  throw new Error("no swappable pair");
}

/** A giver not yet used who may swap with `partner`. */
function partnerFor(givers: Giver[], used: Giver[], partner: Giver): Giver {
  const found = givers.find((g) => !used.includes(g) && swappable(g, partner));
  if (!found) throw new Error(`no partner for ${partner.name}`);
  used.push(found);
  return found;
}

describe("POST /api/me/swap-requests", () => {
  it("sends a swap request that the sender sees as outgoing and the receiver as incoming, by name only", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);

    const response = await send(sender.token, receiver.id);

    expect(response.status).toBe(200);
    const mine = await response.json<Me>();
    expect(mine.swaps).toEqual({
      limit: 1,
      completed: 0,
      outgoing: { id: expect.any(String), receiver: { id: receiver.id, name: receiver.name } },
      incoming: [],
    });
    const theirs = await meWith(receiver.token);
    expect(theirs.swaps).toEqual({
      limit: 1,
      completed: 0,
      incoming: [{ id: mine.swaps!.outgoing!.id, sender: { id: sender.id, name: sender.name } }],
    });
  });
});

describe("POST /api/me/swap-requests refused", () => {
  it("answers 409 outgoing_open to a second request while the first is open", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    await send(sender.token, receiver.id);
    const other = givers.find((g) => g !== sender && g !== receiver)!;

    const response = await send(sender.token, other.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "outgoing_open" });
    expect((await meWith(sender.token)).swaps!.outgoing!.receiver.id).toBe(receiver.id);
    expect((await meWith(other.token)).swaps!.incoming).toEqual([]);
  });

  it("answers 409 blocked with no request when the swap would make someone draw themselves", async () => {
    // A draw of three is always one circle, so any two givers swapping would leave one with themselves.
    const { givers } = await drawnGroupWith("Max", "Ina");
    const [sender, receiver] = givers;

    const response = await send(sender.token, receiver.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "blocked" });
    expect((await meWith(sender.token)).swaps).toEqual({ limit: 1, completed: 0, incoming: [] });
    expect((await meWith(receiver.token)).swaps!.incoming).toEqual([]);
  });

  it("answers 409 blocked when the swap would break an exclusion", async () => {
    const lea = await newGroup();
    const joined = [lea];
    for (const name of ["Max", "Ina", "Tom", "Ben"]) joined.push(await joinAs(lea.me.group.inviteCode, name));
    const groupId = lea.me.group.id;
    const tom = joined[3];
    await call(postExclusion, request("POST", `/api/groups/${groupId}/exclusions`, lea.token, {
      participantIds: [lea.me.participant.id, tom.me.participant.id],
    }), env, { groupId });

    // Redraw until a giver Lea does not give to gives to Tom: swapping with them would give Lea to Tom.
    // No self-draw is involved: that giver gives to Tom, not Lea, and Lea not to them.
    for (let round = 0; round < 50; round++) {
      await draw(lea.token, groupId);
      const seen = await Promise.all(joined.map(async (p) => ({ p, me: await meWith(p.token) })));
      const leaGives = seen[0].me.recipient!.id;
      const partner = seen.find(({ p, me }) => me.recipient!.id === tom.me.participant.id && leaGives !== p.me.participant.id);
      if (partner) {
        const response = await send(lea.token, partner.p.me.participant.id);
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "blocked" });
        return;
      }
      await call(deleteDraw, request("DELETE", `/api/groups/${groupId}/draw`, lea.token), env, { groupId });
    }
    throw new Error("no draw with a giver to Tom to swap with");
    // Several draw-and-reset rounds through the handlers can exceed the 5 s default on slow CI runners.
  }, 20_000);

  it("answers 409 self to a request to yourself and 404 unknown_participant to someone not in the group", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const outsider = await newGroup();

    const self = await send(givers[0].token, givers[0].id);
    expect(self.status).toBe(409);
    expect(await self.json()).toEqual({ error: "self" });
    for (const receiverId of [outsider.me.participant.id, "nope", 42]) {
      const response = await send(givers[0].token, receiverId);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "unknown_participant" });
    }
  });

  it("answers 409 not_drawn while the group is open, and shows no swaps before the draw", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");

    const response = await send(lea.token, max.me.participant.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_drawn" });
    expect(await meWith(lea.token)).not.toHaveProperty("swaps");
  });

  it("answers 401 without a known token", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");

    expect((await send(null, givers[1].id)).status).toBe(401);
    expect((await send("nope", givers[1].id)).status).toBe(401);
  });
});

describe("POST /api/me/swap-requests/:requestId/accept (Swap)", () => {
  it("swaps the recipients: both see their new recipient with that recipient's wishlist, and the swap counts for both", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    for (const g of givers) {
      await call(putWishlist, request("PUT", "/api/me/wishlist", g.token, { wishlist: `Wunsch von ${g.name}` }), env);
    }
    const [sender, receiver] = swappablePair(givers);
    const requestId = await sent(sender, receiver);

    const response = await accept(receiver.token, requestId);

    expect(response.status).toBe(200);
    const receiverNow = await response.json<Me>();
    const nameOf = (id: string) => givers.find((g) => g.id === id)!.name;
    expect(receiverNow.recipient).toEqual({ id: sender.recipientId, name: nameOf(sender.recipientId), wishlist: `Wunsch von ${nameOf(sender.recipientId)}` });
    const senderNow = await meWith(sender.token);
    expect(senderNow.recipient).toEqual({ id: receiver.recipientId, name: nameOf(receiver.recipientId), wishlist: `Wunsch von ${nameOf(receiver.recipientId)}` });
    expect(receiverNow.swaps).toEqual({ limit: 1, completed: 1, incoming: [] });
    expect(senderNow.swaps).toEqual({ limit: 1, completed: 1, incoming: [] });
    // The others keep theirs, and everyone still gives once and receives once.
    for (const g of givers.filter((g) => g !== sender && g !== receiver)) {
      expect((await meWith(g.token)).recipient!.id).toBe(g.recipientId);
      expect((await meWith(g.token)).swaps!.completed).toBe(0);
    }
  });

  it("expires every other open request that involves either of the two, and leaves the rest", async () => {
    // Eight givers: each has at most two others they cannot swap with, so every role below finds someone.
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom", "Ben", "Eva", "Jan", "Kim");
    const [sender, receiver] = swappablePair(givers);
    const used = [sender, receiver];
    const toSender = partnerFor(givers, used, sender);
    const toReceiver = partnerFor(givers, used, receiver);
    const fromReceiver = partnerFor(givers, used, receiver);
    const bystander = givers.find((g) => !used.includes(g) && givers.some((o) => !used.includes(o) && o !== g && swappable(g, o)))!;
    used.push(bystander);
    const bystanderPartner = partnerFor(givers, used, bystander);
    const requestId = await sent(sender, receiver);
    await sent(toSender, sender);
    await sent(toReceiver, receiver);
    await sent(receiver, fromReceiver);
    await sent(bystander, bystanderPartner);

    expect((await accept(receiver.token, requestId)).status).toBe(200);

    for (const g of [sender, receiver, toSender, toReceiver, fromReceiver]) {
      const { swaps } = await meWith(g.token);
      expect(swaps).not.toHaveProperty("outgoing");
      expect(swaps!.incoming).toEqual([]);
    }
    expect((await meWith(bystander.token)).swaps!.outgoing!.receiver.id).toBe(bystanderPartner.id);
    expect((await meWith(bystanderPartner.token)).swaps!.incoming.map((r) => r.sender.id)).toEqual([bystander.id]);
    // The expired requests do not count: their senders can send a new one.
    expect((await meWith(toSender.token)).swaps!.completed).toBe(0);
    await sent(toSender, partnerFor(givers, [sender, receiver, toSender], toSender));
  });

  it("stops both at the swap limit: they can neither send nor be asked any more", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom", "Ben", "Eva");
    const [sender, receiver] = swappablePair(givers);
    await accept(receiver.token, await sent(sender, receiver));
    const others = givers.filter((g) => g !== sender && g !== receiver);

    for (const swapped of [sender, receiver]) {
      const again = await send(swapped.token, others[0].id);
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ error: "limit_reached" });
      const asked = await send(others[0].token, swapped.id);
      expect(asked.status).toBe(409);
      expect(await asked.json()).toEqual({ error: "partner_limit_reached" });
    }
  });
});

describe("declining and withdrawing", () => {
  it("lets the receiver decline: the request is gone for both, nothing is swapped and nothing counts", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    const requestId = await sent(sender, receiver);

    const response = await decline(receiver.token, requestId);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).swaps).toEqual({ limit: 1, completed: 0, incoming: [] });
    const senderNow = await meWith(sender.token);
    expect(senderNow.swaps).toEqual({ limit: 1, completed: 0, incoming: [] });
    expect(senderNow.recipient!.id).toBe(sender.recipientId);
    expect((await meWith(receiver.token)).recipient!.id).toBe(receiver.recipientId);
    // The sender may ask again, even the same giver.
    await sent(sender, receiver);
  });

  it("lets the sender withdraw: the request is gone for both, and a new one can go out", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    const requestId = await sent(sender, receiver);

    const response = await withdraw(sender.token, requestId);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).swaps).toEqual({ limit: 1, completed: 0, incoming: [] });
    expect((await meWith(receiver.token)).swaps!.incoming).toEqual([]);
    expect((await accept(receiver.token, requestId)).status).toBe(404);
    await sent(sender, receiver);
  });

  it("answers 404 unknown_swap_request when someone else answers or withdraws, or the request is gone", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    const bystander = givers.find((g) => g !== sender && g !== receiver)!;
    const requestId = await sent(sender, receiver);

    for (const response of [
      await accept(sender.token, requestId),
      await accept(bystander.token, requestId),
      await decline(sender.token, requestId),
      await decline(bystander.token, requestId),
      await withdraw(receiver.token, requestId),
      await withdraw(bystander.token, requestId),
      await accept(receiver.token, "nope"),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "unknown_swap_request" });
    }
    expect((await meWith(receiver.token)).swaps!.incoming).toHaveLength(1);

    await accept(receiver.token, requestId);
    const again = await accept(receiver.token, requestId);
    expect(again.status).toBe(404);
    expect((await meWith(receiver.token)).swaps!.completed).toBe(1);
  });

  it("answers 401 without a known token", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    const requestId = await sent(sender, receiver);

    for (const act of [accept, decline, withdraw]) {
      expect((await act(null, requestId)).status).toBe(401);
      expect((await act("nope", requestId)).status).toBe(401);
    }
  });
});

describe("accepting re-checks the swap", () => {
  // Through the API alone a swap expires every request of its two givers, so these states only
  // arise from two acceptances racing or (#11) the organizer lowering the limit. They are set up
  // in the database directly.

  it("answers 409 blocked when the swap would make someone draw themselves by now, and swaps nothing", async () => {
    const { givers, groupId } = await drawnGroupWith("Max", "Ina");
    const [sender, receiver] = givers;
    await env.DB.prepare("INSERT INTO swap_requests (id, group_id, sender_id, receiver_id) VALUES ('raced', ?, ?, ?)")
      .bind(groupId, sender.id, receiver.id)
      .run();

    const response = await accept(receiver.token, "raced");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "blocked" });
    expect((await meWith(receiver.token)).recipient!.id).toBe(receiver.recipientId);
    expect((await meWith(sender.token)).recipient!.id).toBe(sender.recipientId);
    expect((await meWith(receiver.token)).swaps!.completed).toBe(0);
  });

  it("answers 409 limit_reached to a receiver at the swap limit", async () => {
    const { givers, groupId } = await drawnGroupWith("Max", "Ina", "Tom");
    const [sender, receiver] = swappablePair(givers);
    const requestId = await sent(sender, receiver);
    await env.DB.prepare("UPDATE groups SET swap_limit = 0 WHERE id = ?").bind(groupId).run();

    const response = await accept(receiver.token, requestId);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "limit_reached" });
    expect((await meWith(receiver.token)).recipient!.id).toBe(receiver.recipientId);
  });
});

describe("a reset", () => {
  it("expires all open requests and sets every swap count back to 0", async () => {
    const { givers, groupId } = await drawnGroupWith("Max", "Ina", "Tom", "Ben", "Eva", "Jan", "Kim");
    const [sender, receiver] = swappablePair(givers);
    await accept(receiver.token, await sent(sender, receiver));
    const used = [sender, receiver];
    const other = givers.find((g) => !used.includes(g))!;
    used.push(other);
    const openRequestId = await sent(other, partnerFor(givers, used, other));

    const reset = await call(deleteDraw, request("DELETE", `/api/groups/${groupId}/draw`, givers[0].token), env, { groupId });
    expect(reset.status).toBe(200);
    expect(await reset.json<Me>()).not.toHaveProperty("swaps");

    await draw(givers[0].token, groupId);
    for (const g of givers) expect((await meWith(g.token)).swaps).toEqual({ limit: 1, completed: 0, incoming: [] });
    expect((await accept(used[3].token, openRequestId)).status).toBe(404);
  });
});

describe("nobody sees anyone else's recipient through swaps (ADR 0003)", () => {
  it("shows the other side of a request by name only, before and after the swap, and only the caller's own recipient", async () => {
    const { givers } = await drawnGroupWith("Max", "Ina", "Tom");
    for (const g of givers) {
      await call(putWishlist, request("PUT", "/api/me/wishlist", g.token, { wishlist: `geheim-${g.name}` }), env);
    }
    const [sender, receiver] = swappablePair(givers);
    const sentResponse = await send(sender.token, receiver.id);
    const requestId = (await sentResponse.clone().json<Me>()).swaps!.outgoing!.id;

    const answers: Me[] = [await sentResponse.json<Me>(), await meWith(receiver.token)];
    answers.push(await (await accept(receiver.token, requestId)).json<Me>(), await meWith(sender.token));

    for (const me of answers) {
      const organizerOnly = me.participant.isOrganizer ? ["exclusions"] : [];
      expect(Object.keys(me).sort()).toEqual([...organizerOnly, "group", "participant", "participants", "recipient", "swaps", "wishlist"]);
      expect(Object.keys(me.recipient!).sort()).toEqual(["id", "name", "wishlist"]);
      const { outgoing, incoming, ...counts } = me.swaps!;
      expect(Object.keys(counts).sort()).toEqual(["completed", "limit"]);
      if (outgoing) {
        expect(Object.keys(outgoing).sort()).toEqual(["id", "receiver"]);
        expect(Object.keys(outgoing.receiver).sort()).toEqual(["id", "name"]);
      }
      for (const r of incoming) {
        expect(Object.keys(r).sort()).toEqual(["id", "sender"]);
        expect(Object.keys(r.sender).sort()).toEqual(["id", "name"]);
      }
      // The only wishlists in any answer are the caller's own and their current recipient's.
      const recipientName = givers.find((g) => g.id === me.recipient!.id)!.name;
      const seen = JSON.stringify(me).match(/geheim-\w+/g)!.sort();
      expect(seen).toEqual([`geheim-${me.participant.name}`, `geheim-${recipientName}`].sort());
    }
    // Both sides of the request answers above came before and after the swap.
    expect(answers.map((me) => me.swaps!.completed)).toEqual([0, 0, 1, 1]);
  });
});

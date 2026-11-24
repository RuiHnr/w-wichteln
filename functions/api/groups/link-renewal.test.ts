import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Me, RenewLinkResponse } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestGet as getMe } from "../me";
import { onRequestPost as postSwapRequest } from "../me/swap-requests/index";
import { onRequestPut as putWishlist } from "../me/wishlist";
import { onRequestDelete as deleteParticipant, onRequestPatch as patchParticipant } from "./[groupId]/participants/[participantId]";
import { onRequestPost as postLink } from "./[groupId]/participants/[participantId]/link";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function renewLink(token: string | null, groupId: string, participantId: string) {
  return call(postLink, request("POST", `/api/groups/${groupId}/participants/${participantId}/link`, token), env, {
    groupId,
    participantId,
  });
}

describe("POST /api/groups/:groupId/participants/:participantId/link", () => {
  it("gives an organizer a new Personal Link for a participant, and the old one stops working", async () => {
    const { token, me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");

    const response = await renewLink(token, me.group.id, max.me.participant.id);

    expect(response.status).toBe(200);
    const renewed = await response.json<RenewLinkResponse>();
    expect(renewed.token).not.toBe(max.token);
    expect((await meWith(renewed.token)).participant).toMatchObject({ id: max.me.participant.id, name: "Max" });
    expect((await call(getMe, request("GET", "/api/me", max.token), env)).status).toBe(401);
    expect(renewed.me.participant.name).toBe("Lea");
  });

  it("lets organizers renew their own link, and answers with the view seen through the new token", async () => {
    const { token, me } = await newGroup();

    const response = await renewLink(token, me.group.id, me.participant.id);

    expect(response.status).toBe(200);
    const renewed = await response.json<RenewLinkResponse>();
    expect(renewed.me.participant).toMatchObject({ id: me.participant.id, isOrganizer: true });
    expect(renewed.me.participants[0].linkRenewal?.by).toBe("Lea");
    expect((await meWith(renewed.token)).participant.id).toBe(me.participant.id);
    expect((await call(getMe, request("GET", "/api/me", token), env)).status).toBe(401);
  });

  it("changes only the link after the draw: assignment, wishlist and swap requests stay", async () => {
    const lea = await newGroup();
    const groupId = lea.me.group.id;
    const others = [];
    for (const name of ["Max", "Ina", "Tom"]) others.push(await joinAs(lea.me.group.inviteCode, name));
    await draw(lea.token, groupId);
    const givers = await Promise.all(others.map(async (p) => ({ ...p, me: await meWith(p.token) })));
    // Any two givers who do not give to each other may swap; among three such a pair always exists.
    const [sender, receiver] = pairThatMaySwap(givers);
    await call(putWishlist, request("PUT", "/api/me/wishlist", sender.token, { wishlist: "Socken" }), env);
    expect((await call(postSwapRequest, request("POST", "/api/me/swap-requests", sender.token, { receiverId: receiver.me.participant.id }), env)).status).toBe(200);
    const before = await meWith(sender.token);

    const response = await renewLink(lea.token, groupId, sender.me.participant.id);

    expect(response.status).toBe(200);
    const after = await meWith((await response.json<RenewLinkResponse>()).token);
    expect(after.participant).toEqual(before.participant);
    expect(after.recipient).toEqual(before.recipient);
    expect(after.wishlist).toBe("Socken");
    expect(after.swaps).toEqual(before.swaps);
    expect((await meWith(receiver.token)).swaps!.incoming.map((r) => r.sender.name)).toEqual([sender.me.participant.name]);
    expect((await call(getMe, request("GET", "/api/me", sender.token), env)).status).toBe(401);
  });
});

describe("the trace of Link Renewals", () => {
  it("shows every participant who last renewed whose link, and when", async () => {
    const lea = await newGroup();
    const groupId = lea.me.group.id;
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    const ina = await joinAs(lea.me.group.inviteCode, "Ina");
    await setOrganizerRole(lea.token, groupId, max.me.participant.id);
    expect((await meWith(ina.token)).participants.every((p) => p.linkRenewal === undefined)).toBe(true);

    await renewLink(lea.token, groupId, ina.me.participant.id);
    const latest = await renewLink(max.token, groupId, ina.me.participant.id);
    const inaToken = (await latest.json<RenewLinkResponse>()).token;

    for (const token of [lea.token, max.token, inaToken]) {
      const [leaRow, maxRow, inaRow] = (await meWith(token)).participants;
      expect(leaRow.linkRenewal).toBeUndefined();
      expect(maxRow.linkRenewal).toBeUndefined();
      expect(inaRow.linkRenewal).toEqual({ by: "Max", byId: max.me.participant.id, at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/) });
      expect(Math.abs(Date.parse(inaRow.linkRenewal!.at) - Date.now())).toBeLessThan(60_000);
    }
  });

  it("keeps the renewer's name after they have left the group", async () => {
    const lea = await newGroup();
    const groupId = lea.me.group.id;
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    const ina = await joinAs(lea.me.group.inviteCode, "Ina");
    await setOrganizerRole(lea.token, groupId, max.me.participant.id);
    await renewLink(max.token, groupId, ina.me.participant.id);

    await call(deleteParticipant, request("DELETE", `/api/groups/${groupId}/participants/${max.me.participant.id}`, lea.token), env, {
      groupId,
      participantId: max.me.participant.id,
    });

    expect((await meWith(lea.token)).participants.find((p) => p.name === "Ina")!.linkRenewal?.by).toBe("Max");
  });
});

function setOrganizerRole(token: string, groupId: string, participantId: string) {
  return call(patchParticipant, request("PATCH", `/api/groups/${groupId}/participants/${participantId}`, token, { isOrganizer: true }), env, {
    groupId,
    participantId,
  });
}

function pairThatMaySwap<G extends { me: Me }>(givers: G[]): [G, G] {
  for (const a of givers) {
    const b = givers.find((b) => b !== a && a.me.recipient!.id !== b.me.participant.id && b.me.recipient!.id !== a.me.participant.id);
    if (b) return [a, b];
  }
  throw new Error("no pair that may swap");
}

describe("POST /api/groups/:groupId/participants/:participantId/link refused", () => {
  it("answers 403 to a participant who is not an organizer, and the link keeps working", async () => {
    const { me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");
    const ina = await joinAs(me.group.inviteCode, "Ina");

    const response = await renewLink(max.token, me.group.id, ina.me.participant.id);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_organizer" });
    expect((await meWith(ina.token)).participant.name).toBe("Ina");
  });

  it("answers 403 to an organizer of a different group, even for a participant of their own group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const max = await joinAs(ours.me.group.inviteCode, "Max");
    const ina = await joinAs(theirs.me.group.inviteCode, "Ina");

    expect((await renewLink(theirs.token, ours.me.group.id, max.me.participant.id)).status).toBe(403);
    expect((await renewLink(theirs.token, ours.me.group.id, ina.me.participant.id)).status).toBe(403);
    expect((await meWith(max.token)).participant.name).toBe("Max");
    expect((await meWith(ina.token)).participant.name).toBe("Ina");
  });

  it("answers 404 for a participant who is not in the group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const ina = await joinAs(theirs.me.group.inviteCode, "Ina");

    const response = await renewLink(ours.token, ours.me.group.id, ina.me.participant.id);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_participant" });
    expect((await meWith(ina.token)).participant.name).toBe("Ina");
  });

  it("answers 401 without a known token", async () => {
    const { me } = await newGroup();

    expect((await renewLink(null, me.group.id, me.participant.id)).status).toBe(401);
    expect((await renewLink("nope", me.group.id, me.participant.id)).status).toBe(401);
  });
});

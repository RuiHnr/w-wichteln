import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { onRequestPost as createGroup } from "../groups";
import { onRequestPost as join } from "../invites/[code]/participants";
import { onRequestGet as getMe } from "../me";
import { onRequestPatch as patchGroup } from "./[groupId]/index";
import { onRequestDelete as deleteParticipant, onRequestPatch as patchParticipant } from "./[groupId]/participants/[participantId]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

async function newGroup(): Promise<CreateGroupResponse> {
  const body = { name: "WG Weihnachten", budget: "20", exchangeDate: "2099-12-20", organizerName: "Lea" };
  const response = await call(
    createGroup,
    new Request("http://app.test/api/groups", { method: "POST", body: JSON.stringify(body) }),
    env,
  );
  return response.json<CreateGroupResponse>();
}

async function joinAs(inviteCode: string, name: string): Promise<CreateGroupResponse> {
  const response = await call(
    join,
    new Request(`http://app.test/api/invites/${inviteCode}/participants`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
    env,
    { code: inviteCode },
  );
  expect(response.status).toBe(201);
  return response.json<CreateGroupResponse>();
}

async function meWith(token: string): Promise<Me> {
  const response = await call(
    getMe,
    new Request("http://app.test/api/me", { headers: { authorization: `Bearer ${token}` } }),
    env,
  );
  return response.json<Me>();
}

const draw = (groupId: string) => env.DB.prepare("UPDATE groups SET phase = 'drawn' WHERE id = ?").bind(groupId).run();

function request(method: string, url: string, token: string | null, body?: unknown): Request {
  return new Request(`http://app.test${url}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function editSettings(token: string | null, groupId: string, body: unknown) {
  return call(patchGroup, request("PATCH", `/api/groups/${groupId}`, token, body), env, { groupId });
}

describe("PATCH /api/groups/:groupId", () => {
  it("lets an organizer change budget and date while the group is open and when it is drawn", async () => {
    const { token, me } = await newGroup();

    const open = await editSettings(token, me.group.id, { budget: "25,50", exchangeDate: "2099-12-24" });
    expect(open.status).toBe(200);
    expect((await open.json<Me>()).group).toMatchObject({ budgetCents: 2550, exchangeDate: "2099-12-24" });

    await draw(me.group.id);
    const drawn = await editSettings(token, me.group.id, { budget: "30", exchangeDate: "2099-12-26" });
    expect(drawn.status).toBe(200);
    expect((await meWith(token)).group).toMatchObject({ budgetCents: 3000, exchangeDate: "2099-12-26", phase: "drawn" });
  });
});

describe("PATCH /api/groups/:groupId refused", () => {
  it("answers 403 to a participant who is not an organizer and changes nothing", async () => {
    const { token, me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");

    const response = await editSettings(max.token, me.group.id, { budget: "99", exchangeDate: "2099-12-24" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_organizer" });
    expect((await meWith(token)).group.budgetCents).toBe(2000);
  });

  it("answers 403 to an organizer of a different group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();

    const response = await editSettings(theirs.token, ours.me.group.id, { budget: "99", exchangeDate: "2099-12-24" });

    expect(response.status).toBe(403);
  });

  it("answers 401 without a known token", async () => {
    const { me } = await newGroup();

    expect((await editSettings(null, me.group.id, { budget: "99", exchangeDate: "2099-12-24" })).status).toBe(401);
    expect((await editSettings("nope", me.group.id, { budget: "99", exchangeDate: "2099-12-24" })).status).toBe(401);
  });

  it("answers 400 with an error code under each invalid field", async () => {
    const { token, me } = await newGroup();

    const response = await editSettings(token, me.group.id, { budget: "0", exchangeDate: "2000-01-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { budget: "invalid", exchangeDate: "past" } });
  });

  it("keeps an exchange date that has already passed when only the budget changes", async () => {
    const { token, me } = await newGroup();
    await env.DB.prepare("UPDATE groups SET exchange_date = '2001-12-24' WHERE id = ?").bind(me.group.id).run();

    const response = await editSettings(token, me.group.id, { budget: "15", exchangeDate: "2001-12-24" });

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).group).toMatchObject({ budgetCents: 1500, exchangeDate: "2001-12-24" });
  });
});

function removeParticipant(token: string | null, groupId: string, participantId: string) {
  return call(deleteParticipant, request("DELETE", `/api/groups/${groupId}/participants/${participantId}`, token), env, {
    groupId,
    participantId,
  });
}

describe("DELETE /api/groups/:groupId/participants/:participantId", () => {
  it("lets an organizer remove a participant while the group is open", async () => {
    const { token, me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");

    const response = await removeParticipant(token, me.group.id, max.me.participant.id);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).participants.map((p) => p.name)).toEqual(["Lea"]);
    const gone = await call(getMe, request("GET", "/api/me", max.token), env);
    expect(gone.status).toBe(401);
  });
});

describe("DELETE /api/groups/:groupId/participants/:participantId refused", () => {
  it("answers 409 drawn once the group has been drawn, and keeps the participant", async () => {
    const { token, me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");
    await draw(me.group.id);

    const response = await removeParticipant(token, me.group.id, max.me.participant.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "drawn" });
    expect((await meWith(token)).participants).toHaveLength(2);
  });

  it("answers 403 to a participant who is not an organizer", async () => {
    const { token, me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");
    const ina = await joinAs(me.group.inviteCode, "Ina");

    const response = await removeParticipant(max.token, me.group.id, ina.me.participant.id);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_organizer" });
    expect((await meWith(token)).participants).toHaveLength(3);
  });

  it("answers 401 without a known token", async () => {
    const { me } = await newGroup();
    const max = await joinAs(me.group.inviteCode, "Max");

    expect((await removeParticipant(null, me.group.id, max.me.participant.id)).status).toBe(401);
    expect((await removeParticipant("nope", me.group.id, max.me.participant.id)).status).toBe(401);
  });

  it("answers 404 for a participant of a different group and leaves them there", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const stranger = await joinAs(theirs.me.group.inviteCode, "Fremd");

    const response = await removeParticipant(ours.token, ours.me.group.id, stranger.me.participant.id);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_participant" });
    expect((await meWith(theirs.token)).participants).toHaveLength(2);
  });

  it("refuses an organizer removing themselves, so the last organizer always remains", async () => {
    const { token, me } = await newGroup();

    const response = await removeParticipant(token, me.group.id, me.participant.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "self" });
    expect((await meWith(token)).participant.isOrganizer).toBe(true);
  });
});

function setOrganizer(token: string | null, groupId: string, participantId: string, isOrganizer: unknown) {
  return call(
    patchParticipant,
    request("PATCH", `/api/groups/${groupId}/participants/${participantId}`, token, { isOrganizer }),
    env,
    { groupId, participantId },
  );
}

describe("PATCH /api/groups/:groupId/participants/:participantId", () => {
  it("lets an organizer grant the role, after which the new organizer has equal rights, also over the creator", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");

    const granted = await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, true);
    expect(granted.status).toBe(200);
    expect((await granted.json<Me>()).participants).toEqual([
      { id: lea.me.participant.id, name: "Lea", isOrganizer: true },
      { id: max.me.participant.id, name: "Max", isOrganizer: true },
    ]);

    const revoked = await setOrganizer(max.token, lea.me.group.id, lea.me.participant.id, false);
    expect(revoked.status).toBe(200);
    expect((await meWith(lea.token)).participant.isOrganizer).toBe(false);

    const removed = await removeParticipant(max.token, lea.me.group.id, lea.me.participant.id);
    expect(removed.status).toBe(200);
    expect((await removed.json<Me>()).participants.map((p) => p.name)).toEqual(["Max"]);
  });

  it("lets an organizer grant and revoke the role in the drawn phase, revealing no assignments", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    await draw(lea.me.group.id);

    const granted = await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, true);
    expect(granted.status).toBe(200);
    expect(Object.keys(await granted.json<Me>()).sort()).toEqual(["group", "participant", "participants"]);

    const revoked = await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, false);
    expect(revoked.status).toBe(200);
    expect((await meWith(max.token)).participant.isOrganizer).toBe(false);
  });

  it("lets an organizer revoke their own role while another organizer remains", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, true);

    const response = await setOrganizer(lea.token, lea.me.group.id, lea.me.participant.id, false);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).participant.isOrganizer).toBe(false);
  });
});

describe("DELETE /api/groups/:groupId/participants/:participantId on an organizer", () => {
  it("lets an organizer remove another organizer, including the creator, while one organizer remains", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, true);

    const response = await removeParticipant(max.token, lea.me.group.id, lea.me.participant.id);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).participants).toEqual([{ id: max.me.participant.id, name: "Max", isOrganizer: true }]);
  });
});

describe("PATCH /api/groups/:groupId/participants/:participantId refused", () => {
  it("answers 409 last_organizer when the last organizer would lose the role", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, true);
    await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, false);

    const response = await setOrganizer(lea.token, lea.me.group.id, lea.me.participant.id, false);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "last_organizer" });
    expect((await meWith(lea.token)).participant.isOrganizer).toBe(true);
  });

  it("answers 403 to a participant who is not an organizer, also when they try to make themselves one", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");

    const grantSelf = await setOrganizer(max.token, lea.me.group.id, max.me.participant.id, true);
    const revokeCreator = await setOrganizer(max.token, lea.me.group.id, lea.me.participant.id, false);

    expect(grantSelf.status).toBe(403);
    expect(revokeCreator.status).toBe(403);
    expect((await meWith(lea.token)).participants.map((p) => p.isOrganizer)).toEqual([true, false]);
  });

  it("answers 403 to an organizer of a different group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const max = await joinAs(ours.me.group.inviteCode, "Max");

    const response = await setOrganizer(theirs.token, ours.me.group.id, max.me.participant.id, true);

    expect(response.status).toBe(403);
  });

  it("answers 401 without a known token", async () => {
    const { me } = await newGroup();

    expect((await setOrganizer(null, me.group.id, me.participant.id, false)).status).toBe(401);
  });

  it("answers 404 for a participant of a different group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const stranger = await joinAs(theirs.me.group.inviteCode, "Fremd");

    const response = await setOrganizer(ours.token, ours.me.group.id, stranger.me.participant.id, true);

    expect(response.status).toBe(404);
    expect((await meWith(stranger.token)).participant.isOrganizer).toBe(false);
  });

  it("answers 400 when isOrganizer is not a boolean", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");

    const response = await setOrganizer(lea.token, lea.me.group.id, max.me.participant.id, "yes");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { isOrganizer: "invalid" } });
  });
});

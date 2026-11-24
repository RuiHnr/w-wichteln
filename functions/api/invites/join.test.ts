import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { onRequestPost as createGroup } from "../groups";
import { onRequestGet as getMe } from "../me";
import { onRequestPost as join } from "./[code]/participants";

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

function postJoin(code: string, body: unknown) {
  return call(
    join,
    new Request(`http://app.test/api/invites/${code}/participants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    { code },
  );
}

async function meWith(token: string): Promise<Me> {
  const response = await call(
    getMe,
    new Request("http://app.test/api/me", { headers: { authorization: `Bearer ${token}` } }),
    env,
  );
  expect(response.status).toBe(200);
  return response.json<Me>();
}

describe("POST /api/invites/:code/participants", () => {
  it("adds a participant to the open group and returns a token that recognises them", async () => {
    const { me: organizer } = await newGroup();

    const response = await postJoin(organizer.group.inviteCode, { name: "Max" });

    expect(response.status).toBe(201);
    const { token, me } = await response.json<CreateGroupResponse>();
    expect(me.group.id).toBe(organizer.group.id);
    expect(me.participant).toEqual({ id: expect.any(String), name: "Max", isOrganizer: false });
    expect(await meWith(token)).toEqual(me);
  });
});

describe("POST /api/invites/:code/participants with a name already in the group", () => {
  it("rejects a name that is already taken, ignoring case, and adds nobody", async () => {
    const { token, me } = await newGroup();
    await postJoin(me.group.inviteCode, { name: "Max" });

    for (const name of ["Max", "max", "  LEA "]) {
      const response = await postJoin(me.group.inviteCode, { name });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ errors: { name: "taken" } });
    }
    expect((await meWith(token)).participants.map((p) => p.name)).toEqual(["Lea", "Max"]);
  });

  it("allows the same name in a different group", async () => {
    const first = await newGroup();
    const second = await newGroup();
    await postJoin(first.me.group.inviteCode, { name: "Max" });

    const response = await postJoin(second.me.group.inviteCode, { name: "Max" });

    expect(response.status).toBe(201);
  });
});

describe("POST /api/invites/:code/participants that cannot join", () => {
  it("answers 400 for an empty or too long name", async () => {
    const { me } = await newGroup();

    const empty = await postJoin(me.group.inviteCode, { name: "   " });
    const tooLong = await postJoin(me.group.inviteCode, { name: "x".repeat(41) });
    const notJson = await call(
      join,
      new Request("http://app.test/api/invites/x/participants", { method: "POST", body: "name=Max" }),
      env,
      { code: me.group.inviteCode },
    );

    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ errors: { name: "required" } });
    expect(await tooLong.json()).toEqual({ errors: { name: "tooLong" } });
    expect(notJson.status).toBe(400);
  });

  it("answers 404 for an unknown invite code without revealing any group", async () => {
    const response = await postJoin("no-such-code", { name: "Max" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_group" });
  });

  it("answers 409 closed once the group has been drawn", async () => {
    const { me } = await newGroup();
    await env.DB.prepare("UPDATE groups SET phase = 'drawn' WHERE id = ?").bind(me.group.id).run();

    const response = await postJoin(me.group.inviteCode, { name: "Max" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "closed" });
  });
});

describe("GET /api/me after joining", () => {
  it("lists only the participants of the caller's own group", async () => {
    const ours = await newGroup();
    const theirs = await newGroup();
    const joined = await (await postJoin(ours.me.group.inviteCode, { name: "Max" })).json<CreateGroupResponse>();
    await postJoin(theirs.me.group.inviteCode, { name: "Fremd" });

    const me = await meWith(joined.token);

    expect(me.participants).toEqual([
      { id: ours.me.participant.id, name: "Lea", isOrganizer: true },
      { id: joined.me.participant.id, name: "Max", isOrganizer: false },
    ]);
  });
});

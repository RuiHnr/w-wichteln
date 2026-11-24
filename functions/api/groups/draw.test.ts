import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestPost as postExclusion } from "./[groupId]/exclusions/index";
import { onRequestPost as join } from "../invites/[code]/participants";
import { onRequestPost as postDraw } from "./[groupId]/draw";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith } = groupHelpers(() => env);

function draw(token: string | null, groupId: string) {
  return call(postDraw, request("POST", `/api/groups/${groupId}/draw`, token), env, { groupId });
}

function exclude(token: string, groupId: string, a: CreateGroupResponse, b: CreateGroupResponse) {
  return call(postExclusion, request("POST", `/api/groups/${groupId}/exclusions`, token, {
    participantIds: [a.me.participant.id, b.me.participant.id],
  }), env, { groupId });
}

/** Lea's group with the others named in it. */
async function groupWith(...names: string[]) {
  const lea = await newGroup();
  const others = [];
  for (const name of names) others.push(await joinAs(lea.me.group.inviteCode, name));
  return { lea, everyone: [lea, ...others], groupId: lea.me.group.id };
}

/** Each participant's own recipient, as each of them sees it: giver name → recipient name. */
async function recipientsSeenBy(everyone: CreateGroupResponse[]): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  for (const { token } of everyone) {
    const me = await meWith(token);
    seen.set(me.participant.name, me.recipient!.name);
  }
  return seen;
}

describe("POST /api/groups/:groupId/draw", () => {
  it("lets an organizer draw: the group is Drawn and everyone gives once and receives once, never to themselves", async () => {
    const { lea, everyone, groupId } = await groupWith("Max", "Ina", "Tom");

    const response = await draw(lea.token, groupId);

    expect(response.status).toBe(200);
    const me = await response.json<Me>();
    expect(me.group.phase).toBe("drawn");
    expect(me.recipient).toBeDefined();
    const seen = await recipientsSeenBy(everyone);
    expect([...seen.keys()].sort()).toEqual(["Ina", "Lea", "Max", "Tom"]);
    expect([...seen.values()].sort()).toEqual(["Ina", "Lea", "Max", "Tom"]);
    for (const [giver, recipient] of seen) expect(recipient).not.toBe(giver);
  });
});

describe("the draw respects exclusions", () => {
  it("never makes an assignment between two participants with an exclusion", async () => {
    for (let run = 0; run < 10; run++) {
      const { lea, everyone, groupId } = await groupWith("Max", "Ina", "Tom");
      const [, max, ina, tom] = everyone;
      // Only Lea→Ina→Max→Tom→Lea and its reverse avoid Lea↔Max and Ina↔Tom.
      await exclude(lea.token, groupId, lea, max);
      await exclude(lea.token, groupId, ina, tom);

      expect((await draw(lea.token, groupId)).status).toBe(200);

      const seen = await recipientsSeenBy(everyone);
      expect(seen.get("Lea")).not.toBe("Max");
      expect(seen.get("Max")).not.toBe("Lea");
      expect(seen.get("Ina")).not.toBe("Tom");
      expect(seen.get("Tom")).not.toBe("Ina");
    }
  });
});

describe("nobody sees all assignments (ADR 0003)", () => {
  it("gives each participant only their own recipient, organizers included", async () => {
    const { lea, everyone, groupId } = await groupWith("Max", "Ina");

    const drawn = await (await draw(lea.token, groupId)).json<Me>();

    expect(Object.keys(drawn).sort()).toEqual(["exclusions", "group", "participant", "participants", "recipient"]);
    expect(Object.keys(drawn.recipient!).sort()).toEqual(["id", "name"]);
    for (const { token } of everyone) {
      const me = await meWith(token);
      expect(me.participants.every((p) => Object.keys(p).sort().join() === "id,isOrganizer,name")).toBe(true);
      expect(me.recipient!.id).not.toBe(me.participant.id);
    }
  });

  it("shows no recipient before the draw", async () => {
    const { lea } = await groupWith("Max", "Ina");

    expect(await meWith(lea.token)).not.toHaveProperty("recipient");
  });
});

describe("POST /api/groups/:groupId/draw refused", () => {
  it("answers 409 too_few with fewer than 3 participants and leaves the group open", async () => {
    const { lea, groupId } = await groupWith("Max");

    const response = await draw(lea.token, groupId);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "too_few" });
    expect((await meWith(lea.token)).group.phase).toBe("open");
  });

  it("answers 409 impossible when the exclusions leave no valid draw, and changes nothing", async () => {
    const { lea, everyone, groupId } = await groupWith("Max", "Ina");
    const [, max, ina] = everyone;
    await exclude(lea.token, groupId, lea, max);
    await exclude(lea.token, groupId, lea, ina);

    const response = await draw(lea.token, groupId);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "impossible" });
    for (const { token } of everyone) {
      const me = await meWith(token);
      expect(me.group.phase).toBe("open");
      expect(me).not.toHaveProperty("recipient");
    }
    // With one more participant there is someone left for Lea, and the draw goes through.
    await joinAs(lea.me.group.inviteCode, "Tom");
    expect((await draw(lea.token, groupId)).status).toBe(200);
  });

  it("answers 409 drawn to a second draw and keeps the first assignments", async () => {
    const { lea, everyone, groupId } = await groupWith("Max", "Ina", "Tom", "Ben");
    await draw(lea.token, groupId);
    const before = await recipientsSeenBy(everyone);

    const again = await draw(lea.token, groupId);

    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "drawn" });
    expect(await recipientsSeenBy(everyone)).toEqual(before);
  });

  it("answers 403 to a participant who is not an organizer and 401 without a known token", async () => {
    const { lea, everyone, groupId } = await groupWith("Max", "Ina");
    const theirs = await newGroup();

    const byMax = await draw(everyone[1].token, groupId);
    expect(byMax.status).toBe(403);
    expect(await byMax.json()).toEqual({ error: "not_organizer" });
    expect((await draw(theirs.token, groupId)).status).toBe(403);
    expect((await draw(null, groupId)).status).toBe(401);
    expect((await draw("nope", groupId)).status).toBe(401);
    expect((await meWith(lea.token)).group.phase).toBe("open");
  });
});

describe("joining after the draw", () => {
  it("is refused with 409 closed", async () => {
    const { lea, groupId } = await groupWith("Max", "Ina");
    await draw(lea.token, groupId);

    const response = await call(join, request("POST", `/api/invites/${lea.me.group.inviteCode}/participants`, null, { name: "Tom" }), env, {
      code: lea.me.group.inviteCode,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "closed" });
  });
});

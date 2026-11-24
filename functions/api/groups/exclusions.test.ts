import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestGet as getMe } from "../me";
import { onRequestDelete as deleteExclusion } from "./[groupId]/exclusions/[exclusionId]";
import { onRequestPost as postExclusion } from "./[groupId]/exclusions/index";
import { onRequestDelete as deleteParticipant } from "./[groupId]/participants/[participantId]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function addExclusion(token: string | null, groupId: string, participantIds: unknown) {
  return call(postExclusion, request("POST", `/api/groups/${groupId}/exclusions`, token, { participantIds }), env, { groupId });
}

function removeExclusion(token: string | null, groupId: string, exclusionId: string) {
  return call(deleteExclusion, request("DELETE", `/api/groups/${groupId}/exclusions/${exclusionId}`, token), env, {
    groupId,
    exclusionId,
  });
}

/** Lea's group with Max and Ina in it. */
async function groupOfThree() {
  const lea = await newGroup();
  const max = await joinAs(lea.me.group.inviteCode, "Max");
  const ina = await joinAs(lea.me.group.inviteCode, "Ina");
  return { lea, max, ina, groupId: lea.me.group.id };
}

/** The exclusions as sorted name pairs, so the stored order does not matter. */
function pairs(me: Me): string[][] {
  const name = (id: string) => me.participants.find((p) => p.id === id)!.name;
  return me.exclusions!.map((e) => e.participantIds.map(name).sort()).sort();
}

describe("POST /api/groups/:groupId/exclusions", () => {
  it("lets an organizer add an exclusion between two participants", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();

    const response = await addExclusion(lea.token, groupId, [max.me.participant.id, ina.me.participant.id]);

    expect(response.status).toBe(200);
    expect(pairs(await response.json<Me>())).toEqual([["Ina", "Max"]]);
    expect(pairs(await meWith(lea.token))).toEqual([["Ina", "Max"]]);
  });

  it("ignores an exclusion that exists already, in either order", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const [maxId, inaId] = [max.me.participant.id, ina.me.participant.id];
    await addExclusion(lea.token, groupId, [maxId, inaId]);

    const same = await addExclusion(lea.token, groupId, [maxId, inaId]);
    const reversed = await addExclusion(lea.token, groupId, [inaId, maxId]);

    expect(same.status).toBe(200);
    expect(reversed.status).toBe(200);
    expect((await reversed.json<Me>()).exclusions).toHaveLength(1);
  });

  it("lets an organizer exclude themselves from someone", async () => {
    const { lea, max, groupId } = await groupOfThree();

    const response = await addExclusion(lea.token, groupId, [lea.me.participant.id, max.me.participant.id]);

    expect(pairs(await response.json<Me>())).toEqual([["Lea", "Max"]]);
  });
});

describe("POST /api/groups/:groupId/exclusions refused", () => {
  it("answers 400 same for one participant twice", async () => {
    const { lea, max, groupId } = await groupOfThree();

    const response = await addExclusion(lea.token, groupId, [max.me.participant.id, max.me.participant.id]);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { participantIds: "same" } });
  });

  it("answers 400 invalid when participantIds is not two ids", async () => {
    const { lea, max, groupId } = await groupOfThree();

    for (const ids of [undefined, "x", [max.me.participant.id], [max.me.participant.id, 3], ["a", "b", "c"]]) {
      const response = await addExclusion(lea.token, groupId, ids);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ errors: { participantIds: "invalid" } });
    }
  });

  it("answers 409 drawn once the group has been drawn, and adds nothing", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    await draw(groupId);

    const response = await addExclusion(lea.token, groupId, [max.me.participant.id, ina.me.participant.id]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "drawn" });
    expect((await meWith(lea.token)).exclusions).toEqual([]);
  });

  it("answers 404 for a participant of a different group", async () => {
    const { lea, max, groupId } = await groupOfThree();
    const theirs = await newGroup();

    const response = await addExclusion(lea.token, groupId, [max.me.participant.id, theirs.me.participant.id]);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "unknown_participant" });
    expect((await meWith(lea.token)).exclusions).toEqual([]);
  });

  it("answers 403 to a participant who is not an organizer, and 403 to an organizer of a different group", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const theirs = await newGroup();
    const ids = [max.me.participant.id, ina.me.participant.id];

    const byMax = await addExclusion(max.token, groupId, ids);
    const byStranger = await addExclusion(theirs.token, groupId, ids);

    expect(byMax.status).toBe(403);
    expect(await byMax.json()).toEqual({ error: "not_organizer" });
    expect(byStranger.status).toBe(403);
    expect((await meWith(lea.token)).exclusions).toEqual([]);
  });

  it("answers 401 without a known token", async () => {
    const { max, ina, groupId } = await groupOfThree();
    const ids = [max.me.participant.id, ina.me.participant.id];

    expect((await addExclusion(null, groupId, ids)).status).toBe(401);
    expect((await addExclusion("nope", groupId, ids)).status).toBe(401);
  });
});

describe("exclusions are for organizers only", () => {
  it("never shows them to a participant who is not an organizer", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    await addExclusion(lea.token, groupId, [max.me.participant.id, ina.me.participant.id]);

    const asMax = await call(getMe, request("GET", "/api/me", max.token), env);

    expect(await asMax.json()).not.toHaveProperty("exclusions");
  });
});

describe("DELETE /api/groups/:groupId/exclusions/:exclusionId", () => {
  it("lets an organizer remove an exclusion", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const added = await (await addExclusion(lea.token, groupId, [max.me.participant.id, ina.me.participant.id])).json<Me>();

    const response = await removeExclusion(lea.token, groupId, added.exclusions![0].id);

    expect(response.status).toBe(200);
    expect((await response.json<Me>()).exclusions).toEqual([]);
  });
});

describe("DELETE /api/groups/:groupId/exclusions/:exclusionId refused", () => {
  async function groupWithExclusion() {
    const group = await groupOfThree();
    const added = await addExclusion(group.lea.token, group.groupId, [group.max.me.participant.id, group.ina.me.participant.id]);
    return { ...group, exclusionId: (await added.json<Me>()).exclusions![0].id };
  }

  it("answers 409 drawn once the group has been drawn, and keeps the exclusion", async () => {
    const { lea, groupId, exclusionId } = await groupWithExclusion();
    await draw(groupId);

    const response = await removeExclusion(lea.token, groupId, exclusionId);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "drawn" });
    expect((await meWith(lea.token)).exclusions).toHaveLength(1);
  });

  it("answers 404 for an exclusion that is gone or belongs to a different group", async () => {
    const { lea, groupId, exclusionId } = await groupWithExclusion();
    const theirs = await groupWithExclusion();
    await removeExclusion(lea.token, groupId, exclusionId);

    const gone = await removeExclusion(lea.token, groupId, exclusionId);
    const foreign = await removeExclusion(lea.token, groupId, theirs.exclusionId);

    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "unknown_exclusion" });
    expect(foreign.status).toBe(404);
    expect((await meWith(theirs.lea.token)).exclusions).toHaveLength(1);
  });

  it("answers 403 to a participant who is not an organizer, and 401 without a known token", async () => {
    const { lea, max, groupId, exclusionId } = await groupWithExclusion();

    expect((await removeExclusion(max.token, groupId, exclusionId)).status).toBe(403);
    expect((await removeExclusion(null, groupId, exclusionId)).status).toBe(401);
    expect((await meWith(lea.token)).exclusions).toHaveLength(1);
  });
});

describe("removing a participant", () => {
  it("removes their exclusions and keeps the others", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const [leaId, maxId, inaId] = [lea.me.participant.id, max.me.participant.id, ina.me.participant.id];
    await addExclusion(lea.token, groupId, [maxId, inaId]);
    await addExclusion(lea.token, groupId, [leaId, inaId]);
    await addExclusion(lea.token, groupId, [leaId, maxId]);

    const response = await call(deleteParticipant, request("DELETE", `/api/groups/${groupId}/participants/${inaId}`, lea.token), env, {
      groupId,
      participantId: inaId,
    });

    expect(response.status).toBe(200);
    expect(pairs(await response.json<Me>())).toEqual([["Lea", "Max"]]);
  });
});

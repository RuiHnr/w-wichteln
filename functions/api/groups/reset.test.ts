import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse, Me } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { groupHelpers, request } from "../../test/groups";
import { onRequestDelete as deleteDraw } from "./[groupId]/draw";
import { onRequestPost as postExclusion } from "./[groupId]/exclusions/index";
import { onRequestDelete as deleteParticipant } from "./[groupId]/participants/[participantId]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function reset(token: string | null, groupId: string) {
  return call(deleteDraw, request("DELETE", `/api/groups/${groupId}/draw`, token), env, { groupId });
}

/** Lea's group with the others named in it, drawn. */
async function drawnGroupWith(...names: string[]) {
  const lea = await newGroup();
  const others: CreateGroupResponse[] = [];
  for (const name of names) others.push(await joinAs(lea.me.group.inviteCode, name));
  const groupId = lea.me.group.id;
  await draw(lea.token, groupId);
  return { lea, everyone: [lea, ...others], groupId };
}

describe("DELETE /api/groups/:groupId/draw (Reset)", () => {
  it("lets an organizer reset a drawn group: it is Open again and nobody has a recipient", async () => {
    const { lea, everyone, groupId } = await drawnGroupWith("Max", "Ina");

    const response = await reset(lea.token, groupId);

    expect(response.status).toBe(200);
    const me = await response.json<Me>();
    expect(me.group.phase).toBe("open");
    expect(me).not.toHaveProperty("recipient");
    for (const { token } of everyone) {
      const seen = await meWith(token);
      expect(seen.group.phase).toBe("open");
      expect(seen).not.toHaveProperty("recipient");
    }
  });

  it("opens the group again for latecomers, removals and exclusions, and a new draw includes them", async () => {
    const { lea, everyone, groupId } = await drawnGroupWith("Max", "Ina", "Tom");
    const [, max, ina, tom] = everyone;

    await reset(lea.token, groupId);

    const ben = await joinAs(lea.me.group.inviteCode, "Ben");
    const removed = await call(
      deleteParticipant,
      request("DELETE", `/api/groups/${groupId}/participants/${max.me.participant.id}`, lea.token),
      env,
      { groupId, participantId: max.me.participant.id },
    );
    expect(removed.status).toBe(200);
    const excluded = await call(
      postExclusion,
      request("POST", `/api/groups/${groupId}/exclusions`, lea.token, { participantIds: [lea.me.participant.id, ina.me.participant.id] }),
      env,
      { groupId },
    );
    expect(excluded.status).toBe(200);

    expect((await draw(lea.token, groupId)).group.phase).toBe("drawn");
    const givers = [lea, ina, tom, ben];
    const seen = new Map<string, string>();
    for (const { token } of givers) {
      const me = await meWith(token);
      seen.set(me.participant.name, me.recipient!.name);
    }
    expect([...seen.values()].sort()).toEqual(["Ben", "Ina", "Lea", "Tom"]);
    expect(seen.get("Lea")).not.toBe("Ina");
    expect(seen.get("Ina")).not.toBe("Lea");
  });

  it("can be reset and drawn again more than once", async () => {
    const { lea, groupId } = await drawnGroupWith("Max", "Ina");

    for (let round = 0; round < 3; round++) {
      expect((await reset(lea.token, groupId)).status).toBe(200);
      expect((await draw(lea.token, groupId)).recipient).toBeDefined();
    }
  });
});

describe("DELETE /api/groups/:groupId/draw refused", () => {
  it("answers 409 not_drawn while the group is open", async () => {
    const lea = await newGroup();

    const response = await reset(lea.token, lea.me.group.id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_drawn" });
  });

  it("answers 403 to a participant who is not an organizer and 401 without a known token, keeping the assignments", async () => {
    const { lea, everyone, groupId } = await drawnGroupWith("Max", "Ina");
    const theirs = await newGroup();
    const before = (await meWith(lea.token)).recipient;

    const byMax = await reset(everyone[1].token, groupId);
    expect(byMax.status).toBe(403);
    expect(await byMax.json()).toEqual({ error: "not_organizer" });
    const byOutsider = await reset(theirs.token, groupId);
    expect(byOutsider.status).toBe(403);
    expect(await byOutsider.json()).toEqual({ error: "not_organizer" });
    expect((await reset(null, groupId)).status).toBe(401);
    expect((await reset("nope", groupId)).status).toBe(401);

    const after = await meWith(lea.token);
    expect(after.group.phase).toBe("drawn");
    expect(after.recipient).toEqual(before);
  });
});

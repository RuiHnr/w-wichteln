import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_PICTURE_BYTES } from "../../shared/picture";
import type { Env } from "../env";
import { deleteExpiredGroups } from "../lib/cleanup";
import { call, createTestEnv } from "../test/d1";
import { groupHelpers, request } from "../test/groups";
import { onRequestDelete as deleteGroup } from "./groups/[groupId]/index";
import { onRequestDelete as removeParticipant } from "./groups/[groupId]/participants/[participantId]";
import { onRequestDelete as deleteGroupPicture, onRequestPut as putGroupPicture } from "./groups/[groupId]/picture";
import {
  onRequestDelete as deleteParticipantPicture,
  onRequestPut as putParticipantPicture,
} from "./groups/[groupId]/participants/[participantId]/picture";
import { onRequestGet as getPicture } from "./pictures/[groupId]/[key]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 7]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);

const upload = (body: Uint8Array, token: string | null, url: string) =>
  new Request(`http://app.test${url}`, {
    method: "PUT",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/octet-stream" },
    body,
  });

const putGroup = (token: string | null, groupId: string, body: Uint8Array = PNG) =>
  call(putGroupPicture, upload(body, token, `/api/groups/${groupId}/picture`), env, { groupId });
const removeGroup = (token: string | null, groupId: string) =>
  call(deleteGroupPicture, request("DELETE", `/api/groups/${groupId}/picture`, token), env, { groupId });
const putOwn = (token: string | null, groupId: string, participantId: string, body: Uint8Array = PNG) =>
  call(putParticipantPicture, upload(body, token, `/api/groups/${groupId}/participants/${participantId}/picture`), env, {
    groupId,
    participantId,
  });
const removeOwn = (token: string | null, groupId: string, participantId: string) =>
  call(deleteParticipantPicture, request("DELETE", `/api/groups/${groupId}/participants/${participantId}/picture`, token), env, {
    groupId,
    participantId,
  });

/** The picture behind a URL the API gave out, fetched the way the browser would: no token. */
const fetchPicture = (url: string) => {
  const [, , , groupId, key] = url.split("/");
  return call(getPicture, request("GET", url, null), env, { groupId, key });
};

const objectsOf = async (groupId: string) => (await env.PICTURES!.list({ prefix: `${groupId}/` })).objects.length;

async function groupOfThree() {
  const lea = await newGroup();
  const max = await joinAs(lea.me.group.inviteCode, "Max");
  const ina = await joinAs(lea.me.group.inviteCode, "Ina");
  return { lea, max, ina, groupId: lea.me.group.id };
}

describe("Group Picture", () => {
  it("is uploaded by an organizer, shows in the view and is served without a token", async () => {
    const { lea, max, groupId } = await groupOfThree();
    expect((await meWith(lea.token)).group.picture).toBeUndefined();

    const response = await putGroup(lea.token, groupId, JPEG);
    expect(response.status).toBe(200);
    const url = (await response.json<{ group: { picture: string } }>()).group.picture;
    expect(url).toMatch(new RegExp(`^/api/pictures/${groupId}/[0-9a-f]{32}$`));
    expect((await meWith(max.token)).group.picture).toBe(url);

    const served = await fetchPicture(url);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect([...new Uint8Array(await served.arrayBuffer())]).toEqual([...JPEG]);
  });

  it("can be uploaded and replaced by any organizer, in either phase, and the old image is deleted", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const promote = await call(
      (await import("./groups/[groupId]/participants/[participantId]")).onRequestPatch,
      request("PATCH", `/api/groups/${groupId}/participants/${max.me.participant.id}`, lea.token, { isOrganizer: true }),
      env,
      { groupId, participantId: max.me.participant.id },
    );
    expect(promote.status).toBe(200);

    const first = (await (await putGroup(lea.token, groupId, PNG)).json<{ group: { picture: string } }>()).group.picture;
    await draw(lea.token, groupId);
    const second = (await (await putGroup(max.token, groupId, WEBP)).json<{ group: { picture: string } }>()).group.picture;

    expect(second).not.toBe(first);
    expect((await fetchPicture(first)).status).toBe(404);
    expect((await fetchPicture(second)).status).toBe(200);
    expect(await objectsOf(groupId)).toBe(1);
    expect((await meWith(ina.token)).group.picture).toBe(second);
  });

  it("is removed by an organizer, which deletes the image", async () => {
    const { lea, groupId } = await groupOfThree();
    const url = (await (await putGroup(lea.token, groupId)).json<{ group: { picture: string } }>()).group.picture;

    const response = await removeGroup(lea.token, groupId);
    expect(response.status).toBe(200);
    expect((await response.json<{ group: { picture?: string } }>()).group.picture).toBeUndefined();
    expect((await fetchPicture(url)).status).toBe(404);
    expect(await objectsOf(groupId)).toBe(0);
  });

  it("is refused to everyone but organizers, and stays as it was", async () => {
    const { lea, max, groupId } = await groupOfThree();
    const url = (await (await putGroup(lea.token, groupId)).json<{ group: { picture: string } }>()).group.picture;

    expect((await putGroup(max.token, groupId, JPEG)).status).toBe(403);
    expect((await removeGroup(max.token, groupId)).status).toBe(403);
    expect((await putGroup("unknown", groupId)).status).toBe(401);
    expect((await putGroup(null, groupId)).status).toBe(401);
    expect((await removeGroup(null, groupId)).status).toBe(401);

    const other = await newGroup();
    expect((await putGroup(other.token, groupId)).status).toBe(403);
    expect((await meWith(lea.token)).group.picture).toBe(url);
    expect(await objectsOf(groupId)).toBe(1);
  });
});

describe("Participant Picture", () => {
  it("is set by the participant themselves; everyone in the group sees it, and so does their giver after the draw", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const maxId = max.me.participant.id;
    const response = await putOwn(max.token, groupId, maxId, PNG);
    expect(response.status).toBe(200);
    const url = (await response.json<{ participant: { picture: string } }>()).participant.picture;
    expect(url).toMatch(new RegExp(`^/api/pictures/${groupId}/[0-9a-f]{32}$`));

    const seenByLea = (await meWith(lea.token)).participants.find((p) => p.id === maxId);
    expect(seenByLea?.picture).toBe(url);
    expect((await meWith(ina.token)).participants.find((p) => p.id === lea.me.participant.id)?.picture).toBeUndefined();

    await draw(lea.token, groupId);
    for (const giver of [lea, ina]) {
      const me = await meWith(giver.token);
      if (me.recipient?.id === maxId) expect(me.recipient.picture).toBe(url);
    }
    const givers = [await meWith(lea.token), await meWith(ina.token)];
    expect(givers.filter((me) => me.recipient?.id === maxId)).toHaveLength(1);
  });

  it("can be replaced and removed in either phase, deleting the old image each time", async () => {
    const { lea, max, groupId } = await groupOfThree();
    const maxId = max.me.participant.id;
    const first = (await (await putOwn(max.token, groupId, maxId, PNG)).json<{ participant: { picture: string } }>()).participant.picture;
    await draw(lea.token, groupId);
    const second = (await (await putOwn(max.token, groupId, maxId, JPEG)).json<{ participant: { picture: string } }>()).participant.picture;
    expect((await fetchPicture(first)).status).toBe(404);
    expect((await fetchPicture(second)).status).toBe(200);

    const removed = await removeOwn(max.token, groupId, maxId);
    expect(removed.status).toBe(200);
    expect((await removed.json<{ participant: { picture?: string } }>()).participant.picture).toBeUndefined();
    expect((await fetchPicture(second)).status).toBe(404);
    expect(await objectsOf(groupId)).toBe(0);
  });

  it("cannot be changed or removed by anyone else, not even an organizer", async () => {
    const { lea, max, ina, groupId } = await groupOfThree();
    const maxId = max.me.participant.id;
    const url = (await (await putOwn(max.token, groupId, maxId, PNG)).json<{ participant: { picture: string } }>()).participant.picture;

    for (const caller of [lea, ina]) {
      const put = await putOwn(caller.token, groupId, maxId, JPEG);
      expect(put.status).toBe(403);
      expect(await put.json()).toEqual({ error: "not_self" });
      expect((await removeOwn(caller.token, groupId, maxId)).status).toBe(403);
    }
    expect((await putOwn(null, groupId, maxId)).status).toBe(401);
    expect((await removeOwn("unknown", groupId, maxId)).status).toBe(401);

    expect((await meWith(max.token)).participant.picture).toBe(url);
    expect(await objectsOf(groupId)).toBe(1);

    // not even in the group the participant belongs to, with the wrong group in the path
    const other = await newGroup();
    expect((await putOwn(other.token, groupId, maxId)).status).toBe(403);
  });

  it("is deleted together with the participant an organizer removes", async () => {
    const { lea, max, groupId } = await groupOfThree();
    const maxId = max.me.participant.id;
    const url = (await (await putOwn(max.token, groupId, maxId, PNG)).json<{ participant: { picture: string } }>()).participant.picture;
    await putGroup(lea.token, groupId, JPEG);

    const removed = await call(
      removeParticipant,
      request("DELETE", `/api/groups/${groupId}/participants/${maxId}`, lea.token),
      env,
      { groupId, participantId: maxId },
    );
    expect(removed.status).toBe(200);
    expect((await fetchPicture(url)).status).toBe(404);
    expect(await objectsOf(groupId)).toBe(1); // the Group Picture stays
  });
});

describe("validation", () => {
  it("rejects wrong formats and oversized or empty uploads, keeping the current picture", async () => {
    const { lea, max, groupId } = await groupOfThree();
    const maxId = max.me.participant.id;
    const url = (await (await putGroup(lea.token, groupId, PNG)).json<{ group: { picture: string } }>()).group.picture;

    const gif = await putGroup(lea.token, groupId, GIF);
    expect(gif.status).toBe(415);
    expect(await gif.json()).toEqual({ error: "wrong_format" });
    expect((await putGroup(lea.token, groupId, new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
    expect((await putOwn(max.token, groupId, maxId, new Uint8Array())).status).toBe(415);

    const big = new Uint8Array(MAX_PICTURE_BYTES + 1);
    big.set(PNG);
    const tooLarge = await putOwn(max.token, groupId, maxId, big);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "too_large" });
    const exactly = new Uint8Array(MAX_PICTURE_BYTES);
    exactly.set(PNG);
    expect((await putOwn(max.token, groupId, maxId, exactly)).status).toBe(200);

    expect((await meWith(lea.token)).group.picture).toBe(url);
    expect(await objectsOf(groupId)).toBe(2);
  });

  it("checks who may upload before looking at the upload", async () => {
    const { max, groupId } = await groupOfThree();
    expect((await putGroup(max.token, groupId, GIF)).status).toBe(403);
  });
});

describe("serving", () => {
  it("answers 404 for keys that do not exist, whatever they look like", async () => {
    const { groupId } = await groupOfThree();
    for (const key of ["0".repeat(32), "../x", ""]) {
      expect((await call(getPicture, request("GET", "/api/pictures/x", null), env, { groupId, key })).status).toBe(404);
    }
  });

  it("serves with a long cache lifetime and without letting the browser guess the type", async () => {
    const { lea, groupId } = await groupOfThree();
    const url = (await (await putGroup(lea.token, groupId, PNG)).json<{ group: { picture: string } }>()).group.picture;
    const served = await fetchPicture(url);
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("cleanup", () => {
  it("Group Deletion deletes all images of the group and only those", async () => {
    const { lea, max, groupId } = await groupOfThree();
    await putGroup(lea.token, groupId);
    await putOwn(max.token, groupId, max.me.participant.id);
    const other = await newGroup();
    await putGroup(other.token, other.me.group.id);
    expect(await objectsOf(groupId)).toBe(2);

    const deleted = await call(deleteGroup, request("DELETE", `/api/groups/${groupId}`, lea.token), env, { groupId });
    expect(deleted.status).toBe(204);
    expect(await objectsOf(groupId)).toBe(0);
    expect(await objectsOf(other.me.group.id)).toBe(1);
  });

  it("a refused Group Deletion keeps the images", async () => {
    const { lea, max, groupId } = await groupOfThree();
    await putGroup(lea.token, groupId);
    const refused = await call(deleteGroup, request("DELETE", `/api/groups/${groupId}`, max.token), env, { groupId });
    expect(refused.status).toBe(403);
    expect(await objectsOf(groupId)).toBe(1);
  });

  it("Expiry deletes all images of an expired group", async () => {
    const { lea, max, groupId } = await groupOfThree();
    await putGroup(lea.token, groupId);
    await putOwn(max.token, groupId, max.me.participant.id);
    const live = await newGroup();
    await putGroup(live.token, live.me.group.id);

    await env.DB.prepare("UPDATE groups SET exchange_date = '2000-01-01' WHERE id = ?").bind(groupId).run();
    await deleteExpiredGroups(env.DB, Date.now(), 50, env.PICTURES);

    expect(await objectsOf(groupId)).toBe(0);
    expect(await objectsOf(live.me.group.id)).toBe(1);
  });
});

describe("without the R2 binding", () => {
  it("answers uploads with 503 while everything else keeps working", async () => {
    const { lea, groupId } = await groupOfThree();
    const noBucket: Env = { DB: env.DB };
    const response = await call(putGroupPicture, upload(PNG, lea.token, `/api/groups/${groupId}/picture`), noBucket, { groupId });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect((await meWith(lea.token)).group.name).toBe("WG Weihnachten");

    const served = await call(getPicture, request("GET", "/x", null), noBucket, { groupId, key: "0".repeat(32) });
    expect(served.status).toBe(404);
  });
});

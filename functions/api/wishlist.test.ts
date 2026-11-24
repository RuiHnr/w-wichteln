import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Me } from "../../shared/api";
import { MAX_WISHLIST_LENGTH } from "../../shared/wishlist";
import type { Env } from "../env";
import { call, createTestEnv } from "../test/d1";
import { groupHelpers, request } from "../test/groups";
import { onRequestPut as putWishlist } from "./me/wishlist";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const { newGroup, joinAs, meWith, draw } = groupHelpers(() => env);

function writeWishlist(token: string | null, body: unknown) {
  return call(putWishlist, request("PUT", "/api/me/wishlist", token, body), env);
}

/** Lea's group with Max and Ina, drawn. */
async function drawnGroup() {
  const lea = await newGroup();
  const max = await joinAs(lea.me.group.inviteCode, "Max");
  const ina = await joinAs(lea.me.group.inviteCode, "Ina");
  await draw(lea.token, lea.me.group.id);
  return [lea, max, ina];
}

describe("PUT /api/me/wishlist", () => {
  it("lets a participant write, edit and clear their own wishlist while the group is open", async () => {
    const { token } = await newGroup();
    expect((await meWith(token)).wishlist).toBe("");

    const written = await writeWishlist(token, { wishlist: "Bücher, Socken" });
    expect(written.status).toBe(200);
    expect((await written.json<Me>()).wishlist).toBe("Bücher, Socken");

    await writeWishlist(token, { wishlist: "Nur Socken" });
    expect((await meWith(token)).wishlist).toBe("Nur Socken");

    await writeWishlist(token, { wishlist: "" });
    expect((await meWith(token)).wishlist).toBe("");
  });

  it("lets a participant change their wishlist after the draw", async () => {
    const [, max] = await drawnGroup();

    const response = await writeWishlist(max.token, { wishlist: "Ein Puzzle" });

    expect(response.status).toBe(200);
    expect((await meWith(max.token)).wishlist).toBe("Ein Puzzle");
  });

  it("trims surrounding whitespace and keeps the line breaks inside", async () => {
    const { token } = await newGroup();

    await writeWishlist(token, { wishlist: "  Bücher\nSocken\n\n  " });

    expect((await meWith(token)).wishlist).toBe("Bücher\nSocken");
  });
});

describe("PUT /api/me/wishlist refused", () => {
  it("answers 400 tooLong past the maximum length and keeps the old wishlist", async () => {
    const { token } = await newGroup();
    await writeWishlist(token, { wishlist: "Socken" });

    const atLimit = await writeWishlist(token, { wishlist: "a".repeat(MAX_WISHLIST_LENGTH) });
    expect(atLimit.status).toBe(200);
    await writeWishlist(token, { wishlist: "Socken" });
    const response = await writeWishlist(token, { wishlist: "a".repeat(MAX_WISHLIST_LENGTH + 1) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { wishlist: "tooLong" } });
    expect((await meWith(token)).wishlist).toBe("Socken");
  });

  it("answers 400 invalid when the wishlist is not text", async () => {
    const { token } = await newGroup();

    const response = await writeWishlist(token, { wishlist: 42 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { wishlist: "invalid" } });
  });

  it("answers 401 without a known token", async () => {
    expect((await writeWishlist(null, { wishlist: "x" })).status).toBe(401);
    expect((await writeWishlist("not-a-token", { wishlist: "x" })).status).toBe(401);
  });
});

describe("only the giver sees a wishlist", () => {
  it("shows the giver their recipient's wishlist, with changes on the next load", async () => {
    const everyone = await drawnGroup();
    const [lea] = everyone;
    const recipientId = (await meWith(lea.token)).recipient!.id;
    const recipient = everyone.find((p) => p.me.participant.id === recipientId)!;
    expect((await meWith(lea.token)).recipient!.wishlist).toBe("");

    await writeWishlist(recipient.token, { wishlist: "Schokolade" });
    expect((await meWith(lea.token)).recipient!.wishlist).toBe("Schokolade");

    await writeWishlist(recipient.token, { wishlist: "Tee" });
    expect((await meWith(lea.token)).recipient!.wishlist).toBe("Tee");
  });

  it("keeps a wishlist written before the draw for the giver", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    const ina = await joinAs(lea.me.group.inviteCode, "Ina");
    const everyone = [lea, max, ina];
    for (const p of everyone) await writeWishlist(p.token, { wishlist: `Wunsch von ${p.me.participant.name}` });

    await draw(lea.token, lea.me.group.id);

    for (const { token } of everyone) {
      const me = await meWith(token);
      const recipientName = me.participants.find((p) => p.id === me.recipient!.id)!.name;
      expect(me.recipient!.wishlist).toBe(`Wunsch von ${recipientName}`);
    }
  });

  it("reveals no one else's wishlist, not even to organizers", async () => {
    const everyone = await drawnGroup();
    for (const p of everyone) await writeWishlist(p.token, { wishlist: `geheim-${p.me.participant.name}` });

    for (const { token } of everyone) {
      const me = await meWith(token);
      const recipientName = me.participants.find((p) => p.id === me.recipient!.id)!.name;
      const seen = JSON.stringify(me).match(/geheim-\w+/g)!.sort();
      expect(seen).toEqual([`geheim-${me.participant.name}`, `geheim-${recipientName}`].sort());
    }
  });

  it("shows no wishlist of anyone before the draw", async () => {
    const lea = await newGroup();
    const max = await joinAs(lea.me.group.inviteCode, "Max");
    await writeWishlist(max.token, { wishlist: "geheim-Max" });

    expect(JSON.stringify(await meWith(lea.token))).not.toContain("geheim-Max");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../env";
import { call, createTestEnv } from "../test/d1";
import { onRequestPost as createGroup } from "./groups";
import { onRequestGet as getMe } from "./me";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

const validBody = { name: "WG Weihnachten", budget: "20", exchangeDate: "2099-12-20", organizerName: "Lea" };

function postGroup(body: unknown) {
  return call(
    createGroup,
    new Request("http://app.test/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function getMeWith(token: string) {
  return call(getMe, new Request("http://app.test/api/me", { headers: { authorization: `Bearer ${token}` } }), env);
}

describe("POST /api/groups", () => {
  it("creates an open group whose creator is its organizer, recognised by the returned token", async () => {
    const created = await postGroup(validBody);
    expect(created.status).toBe(201);
    const { token, me } = await created.json<{ token: string; me: unknown }>();

    const expected = {
      group: {
        id: expect.any(String),
        name: "WG Weihnachten",
        budgetCents: 2000,
        exchangeDate: "2099-12-20",
        phase: "open",
        inviteCode: expect.any(String),
      },
      participant: { id: expect.any(String), name: "Lea", isOrganizer: true },
      participants: [{ id: expect.any(String), name: "Lea", isOrganizer: true }],
    };
    expect(me).toEqual(expected);

    const recognised = await getMeWith(token);
    expect(recognised.status).toBe(200);
    expect(await recognised.json()).toEqual(me);
  });
});

describe("POST /api/groups with invalid input", () => {
  it("answers 400 with an error code under each invalid field", async () => {
    const response = await postGroup({ name: "", budget: "", exchangeDate: "2000-01-01", organizerName: "Lea" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: { name: "required", budget: "required", exchangeDate: "past" } });
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await call(
      createGroup,
      new Request("http://app.test/api/groups", { method: "POST", body: "name=WG" }),
      env,
    );

    expect(response.status).toBe(400);
  });
});

describe("GET /api/me", () => {
  it("does not recognise an unknown token", async () => {
    await postGroup(validBody);

    const response = await getMeWith("not-a-real-token");

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("group");
  });

  it("does not recognise a request without a token", async () => {
    const response = await call(getMe, new Request("http://app.test/api/me"), env);

    expect(response.status).toBe(401);
  });

  it("tells creators of different groups apart", async () => {
    const first = await (await postGroup({ ...validBody, organizerName: "Lea" })).json<{ token: string }>();
    const second = await (await postGroup({ ...validBody, name: "Büro", organizerName: "Max" })).json<{ token: string }>();

    const firstMe = await (await getMeWith(first.token)).json<{ group: { id: string; name: string } }>();
    const secondMe = await (await getMeWith(second.token)).json<{ group: { id: string; name: string } }>();

    expect(firstMe.group.name).toBe("WG Weihnachten");
    expect(secondMe.group.name).toBe("Büro");
    expect(firstMe.group.id).not.toBe(secondMe.group.id);
  });
});

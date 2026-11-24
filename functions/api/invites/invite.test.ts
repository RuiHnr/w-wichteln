import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateGroupResponse } from "../../../shared/api";
import type { Env } from "../../env";
import { call, createTestEnv } from "../../test/d1";
import { onRequestPost as createGroup } from "../groups";
import { onRequestGet as getInvite } from "./[code]";

let env: Env;
let dispose: () => Promise<void>;
beforeAll(async () => ({ env, dispose } = await createTestEnv()));
afterAll(() => dispose());

function lookUp(code: string) {
  return call(getInvite, new Request(`http://app.test/api/invites/${code}`), env, { code });
}

describe("GET /api/invites/:code", () => {
  it("shows what someone is about to join, but no participants and no tokens", async () => {
    const body = { name: "WG Weihnachten", budget: "20", exchangeDate: "2099-12-20", organizerName: "Lea" };
    const created = await call(
      createGroup,
      new Request("http://app.test/api/groups", { method: "POST", body: JSON.stringify(body) }),
      env,
    );
    const { me } = await created.json<CreateGroupResponse>();

    const response = await lookUp(me.group.inviteCode);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      group: { id: me.group.id, name: "WG Weihnachten", budgetCents: 2000, exchangeDate: "2099-12-20", phase: "open" },
    });
  });

  it("answers 404 for an unknown invite code", async () => {
    const response = await lookUp("no-such-code");

    expect(response.status).toBe(404);
  });
});

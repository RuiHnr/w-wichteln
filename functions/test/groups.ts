import { expect } from "vitest";
import type { CreateGroupResponse, Me } from "../../shared/api";
import { onRequestPost as createGroup } from "../api/groups";
import { onRequestPost as join } from "../api/invites/[code]/participants";
import { onRequestGet as getMe } from "../api/me";
import type { Env } from "../env";
import { call } from "./d1";

/** A request to the API, with the token as bearer when given. */
export function request(method: string, url: string, token: string | null, body?: unknown): Request {
  return new Request(`http://app.test${url}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Setting up groups through the API, for tests of what happens in them. */
export function groupHelpers(env: () => Env) {
  return {
    /** A new open group "WG Weihnachten" created by Lea. */
    async newGroup(): Promise<CreateGroupResponse> {
      const body = { name: "WG Weihnachten", budget: "20", exchangeDate: "2099-12-20", organizerName: "Lea" };
      const response = await call(createGroup, request("POST", "/api/groups", null, body), env());
      return response.json<CreateGroupResponse>();
    },

    async joinAs(inviteCode: string, name: string): Promise<CreateGroupResponse> {
      const response = await call(join, request("POST", `/api/invites/${inviteCode}/participants`, null, { name }), env(), {
        code: inviteCode,
      });
      expect(response.status).toBe(201);
      return response.json<CreateGroupResponse>();
    },

    async meWith(token: string): Promise<Me> {
      return (await call(getMe, request("GET", "/api/me", token), env())).json<Me>();
    },

    /** Moves the group to Drawn. Stands in for the draw until it exists. */
    draw: (groupId: string) => env().DB.prepare("UPDATE groups SET phase = 'drawn' WHERE id = ?").bind(groupId).run(),
  };
}

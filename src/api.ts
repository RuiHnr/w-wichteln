import type { CreateGroupResponse, Me, ValidationErrorResponse } from "../shared/api";
import type { GroupInputErrors, RawGroupInput } from "../shared/group-input";

export type CreateGroupResult = { ok: true; created: CreateGroupResponse } | { ok: false; errors: GroupInputErrors };

/** Throws when the server cannot be reached or fails; field errors come back as a result. */
export async function createGroup(input: RawGroupInput): Promise<CreateGroupResult> {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.status === 400) {
    const { errors } = (await response.json()) as ValidationErrorResponse;
    return { ok: false, errors };
  }
  if (!response.ok) throw new Error(`POST /api/groups answered ${response.status}`);
  return { ok: true, created: (await response.json()) as CreateGroupResponse };
}

/** The caller's group and participant, or null when the token is not recognised. */
export async function fetchMe(token: string): Promise<Me | null> {
  const response = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me answered ${response.status}`);
  return (await response.json()) as Me;
}

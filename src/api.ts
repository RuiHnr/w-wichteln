import type {
  CreateGroupResponse,
  InviteResponse,
  JoinErrorResponse,
  JoinGroupResponse,
  JoinNameError,
  ManageError,
  Me,
  SettingsErrorResponse,
  ValidationErrorResponse,
} from "../shared/api";
import type { GroupInputErrors, GroupSettingsErrors, RawGroupInput } from "../shared/group-input";

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

/** What an Invite Link leads to, or null when the invite code is unknown. */
export async function fetchInvite(inviteCode: string): Promise<InviteResponse | null> {
  const response = await fetch(`/api/invites/${encodeURIComponent(inviteCode)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/invites answered ${response.status}`);
  return (await response.json()) as InviteResponse;
}

export type JoinGroupResult =
  | { ok: true; joined: JoinGroupResponse }
  | { ok: false; nameError: JoinNameError }
  | { ok: false; closed: true };

/** Throws when the server cannot be reached, fails or the invite code is unknown. */
export async function joinGroup(inviteCode: string, name: string): Promise<JoinGroupResult> {
  const response = await fetch(`/api/invites/${encodeURIComponent(inviteCode)}/participants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (response.status === 400 || response.status === 409) {
    const body = (await response.json()) as Partial<JoinErrorResponse>;
    return body.errors ? { ok: false, nameError: body.errors.name } : { ok: false, closed: true };
  }
  if (!response.ok) throw new Error(`POST /api/invites/participants answered ${response.status}`);
  return { ok: true, joined: (await response.json()) as JoinGroupResponse };
}

/** An organizer action: the caller's fresh view, or why the server refused it. */
export type OrganizerActionResult = { ok: true; me: Me } | { ok: false; error: ManageError };

/** Sends an organizer action. Throws when the server cannot be reached or fails in a way the API does not describe. */
async function sendManage(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readManage(response: Response, label: string): Promise<OrganizerActionResult> {
  if ([401, 403, 404, 409].includes(response.status)) {
    const { error } = (await response.json()) as { error: ManageError };
    return { ok: false, error };
  }
  if (!response.ok) throw new Error(`${label} answered ${response.status}`);
  return { ok: true, me: (await response.json()) as Me };
}

const participantPath = (groupId: string, participantId: string) =>
  `/api/groups/${encodeURIComponent(groupId)}/participants/${encodeURIComponent(participantId)}`;

export type UpdateSettingsResult = OrganizerActionResult | { ok: false; errors: GroupSettingsErrors };

/** Changes budget and exchange date; field errors come back as a result. */
export async function updateSettings(
  token: string,
  groupId: string,
  input: { budget: string; exchangeDate: string },
): Promise<UpdateSettingsResult> {
  const response = await sendManage(token, "PATCH", `/api/groups/${encodeURIComponent(groupId)}`, input);
  if (response.status === 400) {
    const { errors } = (await response.json()) as SettingsErrorResponse;
    return { ok: false, errors };
  }
  return readManage(response, "PATCH /api/groups");
}

export async function setOrganizer(token: string, groupId: string, participantId: string, isOrganizer: boolean): Promise<OrganizerActionResult> {
  const response = await sendManage(token, "PATCH", participantPath(groupId, participantId), { isOrganizer });
  return readManage(response, "PATCH /api/groups/participants");
}

export async function removeParticipant(token: string, groupId: string, participantId: string): Promise<OrganizerActionResult> {
  const response = await sendManage(token, "DELETE", participantPath(groupId, participantId));
  return readManage(response, "DELETE /api/groups/participants");
}

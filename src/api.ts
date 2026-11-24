import type {
  CreateGroupResponse,
  ExclusionErrorResponse,
  ExclusionInputError,
  InviteResponse,
  JoinErrorResponse,
  JoinGroupResponse,
  JoinNameError,
  ManageError,
  Me,
  RenewLinkResponse,
  SettingsErrorResponse,
  SwapLimitErrorResponse,
  SwapError,
  ValidationErrorResponse,
  WishlistErrorResponse,
} from "../shared/api";
import type { GroupInputErrors, GroupSettingsErrors, RawGroupInput } from "../shared/group-input";
import type { WishlistError } from "../shared/wishlist";

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

/**
 * Whether the group still exists: false once it was deleted (or never existed), null when
 * the server cannot say. Never throws, since it only refines an error page.
 */
export async function groupStillExists(groupId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}`);
    if (response.ok) return true;
    return response.status === 404 ? false : null;
  } catch {
    return null;
  }
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

/** Sends an action with the caller's token. Throws when the server cannot be reached or fails in a way the API does not describe. */
async function sendWithToken(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** An action answered with the caller's fresh view, or with `{ error }` saying why it was refused. */
async function readAction<E extends string>(response: Response, label: string): Promise<{ ok: true; me: Me } | { ok: false; error: E }> {
  if ([401, 403, 404, 409].includes(response.status)) {
    const { error } = (await response.json()) as { error: E };
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
  const response = await sendWithToken(token, "PATCH", `/api/groups/${encodeURIComponent(groupId)}`, input);
  if (response.status === 400) {
    const { errors } = (await response.json()) as SettingsErrorResponse;
    return { ok: false, errors };
  }
  return readAction<ManageError>(response, "PATCH /api/groups");
}

export type UpdateSwapLimitResult = OrganizerActionResult | { ok: false; errors: SwapLimitErrorResponse["errors"] };

/** Sets the Swap Limit, 0 to 5. */
export async function updateSwapLimit(token: string, groupId: string, swapLimit: number): Promise<UpdateSwapLimitResult> {
  const response = await sendWithToken(token, "PUT", `/api/groups/${encodeURIComponent(groupId)}/swap-limit`, { swapLimit });
  if (response.status === 400) return { ok: false, errors: ((await response.json()) as SwapLimitErrorResponse).errors };
  return readAction<ManageError>(response, "PUT /api/groups/swap-limit");
}

export async function setOrganizer(token: string, groupId: string, participantId: string, isOrganizer: boolean): Promise<OrganizerActionResult> {
  const response = await sendWithToken(token, "PATCH", participantPath(groupId, participantId), { isOrganizer });
  return readAction<ManageError>(response, "PATCH /api/groups/participants");
}

export async function removeParticipant(token: string, groupId: string, participantId: string): Promise<OrganizerActionResult> {
  const response = await sendWithToken(token, "DELETE", participantPath(groupId, participantId));
  return readAction<ManageError>(response, "DELETE /api/groups/participants");
}

export type RenewLinkResult = { ok: true; renewed: RenewLinkResponse } | { ok: false; error: ManageError };

/** Link Renewal: a new Personal Link for the participant; their old one stops working. */
export async function renewLink(token: string, groupId: string, participantId: string): Promise<RenewLinkResult> {
  const response = await sendWithToken(token, "POST", `${participantPath(groupId, participantId)}/link`);
  if ([401, 403, 404, 409].includes(response.status)) {
    const { error } = (await response.json()) as { error: ManageError };
    return { ok: false, error };
  }
  if (!response.ok) throw new Error(`POST /api/groups/participants/link answered ${response.status}`);
  return { ok: true, renewed: (await response.json()) as RenewLinkResponse };
}

const exclusionsPath = (groupId: string) => `/api/groups/${encodeURIComponent(groupId)}/exclusions`;

export type AddExclusionResult = OrganizerActionResult | { ok: false; errors: { participantIds: ExclusionInputError } };

/** Adds an exclusion between two participants; one that exists already changes nothing. */
export async function addExclusion(token: string, groupId: string, participantIds: [string, string]): Promise<AddExclusionResult> {
  const response = await sendWithToken(token, "POST", exclusionsPath(groupId), { participantIds });
  if (response.status === 400) {
    const { errors } = (await response.json()) as ExclusionErrorResponse;
    return { ok: false, errors };
  }
  return readAction<ManageError>(response, "POST /api/groups/exclusions");
}

export async function removeExclusion(token: string, groupId: string, exclusionId: string): Promise<OrganizerActionResult> {
  const response = await sendWithToken(token, "DELETE", `${exclusionsPath(groupId)}/${encodeURIComponent(exclusionId)}`);
  return readAction<ManageError>(response, "DELETE /api/groups/exclusions");
}

/** Draws the group; refused with too_few or impossible, the group stays open. */
export async function drawGroup(token: string, groupId: string): Promise<OrganizerActionResult> {
  const response = await sendWithToken(token, "POST", `/api/groups/${encodeURIComponent(groupId)}/draw`);
  return readAction<ManageError>(response, "POST /api/groups/draw");
}

/** Resets the drawn group: all assignments are gone and it is open again; refused with not_drawn while open. */
export async function resetGroup(token: string, groupId: string): Promise<OrganizerActionResult> {
  const response = await sendWithToken(token, "DELETE", `/api/groups/${encodeURIComponent(groupId)}/draw`);
  return readAction<ManageError>(response, "DELETE /api/groups/draw");
}

export type SaveWishlistResult =
  | { ok: true; me: Me }
  | { ok: false; errors: { wishlist: WishlistError } }
  | { ok: false; error: "unknown_token" };

/** Replaces the caller's own wishlist; empty text clears it. Throws when the server cannot be reached or fails. */
export async function saveWishlist(token: string, wishlist: string): Promise<SaveWishlistResult> {
  const response = await fetch("/api/me/wishlist", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ wishlist }),
  });
  if (response.status === 401) return { ok: false, error: "unknown_token" };
  if (response.status === 400) {
    const { errors } = (await response.json()) as WishlistErrorResponse;
    return { ok: false, errors };
  }
  if (!response.ok) throw new Error(`PUT /api/me/wishlist answered ${response.status}`);
  return { ok: true, me: (await response.json()) as Me };
}

/** A Swap Request action: the caller's fresh view, or why the server refused it. */
export type SwapActionResult = { ok: true; me: Me } | { ok: false; error: SwapError };

const swapRequestsPath = "/api/me/swap-requests";
const swapRequestPath = (requestId: string) => `${swapRequestsPath}/${encodeURIComponent(requestId)}`;

/** Asks another giver for a swap; refused with blocked, outgoing_open, a limit and so on. */
export async function sendSwapRequest(token: string, receiverId: string): Promise<SwapActionResult> {
  return readAction<SwapError>(await sendWithToken(token, "POST", swapRequestsPath, { receiverId }), "POST /api/me/swap-requests");
}

/** The sender takes back their open request. */
export async function withdrawSwapRequest(token: string, requestId: string): Promise<SwapActionResult> {
  return readAction<SwapError>(await sendWithToken(token, "DELETE", swapRequestPath(requestId)), "DELETE /api/me/swap-requests");
}

/** The receiver accepts: the Swap. The fresh view shows their new recipient. */
export async function acceptSwapRequest(token: string, requestId: string): Promise<SwapActionResult> {
  return readAction<SwapError>(await sendWithToken(token, "POST", `${swapRequestPath(requestId)}/accept`), "POST /api/me/swap-requests/accept");
}

/** The receiver declines; nothing is swapped. */
export async function declineSwapRequest(token: string, requestId: string): Promise<SwapActionResult> {
  return readAction<SwapError>(await sendWithToken(token, "POST", `${swapRequestPath(requestId)}/decline`), "POST /api/me/swap-requests/decline");
}

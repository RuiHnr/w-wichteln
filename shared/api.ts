/** Shapes the API sends to the browser. */

import type { GroupInputErrors, GroupSettingsErrors, ParticipantNameError } from "./group-input";

export type GroupPhase = "open" | "drawn";

export interface GroupView {
  id: string;
  name: string;
  budgetCents: number;
  /** YYYY-MM-DD */
  exchangeDate: string;
  phase: GroupPhase;
  inviteCode: string;
}

export interface ParticipantView {
  id: string;
  name: string;
  isOrganizer: boolean;
}

/** 200 from GET /api/invites/:code: what someone is about to join. No participants, no invite code. */
export interface InviteResponse {
  group: Omit<GroupView, "inviteCode">;
}

/** An exclusion between two participants of the group; it works in both directions, so the order means nothing. */
export interface ExclusionView {
  id: string;
  participantIds: [string, string];
}

/** The caller as the API knows them: their group, themselves and everyone in the group. */
export interface Me {
  group: GroupView;
  participant: ParticipantView;
  /** Everyone in the caller's group, in the order they joined. */
  participants: ParticipantView[];
  /** The group's exclusions, in the order they were added. Only organizers get this field. */
  exclusions?: ExclusionView[];
  /** Whom the caller gives a present to, once the group is drawn. Only ever the caller's own (ADR 0003). */
  recipient?: RecipientView;
}

/** The recipient of the caller's assignment. */
export type RecipientView = Pick<ParticipantView, "id" | "name">;

/** 201 from POST /api/groups. */
export interface CreateGroupResponse {
  token: string;
  me: Me;
}

/** 400 from POST /api/groups: one error code per invalid field. */
export interface ValidationErrorResponse {
  errors: GroupInputErrors;
}

/** 201 from POST /api/invites/:code/participants: same shape as creating a group. */
export type JoinGroupResponse = CreateGroupResponse;

/** Why a name cannot be used to join: invalid (400) or already in the group (409). */
export type JoinNameError = ParticipantNameError | "taken";

/** 400 or 409 from POST /api/invites/:code/participants when the name cannot be used. */
export interface JoinErrorResponse {
  errors: { name: JoinNameError };
}

/** Why an organizer action was refused, in `{ error }` of a 401, 403, 404 or 409. */
export type ManageError =
  | "unknown_token"
  | "not_organizer"
  | "unknown_participant"
  | "unknown_exclusion"
  | "drawn"
  | "last_organizer"
  | "self"
  | "too_few"
  | "impossible"
  | "changed";

/** 400 from PATCH /api/groups/:groupId: one error code per invalid field. */
export interface SettingsErrorResponse {
  errors: GroupSettingsErrors;
}

/** 400 from PATCH /api/groups/:groupId/participants/:participantId when `isOrganizer` is not a boolean. */
export interface OrganizerErrorResponse {
  errors: { isOrganizer: "invalid" };
}

/** Why the body of POST /api/groups/:groupId/exclusions was refused: not two participant ids, or the same one twice. */
export type ExclusionInputError = "invalid" | "same";

/** 400 from POST /api/groups/:groupId/exclusions. */
export interface ExclusionErrorResponse {
  errors: { participantIds: ExclusionInputError };
}

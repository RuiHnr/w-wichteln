/** Shapes the API sends to the browser. */

import type { GroupInputErrors, GroupSettingsErrors, ParticipantNameError } from "./group-input";
import type { WishlistError } from "./wishlist";

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
  /** The caller's own wishlist; empty when they have not written one. */
  wishlist: string;
  /** Everyone in the caller's group, in the order they joined. */
  participants: ParticipantView[];
  /** The group's exclusions, in the order they were added. Only organizers get this field. */
  exclusions?: ExclusionView[];
  /** Whom the caller gives a present to, once the group is drawn. Only ever the caller's own (ADR 0003). */
  recipient?: RecipientView;
  /** The caller's swaps and Swap Requests, once the group is drawn. Names only, never anyone's recipient (ADR 0003). */
  swaps?: SwapsView;
}

/** Someone a Swap Request is with: who they are, nothing about whom they give to. */
export type SwapPartnerView = Pick<ParticipantView, "id" | "name">;

/** The caller's side of swapping. */
export interface SwapsView {
  /** The group's Swap Limit: how many completed swaps each participant may take part in. */
  limit: number;
  /** How many swaps the caller took part in, sent or accepted. */
  completed: number;
  /** The caller's open request to another giver, if any; there is at most one. */
  outgoing?: { id: string; receiver: SwapPartnerView };
  /** Open requests other givers sent the caller, oldest first. */
  incoming: { id: string; sender: SwapPartnerView }[];
}

/** The recipient of the caller's assignment, with their wishlist: the only other wishlist anyone sees. */
export interface RecipientView extends Pick<ParticipantView, "id" | "name"> {
  /** Empty when the recipient has not written one. */
  wishlist: string;
}

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
  | "not_drawn"
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

/** 400 from PUT /api/me/wishlist. */
export interface WishlistErrorResponse {
  errors: { wishlist: WishlistError };
}

/** Why a Swap Request action was refused, in `{ error }` of a 401, 404 or 409. */
export type SwapError =
  | "unknown_token"
  | "not_drawn"
  | "unknown_participant"
  | "unknown_swap_request"
  | "self"
  | "outgoing_open"
  | "limit_reached"
  | "partner_limit_reached"
  | "blocked"
  | "changed";

/** Shapes the API sends to the browser. */

import type { GroupInputErrors } from "./group-input";

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

/** The caller as the API knows them: their group and themselves. */
export interface Me {
  group: GroupView;
  participant: ParticipantView;
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

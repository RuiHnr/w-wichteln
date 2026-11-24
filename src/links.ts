/** Where the app's pages live. */

export const groupPath = (groupId: string) => `/g/${encodeURIComponent(groupId)}`;

export const inviteLink = (inviteCode: string) => `${location.origin}/join/${encodeURIComponent(inviteCode)}`;

export const personalLink = (token: string) => `${location.origin}/p/${encodeURIComponent(token)}`;

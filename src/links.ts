/** Where the app's pages live. Joining and restoring are handled from #3 on. */

export const groupPath = (groupId: string) => `/g/${encodeURIComponent(groupId)}`;

export const inviteLink = (inviteCode: string) => `${location.origin}/join/${encodeURIComponent(inviteCode)}`;

export const personalLink = (token: string) => `${location.origin}/p/${encodeURIComponent(token)}`;

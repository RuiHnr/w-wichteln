/**
 * Group Pictures and Participant Pictures live in D1, in the `pictures` table (ADR 0005), under
 * a random, unguessable key. Each belongs to a group and goes with it. The database holds the
 * current key per group and participant. A picture is served by that key alone, not behind the
 * token (see functions/api/pictures).
 */

/** The path the browser fetches a picture from. */
export const pictureUrl = (groupId: string, key: string) => `/api/pictures/${groupId}/${key}`;

/** What picture keys look like: 128 random bits in hex. */
export const PICTURE_KEY = /^[0-9a-f]{32}$/;

export const newPictureKey = () => crypto.randomUUID().replaceAll("-", "");

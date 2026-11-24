/**
 * Group Pictures and Participant Pictures live in R2 under `<groupId>/<random key>`, so
 * everything of a group can be found by its prefix. The key is random and unguessable; the
 * database holds the current one per group and participant. A picture is served by that key
 * alone, not behind the token (see functions/api/pictures).
 */

/** The path the browser fetches a picture from. */
export const pictureUrl = (groupId: string, key: string) => `/api/pictures/${groupId}/${key}`;

/** What picture keys look like: 128 random bits in hex. */
export const PICTURE_KEY = /^[0-9a-f]{32}$/;

export const newPictureKey = () => crypto.randomUUID().replaceAll("-", "");

/** Deletes images, best effort: a failing delete never fails the request, it only leaves an unreferenced, unguessable orphan (logged). */
export async function deletePictureObjects(bucket: R2Bucket | undefined, groupId: string, keys: (string | null)[]): Promise<void> {
  const names = keys.filter((key): key is string => key !== null).map((key) => `${groupId}/${key}`);
  if (!bucket || names.length === 0) return;
  try {
    await bucket.delete(names);
  } catch (error) {
    console.error("deleting pictures failed", error);
  }
}

/** Deletes everything stored for the groups, by prefix. Used when groups are deleted, best effort like the above. */
export async function deleteGroupPictures(bucket: R2Bucket | undefined, groupIds: string[]): Promise<void> {
  if (!bucket) return;
  await Promise.all(
    groupIds.map(async (groupId) => {
      try {
        let cursor: string | undefined;
        do {
          const listed = await bucket.list({ prefix: `${groupId}/`, cursor });
          if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
      } catch (error) {
        console.error("deleting the pictures of a group failed", error);
      }
    }),
  );
}

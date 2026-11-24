import type { Env } from "./env";
import { deleteExpiredGroups } from "./lib/cleanup";

/**
 * The lazy cleanup of expired groups: after the response is built, `waitUntil` removes a
 * few expired groups, so the visitor never waits for it and a failing cleanup never fails
 * a request. `now` is injectable for tests.
 */
export function cleanupMiddleware(now: () => number = Date.now): PagesFunction<Env> {
  return async ({ env, next, waitUntil }) => {
    const response = await next();
    waitUntil(deleteExpiredGroups(env.DB, now()).catch((error) => console.error("cleanup of expired groups failed", error)));
    return response;
  };
}

export const onRequest = cleanupMiddleware();

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../env";

const migrationsDir = join(import.meta.dirname, "../../migrations");

/** A fresh in-memory D1 with every migration applied, as `wrangler dev` would have it. */
export async function createTestEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  const db = proxy.env.DB;
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    if (statements.length > 0) await db.batch(statements.map((statement) => db.prepare(statement)));
  }
  return { env: proxy.env, dispose: proxy.dispose };
}

/** Runs a Pages Function the way the Pages runtime would, with only what our handlers use. */
export function call<E>(
  handler: PagesFunction<E, string>,
  request: Request,
  env: E,
  params: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(handler({ request, env, params } as Parameters<PagesFunction<E, string>>[0]));
}

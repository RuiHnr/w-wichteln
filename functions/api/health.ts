import type { Env } from "../env";

export const onRequestGet: PagesFunction<Env> = async () => Response.json({ status: "ok" });

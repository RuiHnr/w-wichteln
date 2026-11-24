import type { CreateGroupResponse, ValidationErrorResponse } from "../../shared/api";
import { validateGroupInput } from "../../shared/group-input";
import type { Env } from "../env";
import { createGroup } from "../lib/groups";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body: unknown = await request.json().catch(() => null);
  // The form checks against the visitor's local date. A visitor west of UTC can be a day
  // behind the server, so the server accepts dates from yesterday (UTC) on.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = validateGroupInput(body, yesterday);
  if (!result.ok) return Response.json({ errors: result.errors } satisfies ValidationErrorResponse, { status: 400 });

  const created: CreateGroupResponse = await createGroup(env.DB, result.value);
  return Response.json(created, { status: 201 });
};

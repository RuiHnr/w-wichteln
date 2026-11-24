import type { CreateGroupResponse, ValidationErrorResponse } from "../../shared/api";
import { validateGroupInput } from "../../shared/group-input";
import type { Env } from "../env";
import { earliestExchangeDate } from "../lib/dates";
import { createGroup } from "../lib/groups";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body: unknown = await request.json().catch(() => null);
  const result = validateGroupInput(body, earliestExchangeDate());
  if (!result.ok) return Response.json({ errors: result.errors } satisfies ValidationErrorResponse, { status: 400 });

  const created: CreateGroupResponse = await createGroup(env.DB, result.value);
  return Response.json(created, { status: 201 });
};

/**
 * Shared guard for adaptive API routes — feature flag + prep ownership.
 */

import "server-only";
import { NextResponse } from "next/server";
import {
  ADAPTIVE_LEARNING_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { errorResponse, withUser, type ApiContext } from "@/lib/api/guards";

export async function withAdaptiveUser(
  request: Request,
  scope: string,
): Promise<
  | { ok: true; ctx: ApiContext }
  | { ok: false; response: NextResponse }
> {
  const guard = await withUser(request, { scope, limit: 60 });
  if (!guard.ok) return guard;
  const enabled = await isFeatureEnabled(
    guard.ctx.service,
    ADAPTIVE_LEARNING_FLAG,
    guard.ctx.userId,
  );
  if (!enabled) {
    return { ok: false, response: errorResponse(404, "not_found") };
  }
  return { ok: true, ctx: guard.ctx };
}

export async function assertPrepOwner(
  ctx: ApiContext,
  examPrepId: string,
): Promise<boolean> {
  const { data } = await ctx.service
    .from("exam_preps")
    .select("id")
    .eq("id", examPrepId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return Boolean(data);
}

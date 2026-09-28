import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { buildBadgeJourney } from "@/lib/gamification/badges";
import { loadBadgeFacts } from "@/lib/gamification/load-badge-facts";

/** Seri ve rozet yolculuğu — üst çubuktaki seri düğmesinin açtığı pencere. */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "badges", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const facts = await loadBadgeFacts(service, userId);
  return NextResponse.json(buildBadgeJourney(facts));
}

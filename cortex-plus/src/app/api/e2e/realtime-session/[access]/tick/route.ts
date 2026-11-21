import { NextResponse } from "next/server";
import { FIXTURE_SERVICE, FIXTURE_USER_ID, fixtureDeps, fixtureNotFound, parseFixtureAccess, realtimeFixtureEnabled } from "@/lib/tutor/realtime/fixture";
import { tickBodySchema, tickRealtimeSession } from "@/lib/tutor/realtime/session";

export const maxDuration = 120;

/** Yalnız yerel deneme fikstürü (E2E_FIXTURE=1, üretim dışı). */
export async function POST(request: Request, context: { params: Promise<{ access: string }> }) {
  if (!realtimeFixtureEnabled()) return fixtureNotFound();
  const fixture = parseFixtureAccess((await context.params).access);
  if (!fixture) return fixtureNotFound();
  const parsed = tickBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const outcome = await tickRealtimeSession(FIXTURE_SERVICE, fixtureDeps(fixture.access, fixture.voice), { userId: FIXTURE_USER_ID, body: parsed.data });
  return NextResponse.json(outcome.body, { status: outcome.status });
}

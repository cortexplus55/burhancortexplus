import { NextResponse } from "next/server";
import {
  FIXTURE_SERVICE,
  FIXTURE_USER_ID,
  fixtureDeps,
  fixtureLog,
  fixtureNotFound,
  parseFixtureAccess,
  realtimeFixtureEnabled,
} from "@/lib/tutor/realtime/fixture";
import { endBodySchema, endRealtimeSession } from "@/lib/tutor/realtime/session";

/** Yalnız yerel deneme fikstürü (E2E_FIXTURE=1, üretim dışı). */
export async function POST(request: Request, context: { params: Promise<{ access: string }> }) {
  if (!realtimeFixtureEnabled()) return fixtureNotFound();
  const fixture = parseFixtureAccess((await context.params).access);
  if (!fixture) return fixtureNotFound();
  const parsed = endBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const outcome = await endRealtimeSession(FIXTURE_SERVICE, fixtureDeps(fixture.access, fixture.voice), { userId: FIXTURE_USER_ID, body: parsed.data });
  return NextResponse.json(outcome.body, { status: outcome.status });
}

/** Deneme ölçümü: kaydedilen kullanım ve tahmini $ (yalnız fikstür). */
export async function GET() {
  if (!realtimeFixtureEnabled()) return fixtureNotFound();
  return NextResponse.json({ log: fixtureLog() });
}

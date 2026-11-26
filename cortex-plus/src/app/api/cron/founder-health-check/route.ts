import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/notifications/cron-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { runFounderHealthCheck } from "@/lib/founder-cockpit/health-run";

/**
 * Kurucu sağlık kontrolü (Faz 13, 26 Kasım 2026). Vercel zamanlayıcısı 15 dakikada bir çağırır (ürün sahibinin kararı,
 * Pro planda). Dış bir izleme servisi de aynı ucu `Authorization: Bearer $CRON_SECRET` başlığıyla (GET ya da POST)
 * çağırabilir; alarmlar aynı kilitle tekrar etmez. Anahtar yoksa ya da yanlışsa 401.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await runFounderHealthCheck(createServiceClient());
  return NextResponse.json(
    {
      ok: true,
      overall: report.overall,
      checkedAt: report.checkedAt,
      services: report.services.map((item) => ({
        id: item.id,
        level: item.level,
      })),
      alerts: report.alerts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;

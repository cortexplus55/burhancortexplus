import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/notifications/cron-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { runFounderTaxReminders } from "@/lib/founder-cockpit/tax-run";

/**
 * Vergi hatırlatmaları (Faz 13): elle ya da dış izleme servisinden çalıştırmak için. Zamanlanmış çalışma ayrı cron değil,
 * her gün 06:00 UTC (09:00 Türkiye) günlük turun (`subscription-renewal`) içinde. 5 gün ve 1 gün kala, tahmini TL
 * tutarıyla alarm adresine e-posta (her son gün ve eşik bir kez; ikinci çağrı kilit yüzünden tekrar göndermez); 30 günden
 * eski sağlık kayıtları temizlenir. `CRON_SECRET` zorunlu.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await runFounderTaxReminders(createServiceClient());
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "Cache-Control": "no-store" } },
  );
}

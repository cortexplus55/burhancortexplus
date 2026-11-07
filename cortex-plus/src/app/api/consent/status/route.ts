import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { consentStatusFrom } from "@/lib/legal/consent-evidence";
import { loadConsentRows } from "@/lib/legal/record-consent";
import { REQUIRED_CONSENT_KEY } from "@/lib/legal/versions";

export const dynamic = "force-dynamic";

/**
 * Öğrencinin bugünkü metinlere onayı tam mı (7 Kasım 2026, uyum paketi). Onay kapısı girişten sonra bir kez sorar;
 * aynı sürümü onaylamış öğrenciye bir daha bir şey göstermez. Okunamazsa `ok: false`: kapı açılmaz, öğrenci bir
 * veritabanı hatası yüzünden kilitlenmez.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "consent-status", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const rows = await loadConsentRows(service, userId);
  if (!rows) return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { ok: true, key: REQUIRED_CONSENT_KEY, ...consentStatusFrom(rows) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

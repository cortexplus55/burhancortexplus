import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit, withUser } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hashConsentIp } from "@/lib/legal/record-consent";
import { COOKIE_POLICY_VERSION } from "@/lib/legal/versions";
import { COOKIE_CONSENT_MAX_AGE_DAYS } from "@/lib/consent/cookie-consent";
import { missingRelation } from "@/lib/learning/missing-column";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  consentId: z.string().uuid(),
  analytics: z.boolean(),
  action: z.enum(["accept_all", "reject_all", "custom"]),
  policyVersion: z.string().max(20),
});

/**
 * Çerez tercihinin kaydı (7 Kasım 2026, uyum paketi): kim (giriş yaptıysa hesap, yoksa yalnız tarayıcının tercih
 * kimliği), hangi politika sürümüne, ne zaman, ne seçti. IP ham tutulmaz. Kayıt düşerse tercih yine tarayıcıda
 * geçerlidir; bu uç yalnız kanıt ve cihazlar arası hatırlama içindir.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, { scope: "cookie-consent", limit: 30 });
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.policyVersion !== COOKIE_POLICY_VERSION) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const { data } = await (await createClient()).auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  // Sunucu anahtarı yoksa (yerel/CI) kayıt atlanır; tercih tarayıcıda zaten geçerli.
  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false });
  }
  const { error } = await service
    .from("cookie_consent_events")
    .insert({
      consent_id: parsed.data.consentId,
      user_id: userId,
      policy_version: parsed.data.policyVersion,
      analytics: parsed.data.analytics,
      action: parsed.data.action,
      ip_hash: hashConsentIp(ip, parsed.data.consentId),
    });
  if (error) {
    if (!missingRelation(error)) console.error("cookie_consent_record_failed", { error: error.message });
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}

/** Giriş yapmış öğrencinin bu politika sürümündeki son tercihi (12 ay içinde); yoksa `choice: null`. */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "cookie-consent-read", limit: 30 });
  if (!guard.ok) return guard.response;
  const since = new Date(Date.now() - COOKIE_CONSENT_MAX_AGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await guard.ctx.service
    .from("cookie_consent_events")
    .select("consent_id, analytics, created_at")
    .eq("user_id", guard.ctx.userId)
    .eq("policy_version", COOKIE_POLICY_VERSION)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ choice: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    {
      choice: {
        consentId: data.consent_id as string,
        analytics: Boolean(data.analytics),
        at: Date.parse(String(data.created_at)),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

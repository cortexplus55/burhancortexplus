import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { createPaytrCheckout, requestUserIp } from "@/lib/payments/checkout";
import { verifyParentPayToken } from "@/lib/payments/parent-link";

const bodySchema = z.object({
  token: z.string().min(20).max(600),
  email: z.string().email().max(120),
  name: z.string().max(60).optional(),
  /** Mesafeli Sözleşmeler Yönetmeliği m.5: ödemeyi yapan veli onayı burada verir; sunucu zorunlu tutar. */
  legalAccepted: z.literal(true),
});

/**
 * Hesapsız veli ödemesi (29 Ekim 2026). Bağlantıdaki imza doğrulanır; ödeme satırı öğrencinin
 * adına açılır (`user_id` = öğrenci), geri çağrı planı öğrencinin hesabına yazar. Velinin e-postası
 * yalnız PayTR makbuzu için gider; bizde saklanmaz.
 */
export async function POST(request: Request) {
  const limited = await guestLimit(request, { scope: "parent-pay-checkout", limit: 6 });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const noConsent = parsed.error.issues.some((issue) => issue.path.includes("legalAccepted"));
    return errorResponse(400, noConsent ? "legal_consent_required" : "invalid_input");
  }
  const verified = verifyParentPayToken(parsed.data.token);
  if (!verified.ok) return errorResponse(verified.reason === "expired" ? 410 : 404, verified.reason === "expired" ? "link_expired" : "not_found");
  if (!isPaytrConfigured()) return NextResponse.json({ error: "Ödeme altyapısı henüz yapılandırılmadı." }, { status: 503 });

  const service = createServiceClient();
  const [{ data: plan }, { data: student }] = await Promise.all([
    service.from("plans").select("id, name, price_try").eq("id", verified.claims.planId).eq("active", true).maybeSingle(),
    service.from("profiles").select("id, full_name").eq("id", verified.claims.studentId).maybeSingle(),
  ]);
  if (!plan || !student) return errorResponse(404, "not_found");

  const origin = new URL(request.url).origin;
  const studentFirst = String(student.full_name ?? "").trim().split(/\s+/)[0] || "ogrenci";
  const parentName = parsed.data.name?.trim() || "Veli";
  const checkout = await createPaytrCheckout(service, {
    userId: verified.claims.studentId,
    beneficiaryId: verified.claims.studentId,
    plan: { id: plan.id as string, name: plan.name as string, price_try: plan.price_try as number },
    email: parsed.data.email,
    userIp: requestUserIp(request),
    userName: `${parentName} (veli)`,
    // PayTR sepet adi ASCII: Turkce karakter kaldirmiyor.
    productName: `${plan.name} (veli odemesi)`,
    okUrl: `${origin}/odeme/veli/tesekkurler`,
    failUrl: `${origin}/odeme/veli/basarisiz?token=${encodeURIComponent(parsed.data.token)}`,
    actorId: verified.claims.studentId,
    via: "parent_link",
  });
  if (!checkout.ok) {
    return checkout.status === 500 ? errorResponse(500, checkout.error) : NextResponse.json({ error: checkout.error }, { status: 502 });
  }
  return NextResponse.json({ merchantOid: checkout.merchantOid, iframeUrl: checkout.iframeUrl, studentName: studentFirst });
}

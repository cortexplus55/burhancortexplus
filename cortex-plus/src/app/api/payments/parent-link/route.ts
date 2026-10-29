import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { formatTryWhole } from "@/lib/format";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import {
  createParentPayToken,
  PARENT_LINK_TTL_MS,
  parentShareText,
  whatsappShareUrl,
} from "@/lib/payments/parent-link";

const bodySchema = z.object({ planId: z.string().uuid() });

/**
 * Velime ödeme linki (29 Ekim 2026): öğrenci seçtiği plan için imzalı, 3 gün geçerli bağlantı alır.
 * Bağlantı velinin hesapsız ödeme sayfasını açar (`/odeme/veli/[token]`). Kayıt: `parent_payment_requests`
 * (öğrenci, plan, "link"); ödeme geldiğinde geri çağrı planı öğrencinin hesabına yazar.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "parent-pay-link", limit: 5, dailyLimit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!isPaytrConfigured()) return NextResponse.json({ error: "Ödeme altyapısı henüz yapılandırılmadı." }, { status: 503 });

  const [{ data: plan }, { data: profile }] = await Promise.all([
    service.from("plans").select("id, name, price_try").eq("id", parsed.data.planId).eq("active", true).maybeSingle(),
    service.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (!plan) return errorResponse(404, "not_found");

  const token = createParentPayToken({ studentId: userId, planId: plan.id });
  if (!token) return NextResponse.json({ error: "Bağlantı imzası için anahtar tanımlı değil." }, { status: 503 });

  const origin = new URL(request.url).origin;
  const url = `${origin}/odeme/veli/${token}`;
  const studentName = String(profile?.full_name ?? "").trim().split(/\s+/)[0] || "öğrenci";
  const text = parentShareText({ studentName, planName: plan.name as string, priceLabel: formatTryWhole(plan.price_try as number), url });

  await service
    .from("parent_payment_requests")
    .insert({ student_id: userId, plan_id: plan.id, status: "pending", message: "link" })
    .then(undefined, () => undefined);

  return NextResponse.json({
    url,
    expiresAt: new Date(Date.now() + PARENT_LINK_TTL_MS).toISOString(),
    shareText: text,
    whatsappUrl: whatsappShareUrl(text),
  });
}

import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import {
  RECENT_PAYMENT_WINDOW_MS,
  recentPaymentStatus,
  type ActivationStatus,
} from "@/lib/payments/activation";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Ödeme dönüşü ekranının yokladığı durum (31 Ekim 2026): Plus açık mı ve son iki saatin ödemesi
 * ödendi mi. Yalnız okur; model çağrısı yok, kredi sayısı yok. `/odeme/basarili` 20 sn boyunca
 * 1,5 sn'de bir sorar (tur başına ~14 istek); "Tekrar kontrol et" yeni tur açar. Dakikada 60 bunu
 * rahat taşır, elle döngüye sokulan sekme de sınıra takılır.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "payment-status", limit: 60, dailyLimit: 600 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const now = Date.now();
  try {
    const [entitlements, { data: rows, error }] = await Promise.all([
      getUserEntitlements(service, userId),
      service
        .from("payments")
        .select("status, created_at")
        .eq("user_id", userId)
        .gte("created_at", new Date(now - RECENT_PAYMENT_WINDOW_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    // Okuma düştüyse "ödeme yok" demeyiz: o cevap Plus'ı olan öğrenciyi yanlışlıkla "hazır" sayardı.
    if (error) {
      return NextResponse.json({ error: "Durum şu an okunamadı." }, { status: 503, headers: NO_STORE });
    }

    const body: ActivationStatus = {
      plus: entitlements.isPremium,
      plan: entitlements.planName,
      badge: entitlements.badge,
      payment: recentPaymentStatus(rows as { status?: string | null; created_at?: string | null }[] | null, now),
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch {
    // Ekran bu cevapta sessizce yeniden sorar; öğrenciye hata gösterilmez.
    return NextResponse.json({ error: "Durum şu an okunamadı." }, { status: 503, headers: NO_STORE });
  }
}

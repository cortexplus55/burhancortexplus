import { NextResponse } from "next/server";
import { guestLimit } from "@/lib/api/guards";

/**
 * CSP ihlal raporlarını toplar.
 *
 * Rapor kipinde tarayıcı, politikayı ihlal edecek bir şey görünce buraya POST
 * atıyor. Olmadığında ihlaller yalnızca ziyaretçinin kendi konsolunda kalır ve
 * bizim hiç haberimiz olmaz — yani rapor kipinin bir anlamı kalmaz.
 *
 * Giriş istemiyor, çünkü tarayıcı bu isteği oturum bilgisi olmadan gönderiyor.
 * Bu yüzden adrese göre sınırlı: herkese açık bir uç, hız sınırı olmadan
 * kayıt şişirmenin davetiyesi olurdu.
 *
 * Hiçbir şey saklanmıyor. Yalnızca sunucu kaydına tek satır düşüyor: hangi
 * kural, hangi kaynak, hangi sayfa. Rapor gövdesindeki alanlar ziyaretçinin
 * tarayıcısından geliyor, yani bize DIŞ veri: kayda yazılanlar sabit uzunluğa
 * kırpılıyor ve başka hiçbir yere geçirilmiyor.
 */

export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;
const CUT = 200;

function short(value: unknown): string {
  return typeof value === "string" ? value.slice(0, CUT) : "";
}

export async function POST(request: Request) {
  const limited = await guestLimit(request, {
    scope: "csp-report",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const raw = await request.text();
  if (!raw || raw.length > MAX_BYTES) return new NextResponse(null, { status: 204 });

  try {
    const body = JSON.parse(raw) as {
      "csp-report"?: Record<string, unknown>;
      // Reporting API sürümü gövdeyi dizi olarak gönderiyor.
      body?: Record<string, unknown>;
    };
    const report = (Array.isArray(body) ? body[0]?.body : null) ??
      body["csp-report"] ??
      body.body ??
      body;

    const directive = short(
      report["violated-directive"] ?? report["effectiveDirective"],
    );
    const blocked = short(report["blocked-uri"] ?? report["blockedURL"]);
    const document = short(report["document-uri"] ?? report["documentURL"]);
    if (!directive && !blocked) return new NextResponse(null, { status: 204 });

    console.warn(
      `[csp] kural=${directive || "?"} engellenen=${blocked || "?"} sayfa=${document || "?"}`,
    );
  } catch {
    // Bozuk gövdeyi sessizce geçiyoruz: tarayıcı biçimleri sürüme göre
    // değişiyor ve bir ayrıştırma hatası ziyaretçiye hiçbir şey ifade etmez.
  }

  return new NextResponse(null, { status: 204 });
}

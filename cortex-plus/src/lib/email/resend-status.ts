import "server-only";

/**
 * Resend durumu (8 Kasım 2026, ürün sahibi: "doğrulama e-postası gelmedi"). Gönderim düşünce yalnız "gönderilemedi"
 * görünüyordu; asıl sebep çoğu zaman gönderen alan adının Resend'de doğrulanmamış olması ya da anahtarın yanlış
 * olması. Bu okuma e-posta göndermez: Resend'in alan adı listesini sorar ve EMAIL_FROM'un alan adını eşler.
 */
export type ResendStatus =
  | { state: "not_configured"; missing: string[] }
  | { state: "key_rejected"; detail: string }
  | { state: "domains_unreadable"; fromDomain: string | null; detail: string }
  | { state: "domain_missing"; fromDomain: string; known: string[] }
  | { state: "domain_not_verified"; fromDomain: string; status: string }
  | { state: "ready"; fromDomain: string }
  | { state: "unreachable"; detail: string };

/** "Cortex Plus <cortexplus@cortexplus.app>" ya da "cortexplus@cortexplus.app" → "cortexplus.app". */
export function fromDomainOf(from: string | undefined | null): string | null {
  const match = /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec((from ?? "").trim());
  return match ? match[1]!.toLowerCase() : null;
}

type DomainRow = { name?: string; status?: string };

/** Resend cevabını duruma çevirir (saf; ağ çağrısı `readResendStatus`'ta). */
export function interpretDomains(input: {
  fromDomain: string | null;
  httpStatus: number;
  body: { name?: string; message?: string; data?: DomainRow[] } | null;
}): ResendStatus {
  const { fromDomain, httpStatus, body } = input;
  if (httpStatus === 401 || httpStatus === 403) {
    // Yalnız gönderim yetkili anahtar alan adlarını okuyamaz ama e-posta gönderebilir.
    if (body?.name === "restricted_api_key") {
      return { state: "domains_unreadable", fromDomain, detail: "Anahtar yalnız e-posta göndermeye yetkili; alan adı durumu okunamadı." };
    }
    return { state: "key_rejected", detail: String(body?.message ?? body?.name ?? `resend_${httpStatus}`).slice(0, 160) };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { state: "unreachable", detail: String(body?.message ?? body?.name ?? `resend_${httpStatus}`).slice(0, 160) };
  }
  if (!fromDomain) {
    return { state: "domains_unreadable", fromDomain: null, detail: "EMAIL_FROM'dan gönderen alan adı okunamadı." };
  }
  const rows = Array.isArray(body?.data) ? body.data : [];
  const exact = rows.find((row) => row.name?.toLowerCase() === fromDomain);
  const parent = rows.find((row) => row.name && fromDomain.endsWith(`.${row.name.toLowerCase()}`));
  const match = exact ?? parent;
  if (!match) {
    return { state: "domain_missing", fromDomain, known: rows.map((row) => String(row.name ?? "")).filter(Boolean).slice(0, 8) };
  }
  if (match.status !== "verified") {
    return { state: "domain_not_verified", fromDomain, status: String(match.status ?? "bilinmiyor") };
  }
  return { state: "ready", fromDomain };
}

export async function readResendStatus(env: Record<string, string | undefined> = process.env): Promise<ResendStatus> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const missing = [!apiKey ? "RESEND_API_KEY" : null, !from ? "EMAIL_FROM" : null].filter((name): name is string => Boolean(name));
  if (missing.length) return { state: "not_configured", missing };
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { name?: string; message?: string; data?: DomainRow[] } | null;
    return interpretDomains({ fromDomain: fromDomainOf(from), httpStatus: response.status, body });
  } catch (error) {
    return { state: "unreachable", detail: error instanceof Error ? error.name : "resend_failed" };
  }
}

/** Yönetimde gösterilen Türkçe cümle ve ton; "ready" dışındaki her durum bir eylem söyler. */
export function describeResendStatus(status: ResendStatus): { tone: "ok" | "warn" | "bad"; title: string; action: string } {
  switch (status.state) {
    case "ready":
      return { tone: "ok", title: `Hazır · ${status.fromDomain} doğrulanmış`, action: "Gönderim Resend üzerinden gidiyor." };
    case "not_configured":
      return { tone: "bad", title: "Resend yapılandırılmamış", action: `Vercel'de ${status.missing.join(" ve ")} tanımlı olmalı.` };
    case "key_rejected":
      return { tone: "bad", title: "Resend anahtarı reddedildi", action: `Anahtarı Resend panelinden yenile ve Vercel'e yaz. (${status.detail})` };
    case "domain_missing":
      return {
        tone: "bad",
        title: `${status.fromDomain} Resend'de ekli değil`,
        action: `Resend → Alan adları'ndan ${status.fromDomain} ekle ve DNS kayıtlarını gir. Eklenenler: ${status.known.join(", ") || "yok"}.`,
      };
    case "domain_not_verified":
      return {
        tone: "bad",
        title: `${status.fromDomain} doğrulanmamış (${status.status})`,
        action: "Resend → Alan adları'nda DNS kayıtlarının doğrulanmasını bekle ya da kayıtları kontrol et. Doğrulanana kadar e-postalar Resend'den çıkmaz, yedek yola düşer.",
      };
    case "domains_unreadable":
      return { tone: "warn", title: "Alan adı durumu okunamadı", action: status.detail };
    case "unreachable":
      return { tone: "warn", title: "Resend'e ulaşılamadı", action: `Birkaç dakika sonra yeniden bak. (${status.detail})` };
  }
}

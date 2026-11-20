import { dailyKey, rateLimit } from "@/lib/rate-limit";

/**
 * Sohbetin arka plan örnek denetimi (15 Kasım 2026, ürün sahibi: "sohbette model denetimi kalktıysa bloklamayan %5
 * örneklemeli arka plan denetimi ekle, uyuşmazlık oranını logla"). #667'den beri "Belgem + genel bilgi" ve sistemin
 * bağladığı notta kaynak kontrolünü kod yapıyor; model denetimi yalnız şüphede. Örnek, kodun kaçırdığını ölçer:
 * yanıttan sonra (`after`) çalışır, öğrenciyi bekletmez, sonucu öğrenciye göstermez. Oran `CHAT_AUDIT_SAMPLE_RATE`
 * (0–1; verilmezse 0,05; "0" kapatır).
 *
 * Burhan'ın koşulları (aynı gün, karar 3): kapatma bayrağı + günlük maliyet tavanı + yazma hacmi.
 * - Kapatma: `chat_audit_sample` özellik anahtarı (30 sn önbellek). Satırı yoksa KAPALI; panelden açılır.
 * - Tavan: İstanbul günü başına en çok `CHAT_AUDIT_DAILY_CAP` denetim (Redis sayacı; Redis yoksa sunucu belleği,
 *   o zaman tavan örnek başına gevşer). Bir denetim ~0,002 $ (luna, düşük düşünme) → tavan günde en çok ~0,30 $.
 * - Yazma: denetim başına tek `ai_usage_events` satırı (maliyet hesabı için gerekli; ~120 bayt). Sonuç yalnız günlüğe
 *   (`chat_audit_sample`), veritabanına yazılmaz.
 */
export const CHAT_AUDIT_DEFAULT_RATE = 0.05;
export const CHAT_AUDIT_FLAG = "chat_audit_sample";
export const CHAT_AUDIT_DAILY_CAP = 150;
/** Bir denetimin tahmini bedeli (yalnız rapor ve tavanın para karşılığı için; gerçek gider `ai_usage_events`'te). */
export const CHAT_AUDIT_EST_USD = 0.002;
const DAY_SECONDS = 24 * 60 * 60;

export function chatAuditRate(raw: string | undefined = process.env.CHAT_AUDIT_SAMPLE_RATE): number {
  if (raw == null || raw.trim() === "") return CHAT_AUDIT_DEFAULT_RATE;
  const value = Number(raw);
  if (!Number.isFinite(value)) return CHAT_AUDIT_DEFAULT_RATE;
  return Math.min(1, Math.max(0, value));
}

export function shouldSampleChatAudit(random: () => number = Math.random, rate: number = chatAuditRate()): boolean {
  return rate > 0 && random() < rate;
}

/** İstanbul günü anahtarı (UTC+3): gün gece yarısı İstanbul'da döner. */
export function chatAuditDayKey(at: Date = new Date()): string {
  return dailyKey("global", "chat-audit", new Date(at.getTime() + 3 * 60 * 60 * 1000));
}

/**
 * Bugünkü tavandan bir yer ayırır; tavan dolduysa false (denetim yapılmaz, sohbet etkilenmez). Sayaç düşerse de
 * false: belirsizlikte para harcanmaz.
 */
export async function claimChatAuditSlot(at: Date = new Date(), cap: number = CHAT_AUDIT_DAILY_CAP): Promise<boolean> {
  try {
    const result = await rateLimit(chatAuditDayKey(at), cap, DAY_SECONDS);
    return result.allowed;
  } catch {
    return false;
  }
}

/**
 * Sohbetin arka plan örnek denetimi (15 Kasım 2026, ürün sahibi: "sohbette model denetimi kalktıysa bloklamayan %5
 * örneklemeli arka plan denetimi ekle, uyuşmazlık oranını logla"). #667'den beri "Belgem + genel bilgi" ve sistemin
 * bağladığı notta kaynak kontrolünü kod yapıyor; model denetimi yalnız şüphede. Örnek, kodun kaçırdığını ölçer:
 * yanıttan sonra (`after`) çalışır, öğrenciyi bekletmez, sonucu öğrenciye göstermez. Oran `CHAT_AUDIT_SAMPLE_RATE`
 * (0–1; verilmezse 0,05; "0" kapatır).
 */
export const CHAT_AUDIT_DEFAULT_RATE = 0.05;

export function chatAuditRate(raw: string | undefined = process.env.CHAT_AUDIT_SAMPLE_RATE): number {
  if (raw == null || raw.trim() === "") return CHAT_AUDIT_DEFAULT_RATE;
  const value = Number(raw);
  if (!Number.isFinite(value)) return CHAT_AUDIT_DEFAULT_RATE;
  return Math.min(1, Math.max(0, value));
}

export function shouldSampleChatAudit(random: () => number = Math.random, rate: number = chatAuditRate()): boolean {
  return rate > 0 && random() < rate;
}

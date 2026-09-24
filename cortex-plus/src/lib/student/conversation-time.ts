/**
 * Geçmiş konuşma listesinin zaman satırı ve grubu.
 *
 * Başlık ve tarih konuşmanın kendi kaydından gelir. Konu adı yoksa
 * uydurulmaz; satır yalnızca geçen süreyi söyler.
 */

export type ConversationBucket = "BUGÜN" | "BU AY" | "DAHA ESKİ";

export type RecentConversation = {
  id: string;
  title: string;
  updatedAt: string;
  /** Kayıtta ders adı varsa eski satırlarda "Matematik • 5 gün önce" olur. */
  subject?: string | null;
};

export function conversationBucket(iso: string, now = Date.now()): ConversationBucket {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "DAHA ESKİ";
  const current = new Date(now);
  const sameDay =
    then.getFullYear() === current.getFullYear() &&
    then.getMonth() === current.getMonth() &&
    then.getDate() === current.getDate();
  if (sameDay) return "BUGÜN";
  if (then.getFullYear() === current.getFullYear() && then.getMonth() === current.getMonth()) {
    return "BU AY";
  }
  return "DAHA ESKİ";
}

export function conversationWhen(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return sec <= 5 ? "az önce" : `${sec} saniye önce`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 dakika önce" : `${min} dakika önce`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "1 saat önce" : `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 gün önce" : `${days} gün önce`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 hafta önce" : `${weeks} hafta önce`;
  const months = Math.floor(days / 30);
  if (months < 12) return months <= 1 ? "1 ay önce" : `${months} ay önce`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 yıl önce" : `${years} yıl önce`;
}

/** Bugünün satırı yalnızca süre. Daha eski kayıtta konu adı varsa onunla. */
export function conversationMeta(
  iso: string,
  subject?: string | null,
  now = Date.now(),
): string {
  const when = conversationWhen(iso, now);
  const topic = subject?.trim();
  if (topic && conversationBucket(iso, now) !== "BUGÜN") return `${topic} • ${when}`;
  return when;
}

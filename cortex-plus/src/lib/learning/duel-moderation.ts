/**
 * Düelloda bildir ve engelle (26 Kasım 2026, mobil 1. adım; App Store 1.2 ve Google Play kullanıcı içeriği politikası).
 * Saf: nedenler, metinler, gövde biçimi. Uçlar `src/app/api/duels/[code]/report|block`, engel listesi
 * `/api/student/duel-blocks`, yönetici kuyruğu `/admin/duello-bildirimleri`.
 */

export const DUEL_REPORT_REASONS = ["offensive_name", "cheating", "harassment", "other"] as const;
export type DuelReportReason = (typeof DUEL_REPORT_REASONS)[number];

export const DUEL_REPORT_REASON_LABELS: Record<DuelReportReason, string> = {
  offensive_name: "Uygunsuz ad",
  cheating: "Hile şüphesi",
  harassment: "Rahatsız edici davranış",
  other: "Başka bir sorun",
};

export function isDuelReportReason(value: unknown): value is DuelReportReason {
  return typeof value === "string" && (DUEL_REPORT_REASONS as readonly string[]).includes(value);
}

export const DUEL_MODERATION_COPY = {
  menuLabel: (name: string) => `${name} için seçenekler`,
  report: "Bildir",
  block: "Engelle",
  reportTitle: "Bu oyuncuyu bildir",
  reportHint: "Bildirimi ekibimiz inceler; uygunsuz adlar sıralamadan gizlenir. Bildiren kişi karşı tarafa söylenmez.",
  notePlaceholder: "İstersen kısaca anlat (isteğe bağlı)",
  send: "Bildirimi gönder",
  cancel: "Vazgeç",
  reported: "Bildirimin alındı. Teşekkürler; ekibimiz inceleyecek.",
  blockConfirm: (name: string) => `${name} engellensin mi? Bu oyuncuyu gördüğün sıralamalarda ve kurduğun düellolarda bir daha görmezsin.`,
  blocked: (name: string) => `${name} engellendi. Engeli Ayarlar'dan kaldırabilirsin.`,
  signInToBlock: "Engellemek için giriş yap.",
  unavailable: "Bu işlem şu an alınamıyor. Biraz sonra yeniden dene ya da Destek'ten yaz.",
  failed: "Gönderilemedi. Bağlantını kontrol edip yeniden dene.",
} as const;

export const DUEL_REPORT_NOTE_MAX = 500;

/** Kullanıcı notu: kontrol karakterleri ve fazla boşluk atılır, en çok 500 karakter; boşsa null. */
export function cleanReportNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, DUEL_REPORT_NOTE_MAX);
  return note.length ? note : null;
}

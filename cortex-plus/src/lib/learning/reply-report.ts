/**
 * Öğretmen yanıtını bildirme (26 Kasım 2026, Google Play yapay zekâ içerik politikası; App Store 1.2). Öğrenci her
 * yanıtın altındaki "Bildir"le hatalı ya da uygunsuz yanıtı uygulamadan çıkmadan bize iletir. Bildirim yönetim
 * panelinin destek listesine (`/admin/destek`) konusu önekli düşer; ayrı tablo yok. Saf: istemci ve uç aynı listeyi okur.
 */

export const REPLY_REPORT_REASONS = [
  { id: "yanlis", label: "Yanlış bilgi" },
  { id: "uygunsuz", label: "Uygunsuz ya da zararlı" },
  { id: "diger", label: "Başka bir sorun" },
] as const;

export type ReplyReportReason = (typeof REPLY_REPORT_REASONS)[number]["id"];

export const REPLY_REPORT_REASON_IDS = REPLY_REPORT_REASONS.map((item) => item.id) as [
  ReplyReportReason,
  ...ReplyReportReason[],
];

/** Yönetim panelinde destek listesinde görünen önek. */
export const REPLY_REPORT_SUBJECT_PREFIX = "[Yapay zekâ yanıtı bildirimi]";

/** Bildirime eklenen yanıt parçasının sınırı. */
export const REPLY_REPORT_EXCERPT_MAX = 1500;

export function replyReportLabel(reason: ReplyReportReason): string {
  return REPLY_REPORT_REASONS.find((item) => item.id === reason)?.label ?? "Başka bir sorun";
}

export function replyReportSubject(reason: ReplyReportReason): string {
  return `${REPLY_REPORT_SUBJECT_PREFIX} ${replyReportLabel(reason)}`;
}

export function replyReportMessage(input: {
  reason: ReplyReportReason;
  messageId: string | null;
  excerpt: string;
  note?: string | null;
}): string {
  const excerpt = input.excerpt.replace(/\s+\n/g, "\n").trim().slice(0, REPLY_REPORT_EXCERPT_MAX);
  const lines = [
    `Sebep: ${replyReportLabel(input.reason)}`,
    input.messageId ? `Mesaj: ${input.messageId}` : "Mesaj: kaydedilmemiş yanıt",
  ];
  const note = input.note?.trim();
  if (note) lines.push(`Öğrencinin notu: ${note.slice(0, 500)}`);
  lines.push("", "Bildirilen yanıt:", excerpt || "(boş)");
  return lines.join("\n");
}

/** Öğrenciye bildirimden sonra gösterilen cümle. */
export const REPLY_REPORT_THANKS = "Bildirimin bize ulaştı. Yanıtı inceleyip gerekirse düzelteceğiz.";

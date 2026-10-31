import { whatsappShareHref } from "@/lib/learning/duel-share";

/**
 * Sınıf grubuyla hazırlık paylaşımı (31 Ekim 2026, Paket J3 #14). Öğrenci hazırlığını WhatsApp grubuna atar;
 * arkadaşı bağlantıyı açınca aynı başlık, sınav tarihi ve konu sırasıyla **kendi kopyasını** alır (okul ağındaki
 * katılımla aynı model: ilerleme, cevap ve puan kopyalanmaz, kimse kimsenin sonucunu görmez). Bağlantı imzalı
 * (`prep-invite.ts`); misafir kayda gider, davet kodu ve dönüş adresi korunur. Metin öğrencinin adını taşımaz.
 * Saf modül: istemci de okur.
 */

export const PREP_SHARE_LABEL = "📲 Bu Hazırlığı Sınıf Arkadaşlarınla (WhatsApp) Paylaş";
export const PREP_SHARE_COPY_LABEL = "Bağlantıyı kopyala";
export const PREP_SHARE_NOTE = "Arkadaşın katılınca aynı konu sırasıyla kendi kopyası açılır; senin sonuçların paylaşılmaz.";

export function prepInviteText(title: string | null | undefined): string {
  const name = String(title ?? "").replace(/\s+/g, " ").trim() || "Sınav hazırlığı";
  return `📚 “${name}” hazırlığına katıl: aynı konu sırasıyla birlikte çalışalım. Cortex Plus'ta kendi kopyan açılır; kimse kimsenin sonucunu görmez.`;
}

/** WhatsApp'a giden adres; bağlantı mutlak olmalı (sohbette göreli adres açılmaz). */
export function prepInviteWhatsappHref(title: string | null | undefined, absoluteUrl: string): string {
  return whatsappShareHref(prepInviteText(title), absoluteUrl);
}

export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\/[^/\s]+/i.test(value);
}

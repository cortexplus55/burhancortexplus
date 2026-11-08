/**
 * Ana ekrandaki "Başla"nın öğrenci adına gönderdiği ilk mesaj.
 *
 * 8 Kasım 2026 (ürün sahibi): önce kayıtta seçilen ders ve hedeften kurulan bir cümleydi ("Mezun Fizik çalışmak
 * istiyorum…"); öğretmen her seferinde aylar önce seçilmiş dersle açıyordu. Başla genel bir soruyla açılır: öğretmen
 * önce bugün ne çalışmak istediğini sorar. Ders ya da konu önermez; öğrenci söyler.
 */
export const START_PROMPT =
  "Merhaba! Çalışmaya başlamak istiyorum ama bugün ne çalışacağıma henüz karar vermedim. Önce aklımda ne olduğunu sor.";

export function defaultStartPrompt(): string {
  return START_PROMPT;
}

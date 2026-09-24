/**
 * Sınav sohbetinin boş ekran ve hızlı komut metinleri.
 *
 * Referans ürünün karşılama çipleri ve oluşturucunun üstündeki komutlar.
 * Sabit duruyorlar: her açılışta ayrıca üretmek kredi yakardı, öğrenci de
 * aynı yerde aynı cümleleri görsün.
 */

export type ExamChatPrompt = {
  label: string;
  prompt: string;
};

export const EXAM_CHAT_STARTERS: ExamChatPrompt[] = [
  {
    label: "Anlamadığım bir şeyi açıkla",
    prompt:
      "Anlamadığım bir şeyi açıkla. Son okuduğum derste takıldığım yeri tekrar anlat.",
  },
  {
    label: "Son testimi veya dersimi gözden geçir",
    prompt:
      "Son testimi veya dersimi gözden geçir. En kritik noktalar neydi?",
  },
  {
    label: "Zayıf noktalarımı bul",
    prompt:
      "Zayıf noktalarımı bul. Bu hazırlıkta hangi konularda zayıfım? Ölçülmemiş konular varsa onları da söyle.",
  },
  {
    label: "Çalışma stratejilerini konuşalım",
    prompt:
      "Çalışma stratejilerini konuşalım. Sınava kalan sürede neye öncelik vermeliyim?",
  },
];

export const EXAM_QUICK_COMMANDS: ExamChatPrompt[] = [
  { label: "Bana özel ders ver", prompt: "Bana özel ders ver" },
  { label: "5 yaşındaymışım gibi anlat", prompt: "5 yaşındaymışım gibi anlat" },
  { label: "Temel kavramları vurgula", prompt: "Temel kavramları vurgula" },
  {
    label: "Kavramlar arasında bağlantı kur",
    prompt: "Kavramlar arasında bağlantı kur",
  },
  { label: "Eksik olduğum noktaları bul", prompt: "Eksik olduğum noktaları bul" },
  {
    label: "Konuyu ne kadar iyi anladığımı test et",
    prompt: "Konuyu ne kadar iyi anladığımı test et",
  },
];

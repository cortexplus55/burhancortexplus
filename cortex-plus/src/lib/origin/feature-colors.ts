/** Origin full-bleed module tiles — feature → chromatic panel (marketing + accents). */

export const ORIGIN_FEATURE_COLORS = {
  aiChat: "#847dff",
  examQuiz: "#00b3dd",
  studyPlan: "#4b49aa",
  flashcard: "#d1c9ff",
  lab: "#90b8f0",
  oralPhoto: "#dd90d8",
} as const;

export type OriginFeatureKey = keyof typeof ORIGIN_FEATURE_COLORS;

export const ORIGIN_FEATURE_LABELS: Record<
  OriginFeatureKey,
  { title: string; body: string; href: string }
> = {
  aiChat: {
    title: "AI öğretmen",
    body: "Sorunu yaz; adım adım anlatım, ipucu ve benzer örnek tek sohbette.",
    href: "/kayit",
  },
  examQuiz: {
    title: "Deneme sınavı",
    body: "Süre dolmadan yazılı yanıtla; AI notlandırır ve zayıf noktalarını gösterir.",
    href: "/sinav-hazirligi",
  },
  studyPlan: {
    title: "Çalışma planı",
    body: "Hedefini yaz; haftalara bölünmüş, işaretlenebilir görev listesi oluşsun.",
    href: "/ozellikler",
  },
  flashcard: {
    title: "Quiz ve flashcard",
    body: "Konu başlığından anında test ve tekrar kartları üret.",
    href: "/ozellikler",
  },
  lab: {
    title: "Lab ve uygulamalar",
    body: "Periyodik tablo, grafik ve interaktif simülasyonlar.",
    href: "/uygulamalar",
  },
  oralPhoto: {
    title: "Sözlü sınav ve fotoğraf",
    body: "Sesli yanıtla pratik yap veya sorunun fotoğrafından çözüm al.",
    href: "/soru-coz",
  },
};

/** Hero strip (3 tiles) */
export const ORIGIN_HERO_FEATURES: OriginFeatureKey[] = [
  "oralPhoto",
  "examQuiz",
  "aiChat",
];

/** Özellikler sayfası sırası */
export const ORIGIN_FEATURES_PAGE_ORDER: OriginFeatureKey[] = [
  "aiChat",
  "oralPhoto",
  "flashcard",
  "examQuiz",
  "studyPlan",
  "lab",
];

export function originFeatureBg(key: OriginFeatureKey): string {
  return ORIGIN_FEATURE_COLORS[key];
}

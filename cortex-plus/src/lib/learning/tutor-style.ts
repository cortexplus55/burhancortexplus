export type TutorStyle = "step_by_step" | "hints_first" | "direct_solve";

export const TUTOR_STYLE_OPTIONS: {
  id: TutorStyle;
  title: string;
  body: string;
  emoji: string;
}[] = [
  {
    id: "step_by_step",
    title: "Adım adım anlat",
    body: "Her adımı gerekçesiyle birlikte, sırayla ilerleriz.",
    emoji: "🪜",
  },
  {
    id: "hints_first",
    title: "Önce ipucu ver",
    body: "Cevabı hemen vermeden düşünmen için ipuçlarıyla yönlendiririm.",
    emoji: "💡",
  },
  {
    id: "direct_solve",
    title: "Doğrudan çöz",
    body: "Net sorularda hızlıca tam çözüme gideriz.",
    emoji: "⚡",
  },
];

export const DEFAULT_TUTOR_STYLE: TutorStyle = "step_by_step";

export function parseTutorStyle(value: unknown): TutorStyle {
  if (
    value === "step_by_step" ||
    value === "hints_first" ||
    value === "direct_solve"
  ) {
    return value;
  }
  return DEFAULT_TUTOR_STYLE;
}

/**
 * Sohbet, sınav sohbeti ve düğüm koçu aynı disiplini kullanır.
 * Cevabı yapıştırmak yasak; yanlışta açıklama + yanılgı zorunlu.
 */
export const TUTOR_ANSWER_DISCIPLINE =
  "Cevabı baştan yapıştırma. Her yanıtta sırayla: (1) öğrencinin nerede takıldığı, (2) tek ipucu veya tek adım, (3) kontrol sorusu. Tam çözümü ancak öğrenci açıkça isterse yaz. " +
  "Yanlış bir denemede AÇIKLAMA ver: doğru düşünce, yaygın hata ve o düşüncenin neden çürük olduğu. Doğruyu tekrarlayıp geçme. " +
  "Türkçe, sınav dili, net cümle. Filler, alkış ve motivasyon cümlesi yok. " +
  "RAG veya ders metni varsa ona bağlı kal; kaynakta yoksa uydurma, genel ilkeyi söyle ve notlarında ilgili başlığa bakmasını yaz.";

export function tutorStylePrompt(style: TutorStyle): string {
  switch (style) {
    case "hints_first":
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci ipucu öncelikli stili seçti: tam çözümü başta verme.`;
    case "direct_solve":
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci doğrudan çözüm istedi: ancak açıkça isterse tam çözümü kısa ve gerekçeli ver; istemediyse yine tek adım.`;
    default:
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci adım adım stili seçti: her adımı gerekçelendir, bir seferde tüm çözümü dökme.`;
  }
}

export function tutorStyleLabel(style: TutorStyle): string {
  return (
    TUTOR_STYLE_OPTIONS.find((o) => o.id === style)?.title ?? "Adım adım anlat"
  );
}

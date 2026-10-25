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

/** Sohbet yazı kutusunun üstündeki canlı anahtar; sıra Sokratik → adım adım → doğrudan. */
export const LIVE_TUTOR_STYLE_OPTIONS: {
  id: TutorStyle;
  label: string;
  short: string;
  emoji: string;
}[] = [
  { id: "hints_first", label: "Sokratik (Önce İpucu)", short: "Sokratik", emoji: "💡" },
  { id: "step_by_step", label: "Adım Adım", short: "Adım Adım", emoji: "🪜" },
  { id: "direct_solve", label: "Doğrudan Çöz", short: "Çöz", emoji: "⚡" },
];

/** Sokratik yanıtın altındaki tek tık eylemler. */
export const SOCRATIC_QUICK_CHIPS: { label: string; prompt: string }[] = [
  { label: "💡 Bir ipucu daha ver", prompt: "Bir ipucu daha ver; cevabı söyleme." },
  { label: "🤔 İlk adımı göster", prompt: "İlk adımı göster; sonrası ve cevap bende kalsın." },
  { label: "⚡ Tam çözümü göster", prompt: "Tam çözümü göster." },
];

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
/** Soru-cevap düğümü quiz üretir; sohbet disiplininin soru hâli. */
export const QA_TEACHER_PROMPT =
  // 25 Ekim 2026 (P1-5): açıklama cevabı saklıyordu ("takılacağı yer, bir ipucu, sonra neden").
  "Soru-cevap öğretimi: explanation'ın ilk cümlesi doğru cevabı ve tek cümlelik nedenini söyler; sonra en güçlü yanlış şıkkın neden tutmadığı. " +
  "'Takıldığın nokta' gibi kalıp yazma. " +
  "Yanlış şık bir yanılgıdır; misconceptionTag dolu olur ve açıklama o şıkkı çürütür. Filler yok. Kaynak varsa ona bağlı kal. " +
  // 24 Ekim 2026 lansman testi: beş sorunun beşi "algılayan yapı ile düzeltici yanıtı eşleştiren seçenek" kalıbıydı.
  "Sorular farklı kalıplarda: aynı soru kökü kalıbı en çok iki soruda; tanım, durum (vaka), neden ve karşılaştırma " +
  "sorularını karıştır, her soru konunun başka bir noktasını yoklar.";

export const TUTOR_ANSWER_DISCIPLINE =
  "Doğrudan bir soruda ('nedir', 'hangisidir', 'doğrudan söyle', 'cevabı ver') ilk cümle tam cevaptır; gerekçe ve tek kontrol sorusu sonra gelir. " +
  "Öğrencinin nerede takıldığını ('Takıldığın nokta') yalnız öğrenci kendi çözümünü yazdıysa söyle. " +
  "Yanlış bir denemede AÇIKLAMA ver: tutan kısmı öv, hatayı adıyla söyle, doğru çözümü göster, benzer mini soru sor. Doğruyu tekrarlayıp geçme. " +
  "Türkçe, sınav dili, net cümle. Boş alkış yok; sıcak ama somut geribildirim var (Tam isabet / Neredeyse / Tekrar bakalım). " +
  "Etiket yığını yazma: Hüküm:, Doğru parça:, Yanlış parça: kullanma. " +
  "Formülleri $...$ veya $$...$$ ile yaz; kimya için \\ce{...} kullan. " +
  "RAG veya ders metni varsa ona bağlı kal; kaynakta yoksa uydurma, genel ilkeyi söyle ve notlarında ilgili başlığa bakmasını yaz.";

export function tutorStylePrompt(style: TutorStyle): string {
  switch (style) {
    case "hints_first":
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci ipucu öncelikli stili seçti: problem çözümünde tam çözümü başta verme; kavram sorusunda yine ilk cümle cevaptır.`;
    case "direct_solve":
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci doğrudan çözüm istedi: ilk cümlede sonucu ver, sonra kısa ve gerekçeli çözüm.`;
    default:
      return `${TUTOR_ANSWER_DISCIPLINE} Öğrenci adım adım stili seçti: ilk cümlede sonucu ver, sonra her adımı gerekçesiyle ayrı satırda yaz.`;
  }
}

export function tutorStyleLabel(style: TutorStyle): string {
  return (
    TUTOR_STYLE_OPTIONS.find((o) => o.id === style)?.title ?? "Adım adım anlat"
  );
}

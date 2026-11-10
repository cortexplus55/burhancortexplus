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

/**
 * Sohbet yazı kutusunun üstündeki canlı anahtar; sıra Sokratik → adım adım → doğrudan.
 * `description` (10 Kasım 2026, güven paketi): modun ne yaptığını tek cümleyle söyler; ekrandaki açıklama, düğmenin
 * ipucu ve ekran okuyucu metni aynı kaynaktan okunur.
 */
export const LIVE_TUTOR_STYLE_OPTIONS: {
  id: TutorStyle;
  label: string;
  short: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "hints_first",
    label: "Sokratik (Önce İpucu)",
    short: "Sokratik",
    emoji: "💡",
    description: "Cevabı hemen vermez; ipucu ve yönlendirici sorularla çözümü senin bulmanı sağlar.",
  },
  {
    id: "step_by_step",
    label: "Adım Adım",
    short: "Adım Adım",
    emoji: "🪜",
    description: "Çözümü tek seferde dökmez; 1. adımdan başlar ve sen 'Devam et' dedikçe sıradaki adıma geçer.",
  },
  {
    id: "direct_solve",
    label: "Doğrudan Çöz",
    short: "Çöz",
    emoji: "⚡",
    description: "Tüm işlem adımlarını ve nihai sonucu tek mesajda eksiksiz gösterir.",
  },
];

export function tutorStyleDescription(style: TutorStyle): string {
  return LIVE_TUTOR_STYLE_OPTIONS.find((option) => option.id === style)?.description ?? "";
}

/** Sokratik yanıtın altındaki tek tık eylemler. */
export const SOCRATIC_QUICK_CHIPS: { label: string; prompt: string }[] = [
  { label: "💡 Bir ipucu daha ver", prompt: "Bir ipucu daha ver; cevabı söyleme." },
  { label: "🤔 İlk adımı göster", prompt: "İlk adımı göster; sonrası ve cevap bende kalsın." },
  { label: "⚡ Tam çözümü göster", prompt: "Tam çözümü göster." },
];

/** Adım Adım modunun kapanış daveti ve tam çözüm isteği; istem, çipler ve takip tanıyıcı aynı sözü okur. */
export const STEP_CONTINUE_WORD = "Devam et";
export const STEP_FULL_SOLUTION_PROMPT = "Cevabı ve tüm adımları göster.";

/** Tırnak ya da vurgu içindeki davet ("'Devam et' yaz"); "devam etmek istersen" gibi düz cümle davet sayılmaz. */
const STEP_INVITE = /['"“”‘’«»*`]\s*devam et\s*['"“”‘’«»*`]/u;
/** Satır başındaki adım başlığı ("**2. adım:**"); çekimli biçim ("2. adıma geçelim") başlık değildir. */
const STEP_HEADING = /^[\s>#*_-]*(\d{1,2})\.\s*ad[ıi]m(?![\p{L}])/gimu;
const STEP_NEXT_MENTION = /(?<![\p{L}\p{N}])(\d{1,2})\.\s*ad[ıi]ma(?![\p{L}])/giu;

/** Yanıt, Adım Adım modunun "tek adım + Devam et daveti" biçiminde mi. */
export function isPacedStepReply(reply: string): boolean {
  return STEP_INVITE.test((reply ?? "").toLocaleLowerCase("tr"));
}

/**
 * Adımlı yanıtın kaçıncı adımda kaldığı. Davet yoksa (tam çözüm, kavram cevabı, selamlaşma) null. Adım, satır
 * başındaki en büyük "N. adım" başlığıdır; başlık yoksa davetin andığı sıradaki adımdan ("N. adıma") bir eksiği;
 * o da yoksa 0 (adımlı ama numarası okunamadı).
 */
export function pacedStepNumber(reply: string): number | null {
  const text = reply ?? "";
  if (!isPacedStepReply(text)) return null;
  let highest = 0;
  for (const match of text.matchAll(STEP_HEADING)) {
    const step = Number(match[1]);
    if (step >= 1 && step <= 30 && step > highest) highest = step;
  }
  if (highest) return highest;
  for (const match of text.matchAll(STEP_NEXT_MENTION)) {
    const next = Number(match[1]);
    if (next >= 2 && next <= 31 && next - 1 > highest) highest = next - 1;
  }
  return highest;
}

/** Adım Adım yanıtının altındaki tek tık eylemler: sıradaki adım ve tam çözüm. Adımlı yanıt değilse boş. */
export function stepQuickChips(reply: string): { label: string; prompt: string }[] {
  const step = pacedStepNumber(reply);
  if (step == null) return [];
  const forward = step > 0
    ? { label: `🪜 ${step + 1}. adıma geç`, prompt: `${STEP_CONTINUE_WORD}: ${step + 1}. adıma geç.` }
    : { label: "🪜 Sonraki adıma geç", prompt: `${STEP_CONTINUE_WORD}: sonraki adıma geç.` };
  return [forward, { label: "⚡ Cevabı ve tüm adımları göster", prompt: STEP_FULL_SOLUTION_PROMPT }];
}

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

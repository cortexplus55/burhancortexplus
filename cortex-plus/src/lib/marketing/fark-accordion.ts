import { CLONE_REWARD_CREDITS, CLONE_REWARD_MONTHLY_CAP } from "@/lib/learning/class-share";
import { PAST_MIN_QUESTIONS, TWIN_EXAM_QUESTION_COUNT, TWIN_EXAM_SHORT_LABEL } from "@/lib/learning/mock-exam/past-questions";
import { TWIN_BUTTON, TWO_OPTION_CHIP, TWO_OPTION_PICK, twoOptionEliminatedLine } from "@/lib/learning/twin-question-copy";
import { PARENT_LINK_TTL_HOURS } from "@/lib/payments/parent-link-ttl";

/**
 * "Aynı not, iki ayrı sonuç" (ana sayfa, `#farklar`) — Faz 9 (20 Kasım 2026, ürün sahibi: "aynı bölümde üç ayrı düzende
 * on kart var; tek, bölünmüş, görsel bir akordeon olsun"). Eski yığın (aynı not kartı, üç kartlık fark vitrini, dört açılır
 * fark satırı) tek akordeona indi: solda altı başlık, sağda açık başlığın canlı sahnesi (telefonda sahne açık başlığın
 * içinde). Her başlıkta en çok iki kısa cümle ve tek satırlık fark ("Genel botlar: … / Cortex Plus: …").
 *
 * Tek kural: burada yazan her şey bugün üründe çalışıyor; kanıtı `evidence`te (yalnız iç kayıt, ekranda yok; bekçi
 * dosyaların var olduğunu tutar). Plus'a özel işler (podcast üretimi, yazılı deneme ve "Kâğıtta çöz", sözlü, sınav sabahı
 * kâğıdı) başlıkta "Plus" etiketi taşır. Rakip adı geçmez: karşı taraf "Genel botlar". Sayılar sabitlerden: ikiz sınavın
 * soru sayısı ve açılma eşiği (`past-questions.ts`), sınıf ödülü ve aylık sınırı (`class-share.ts`), veli linkinin süresi
 * (`parent-link-ttl.ts`).
 *
 * Bilerek yumuşatılanlar (Faz 7 kararları sürüyor): radyo kilit ekranında çalmayı vaat etmez ("kilit ekranından yönet";
 * arka planda çalmayı tarayıcı belirler); kırmızı kalem yazılı denemenin "Kâğıtta çöz" seçeneğidir, her defter sorusu değil.
 */

export type FarkItemId = "notuna-sadik" | "sinav-radyosu" | "kirmizi-kalem" | "ikiz-soru" | "ikiz-sinav" | "sinifla-paylas";

export type FarkItem = {
  id: FarkItemId;
  /** Başlığın süsü; ekran okuyucu başlığı simgesiz okur. */
  emoji: string;
  title: string;
  /** Ücretsiz hesapta açılmayan bir iş anlatılıyorsa başlıkta "Plus" etiketi. */
  plus: boolean;
  /** En çok iki kısa cümle. */
  body: readonly [string] | readonly [string, string];
  /** Tek satırlık fark: önce genel botlar, sonra Cortex Plus. */
  diff: { them: string; us: string };
  evidence: readonly string[];
};

/** Fark satırının iki etiketi. Rakip adı yok; karşı taraf her yerde genel botlar. */
export const FARK_LABELS = { them: "Genel botlar", us: "Cortex Plus", plus: "Plus" } as const;

export const FARK_SECTION = {
  /** Sahnenin ekran okuyucu adı: "<başlık>: canlı örnek". */
  sceneSuffix: "canlı örnek",
  /** Bölümün altındaki tek bağlantı: tam karşılaştırma tablosu Özellikler sayfasında. */
  moreHref: "/ozellikler#farklar",
} as const;

export const FARK_ITEMS: readonly FarkItem[] = [
  {
    id: "notuna-sadik",
    emoji: "📄",
    title: "Notuna Sadık & Çift Kontrollü",
    plus: false,
    body: [
      "Hocanın notun kenarına düştüğü uyarıyı unutmaz, sayfadaki şekil ve tabloyu derse alır.",
      "Sorularını çift kontrolden geçirir.",
    ],
    diff: { them: "Notu sıradan metin gibi okur.", us: "Hocanın uyarısı derste de testte de esas alınır." },
    evidence: [
      "src/lib/learning/source-rules.ts",
      "src/lib/learning/figure-pages.ts",
      "src/lib/learning/lesson-sanity.ts",
      "src/lib/learning/quiz-sanity.ts",
      "src/lib/learning/question-integrity.ts",
    ],
  },
  {
    id: "sinav-radyosu",
    emoji: "🎧",
    title: "Otobüste Kesintisiz Sınav Radyosu",
    plus: true,
    body: [
      "Ürettiğin ünite podcastlerini kulaklığından sırayla dinle, kilit ekranından yönet.",
      "Tekrar dinlemek ücretsiz; podcast üretimi Plus'ta.",
    ],
    diff: { them: "Ekrana düz yazı döker.", us: "Ünitelerin radyo gibi art arda çalar." },
    evidence: [
      "src/components/parity/prep-radio.tsx",
      "src/lib/learning/radio-media-session.ts",
      "src/lib/learning/audio-cache.ts (cachedAudioOnly)",
      "src/app/api/learning/exam-prep/radio/route.ts",
    ],
  },
  {
    id: "kirmizi-kalem",
    emoji: "🖊️",
    title: "Kırmızı Kalemli Hoca (Kâğıda Çöz, Fotoğrafla)",
    plus: true,
    body: [
      "Yazılı denemeyi “Kâğıtta çöz” ile kâğıda çöz, fotoğrafını çek.",
      "Yalnız sonuca değil, puanın kırıldığı basamağa da bakar.",
    ],
    diff: { them: "Yalnız sonuca bakar.", us: "Puanın kırıldığı ara basamağı kırmızıyla gösterir." },
    evidence: [
      "src/lib/learning/paper-exam.ts",
      "src/lib/learning/mock-exam/work-steps.ts",
      "src/lib/learning/mock-exam/red-pen.ts",
      "src/components/parity/red-pen-sheet.tsx",
    ],
  },
  {
    id: "ikiz-soru",
    emoji: "🔥",
    title: "Yanlışın İkizi & İki Şık İpucu",
    plus: false,
    body: [
      "İki şık arasında kaldığında cevabı söylemeden farkı hatırlatır.",
      "Yanlış yaptığında aynı kavramdan ikiz bir soruyla hemen telafi edersin.",
    ],
    diff: { them: "Cevabı gösterip geçer.", us: "Aynı kavramı yeni sayılarla yeniden sorar." },
    evidence: [
      "src/lib/learning/twin-question.ts",
      "src/components/learning/twin-question-card.tsx",
      "src/components/learning/two-option-hint.tsx",
      "src/app/api/learning/two-option-hint/route.ts",
    ],
  },
  {
    id: "ikiz-sinav",
    emoji: "🎯",
    title: "Hocanın İkiz Sınavı (20 Soru) & Sessiz Sözlü",
    plus: true,
    body: [
      `Belgelerinde en az ${PAST_MIN_QUESTIONS} çıkmış soru varsa hocanın tarzında ${TWIN_EXAM_QUESTION_COUNT} soruluk ikiz sınav çözersin.`,
      "Kütüphanede mikrofon açamıyorsan sözlü sınava yazarak cevap verirsin.",
    ],
    diff: { them: "Çıkmış soruları sıradan metin sanıp geçer.", us: `Hocanın tarzında ${TWIN_EXAM_QUESTION_COUNT} soruluk ikiz sınav kurar.` },
    evidence: [
      "src/lib/learning/mock-exam/past-questions.ts (PAST_MIN_QUESTIONS, TWIN_EXAM_QUESTION_COUNT)",
      "src/components/parity/mock-exam-setup.tsx",
      "src/components/parity/oral-answer-desk.tsx",
    ],
  },
  {
    id: "sinifla-paylas",
    emoji: "📲",
    title: `Sınıfla Paylaş (+${CLONE_REWARD_CREDITS} Kredi) & Velime Ödeme Linki`,
    plus: false,
    body: [
      `Çalışma yolunu sınıf grubuna at: arkadaşın 1. üniteyi ücretsiz kopyalar, o ünitenin konu testini bitirince sen +${CLONE_REWARD_CREDITS} kredi kazanırsın (ayda en çok ${CLONE_REWARD_MONTHLY_CAP} arkadaş).`,
      `Kartın yoksa velin hesap açmadan, şifresiz bir WhatsApp linkiyle PayTR üzerinden öder; link ${PARENT_LINK_TTL_HOURS} saat geçerli.`,
    ],
    diff: { them: "Sohbet kişiye özel kalır, ödeme yalnız kartla.", us: "Yolun sınıfla paylaşılır, velin linkle öder." },
    evidence: [
      "src/lib/learning/viral-clone.ts (cloneSharedPrepForUser)",
      "src/lib/learning/viral-clone-reward.ts",
      "src/lib/learning/class-share.ts (CLONE_REWARD_CREDITS, CLONE_REWARD_MONTHLY_CAP)",
      "src/lib/payments/parent-link.ts",
      "src/components/billing/parent-whatsapp-link.tsx",
    ],
  },
] as const;

/* ---------- Sahne 1: aynı not, iki sonuç ---------- */

/**
 * Sahne 1'in örnek sorusu: tanıtım turunun ders sorusuyla aynı (köklü sayılar, lise, beş şık A–E). x < 0 iken
 * √(x²) = |x| = −x; bekçi testi bir negatif sayıyla yeniden hesaplar.
 */
export const NOTE_SCENE = {
  question: "x < 0 olmak üzere √(x²) ifadesi hangisine eşittir?",
  options: ["x", "−x", "x²", "0", "1/x"],
  answerIndex: 1,
  /** Genel botların tarafında yalnız şık harfleri: dört şık (A–D); altındaki cümle `SAME_NOTE_CASE`ten. */
  themLetters: ["A", "B", "C", "D"],
  /**
   * "Çift kontrollü yazım"ın üç halkası: yazar model notundan yazar, hafif doğrulayıcı çağrı soruyu kendisi çözer
   * (`lesson-sanity.ts`, `quiz-sanity.ts`), kod anahtarı hesapla karşılaştırır (`question-integrity.ts`).
   */
  checks: ["Model notundan yazar", "İkinci çağrı soruyu çözer", "Kod anahtarı hesapla denetler"],
} as const;

/* ---------- Sahne 4: tuzak yakalandı → yanlışın ikizi ---------- */

export type TwinDemoQuestion = {
  prompt: string;
  options: readonly string[];
  answer: string;
  explanation: string;
  /** Her yanlış şık için tek cümle: tuzağın adı. */
  whyWrong: Readonly<Record<string, string>>;
};

/**
 * Ardışık yüzde: klasik tuzak "aynı yüzde artıp azalınca fiyat değişmez". Ana soru %20, ikizi aynı kavram %10 ile.
 * Hesap: 100 × 1,2 × 0,8 = 96 (%4 azalır); 100 × 1,1 × 0,9 = 99 (%1 azalır). Bekçi testi ikisini yeniden hesaplar.
 */
export const TWIN_SCENE = {
  steps: ["Tuzak yakalandı", "Yanlışın ikizi hazır"],
  chip: TWO_OPTION_CHIP,
  pick: TWO_OPTION_PICK,
  twinButton: TWIN_BUTTON,
  trapCaught: "🪤 Tuzak yakalandı",
  right: "✓ Doğru",
  rightTwinOffer: "Yanlış yapsaydın ikiz soru burada açılırdı. Yine de dene:",
  twinRight: "👏 İkiz soruyu çözdün: kavram oturdu.",
  twinWrong: "Bu sefer de olmadı; açıklamayı oku, kavram aynı.",
  restart: "Baştan dene",
  question: {
    prompt: "Bir ürünün fiyatı önce %20 artırılıyor, sonra yeni fiyat %20 indiriliyor. Son fiyat ilk fiyata göre nasıl değişir?",
    options: ["Değişmez", "%4 azalır", "%4 artar", "%2 azalır", "%20 azalır"],
    answer: "%4 azalır",
    explanation: "100 TL önce 120 TL olur; 120 TL'nin %20'si 24 TL, son fiyat 96 TL. Fiyat %4 azalır.",
    whyWrong: {
      "Değişmez": "İkinci %20 artmış fiyatın üzerinden hesaplanır; iki değişim aynı tutar değildir.",
      "%4 artar": "Yön ters: artıştan sonraki indirim daha büyük bir tutar üzerinden yapılır.",
      "%2 azalır": "Kayıp, iki oranın çarpımı kadardır; yarısı değil.",
      "%20 azalır": "Artış ve indirim birbirini büyük ölçüde götürür; kayıp %20 değil.",
    },
  } satisfies TwinDemoQuestion,
  twin: {
    prompt: "Bir ürünün fiyatı önce %10 artırılıyor, sonra yeni fiyat %10 indiriliyor. Son fiyat ilk fiyata göre nasıl değişir?",
    options: ["%1 artar", "Değişmez", "%1 azalır", "%10 azalır", "%2 azalır"],
    answer: "%1 azalır",
    explanation: "100 TL önce 110 TL olur; 110 TL'nin %10'u 11 TL, son fiyat 99 TL. Fiyat %1 azalır.",
    whyWrong: {
      "%1 artar": "Yön ters: indirim, artmış fiyatın üzerinden yapılır.",
      "Değişmez": "Aynı tuzak: ikinci %10 artmış fiyatın %10'udur.",
      "%10 azalır": "Artış ve indirim birbirini büyük ölçüde götürür; kayıp %10 değil.",
      "%2 azalır": "Kayıp, iki oranın çarpımı kadardır; toplamı değil.",
    },
  } satisfies TwinDemoQuestion,
} as const;

/**
 * "İki Şık Arasında Kaldım" (sahne 4): üründeki gibi cevabı ve hesabı söylemez, rakam taşımaz; seçilen iki şıkkın dışından
 * doğru olmayan bir şıkkı eler. Model ve istek yok.
 */
export function twinSceneHint(question: TwinDemoQuestion, pair: readonly string[]): { hint: string; eliminated: string | null } {
  const hint = pair.includes("Değişmez")
    ? "Bu iki şıkkı ayıran, ikinci yüzdenin hangi fiyatın üzerinden hesaplandığı. Önce ilk değişimden sonraki yeni fiyatı bul."
    : "Bu iki şıkkı ayıran, değişimin yönü ve büyüklüğü. Bir sayı seç; önce artır, sonra çıkan yeni fiyatı indir.";
  const eliminated = question.options.find((option) => option !== question.answer && !pair.includes(option) && option !== "Değişmez") ?? null;
  return { hint, eliminated };
}

/** "❌ E şıkkı çeldirici olarak elendi." — ürünün cümlesi. */
export function twinSceneEliminatedLine(question: TwinDemoQuestion, option: string): string {
  return twoOptionEliminatedLine(String.fromCharCode(65 + question.options.indexOf(option)));
}

/* ---------- Sahne 5: ikiz sınav + sessiz sözlü ---------- */

/** Örnek konu dağılımı: toplamı ikiz sınavın soru sayısı (bekçi). "Örnek" diye yazılı; gerçek dağılım öğrencinin çıkmış sorularından. */
export const TWIN_EXAM_SCENE = {
  title: `🎯 ${TWIN_EXAM_SHORT_LABEL}`,
  sample: "Örnek dağılım",
  topics: [
    { name: "Köklü sayılar", count: 6 },
    { name: "Üslü sayılar", count: 5 },
    { name: "Mutlak değer", count: 5 },
    { name: "Denklemler", count: 4 },
  ],
  unlock: `Belgelerinde en az ${PAST_MIN_QUESTIONS} çıkmış soru bulununca açılır.`,
} as const;

export const SILENT_ORAL_SCENE = {
  title: "🤫 Kütüphanede sessiz sözlü",
  counter: "Sözlü · Soru 2 / 5",
  prompt: "√(x²) neden kök dışına |x| olarak çıkar? Kendi cümlenle açıkla.",
  answer: "Kök negatif sonuç vermez; x negatifse sonuç −x olur, yani |x|.",
  /** Ürünün sözlü ekranındaki ipucu yazısı ve mikrofon düğmesinin adı (`oral-answer-desk.tsx`). */
  placeholder: "Konuşarak veya yazarak yanıtla",
  mic: "Konuşarak cevapla",
  typed: "Yazarak cevaplandı",
} as const;

/* ---------- Sahne 6: velime ödeme linki ---------- */

export const PARENT_LINK_SCENE = {
  badge: "📲 Velime WhatsApp Ödeme Linki",
  facts: ["Hesap açmadan, şifresiz", "PayTR ile güvenli ödeme", `${PARENT_LINK_TTL_HOURS} saat geçerli`],
  note: "Paket senin hesabına tanımlanır.",
} as const;

/** Bekçi testlerinin taradığı bütün akordeon metni. */
export function allFarkAccordionCopy(): string {
  return [
    ...Object.values(FARK_LABELS),
    FARK_SECTION.sceneSuffix,
    ...FARK_ITEMS.flatMap((item) => [item.title, ...item.body, item.diff.them, item.diff.us]),
    NOTE_SCENE.question,
    ...NOTE_SCENE.options,
    ...NOTE_SCENE.checks,
    ...TWIN_SCENE.steps,
    TWIN_SCENE.trapCaught,
    TWIN_SCENE.right,
    TWIN_SCENE.rightTwinOffer,
    TWIN_SCENE.twinRight,
    TWIN_SCENE.twinWrong,
    TWIN_SCENE.restart,
    ...[TWIN_SCENE.question, TWIN_SCENE.twin].flatMap((q) => [q.prompt, ...q.options, q.explanation, ...Object.values(q.whyWrong)]),
    TWIN_EXAM_SCENE.title,
    TWIN_EXAM_SCENE.sample,
    ...TWIN_EXAM_SCENE.topics.map((topic) => topic.name),
    TWIN_EXAM_SCENE.unlock,
    ...Object.values(SILENT_ORAL_SCENE),
    PARENT_LINK_SCENE.badge,
    ...PARENT_LINK_SCENE.facts,
    PARENT_LINK_SCENE.note,
  ].join("\n");
}

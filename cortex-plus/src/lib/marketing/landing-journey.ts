/**
 * Ana sayfanın 7 adımlı tanıtım turu (11 Kasım 2026, ürün sahibi: "ziyaretçi sistemi kendi tıklamasıyla baştan
 * sona yaşasın").
 *
 * Misafir örnek bir notu tarama alanına bırakır; yol haritası, ilk ders, soru, kart, doğru/yanlış ve Plus vitrini
 * sırayla açılır. Tur model çağırmaz, ağ isteği atmaz, hiçbir şey yüklemez: bütün içerik bu dosyada yazılı ve
 * elle doğrulanmış evrensel bir matematik kuralıdır (çift dereceli kök mutlak değer verir). Ekranlar ürünün gerçek
 * ekranlarının küçültülmüş hâlidir (formül kartı, sınav tuzağı, hafıza çivisi, "İki şık arasında kaldım", koç
 * cümlesi); üründe olmayan bir şey gösterilmez. Plus'ta olan her şey "Plus" diye etiketlenir (bekçi
 * `marketing-claims.test.ts`).
 */

import type { AudienceSegmentId } from "@/lib/marketing/landing-showcase";

export const JOURNEY_STEP_IDS = ["upload", "roadmap", "lesson", "question", "cards", "check", "plus"] as const;
export type JourneyStepId = (typeof JOURNEY_STEP_IDS)[number];

export type JourneyStep = {
  id: JourneyStepId;
  /** Üst raydaki kısa ad. */
  short: string;
  /** Adımın başlığı. */
  title: string;
  /** Sıradaki hareketi söyleyen yönlendirme ("Adım N/7: …"). */
  guide: string;
};

export const JOURNEY_STEPS: JourneyStep[] = [
  { id: "upload", short: "Not", title: "Notunu bırak", guide: "PDF'i tarama alanına sürükle ya da üstüne dokun" },
  { id: "roadmap", short: "Yol", title: "Yol haritan çıktı", guide: "1. dersi aç" },
  { id: "lesson", short: "Ders", title: "Ansiklopedi değil, sınav mantığı", guide: "Kuralı oku, sonra soruda dene" },
  { id: "question", short: "Soru", title: "Kuralı soruda dene", guide: "Bir şık seç; takılırsan ipucunu aç" },
  { id: "cards", short: "Kart", title: "Dokun ve çevir", guide: "Karta dokun, arkasını gör" },
  { id: "check", short: "D/Y", title: "Hızlı kontrol", guide: "Önerme doğru mu, yanlış mı?" },
  { id: "plus", short: "Plus", title: "Aynı not, beş yol daha", guide: "İlk dersini ücretsiz başlat" },
];

export const JOURNEY_COPY = {
  kicker: "Kayıt olmadan dene",
  title: "Bir not, yedi adımda derse dönüşsün",
  /** Dürüstlük notu: bu bir tanıtım turudur; örnek not hazırdır, hiçbir şey yüklenmez. */
  note: "Tanıtım turu: örnek not hazır, hiçbir dosya yüklenmez.",
  restart: "Turu baştan oyna",
} as const;

/* ---------- 1. Not ---------- */

export const JOURNEY_FILE = {
  name: "Köklü_Sayılar_Ders_Notu.pdf",
  meta: "Matematik · 6 sayfa · Hoca notu",
  zoneTitle: "Cortex tarama alanı",
  zoneHint: "Notunu buraya bırak",
  scanning: ["Sayfalar okunuyor…", "Formüller ve sınav tuzakları çıkarılıyor…"],
  /** Tarama animasyonunun süresi (ms); hareket azaltmada beklenmez. */
  scanMs: 1200,
} as const;

/* ---------- 2. Yol haritası ---------- */

export const JOURNEY_ROADMAP = {
  goals: ["Sınavına 7 gün var", "Günde 30 dk", "Hedef: 95+"],
  days: [
    { day: "1. gün", title: "Köklü ifadelerin tanımı ve çift derece kuralı", ready: true, meta: "Hazır · 5 dk" },
    { day: "2. gün", title: "Sayıyı kök dışına çıkarma ve kök içine alma", ready: false, meta: "" },
    { day: "3. gün", title: "Köklü sayılarda toplama, çıkarma ve çarpma", ready: false, meta: "" },
    { day: "4. gün", title: "Eşlenik ve paydayı rasyonel yapma", ready: false, meta: "" },
    { day: "5–7. gün", title: "İç içe kökler, konu testi ve genel tekrar", ready: false, meta: "" },
  ],
  cta: "1. dersi başlat",
} as const;

/* ---------- 3. Ders ---------- */

export const JOURNEY_LESSON = {
  topic: "Köklü ifadelerin mantığı",
  concept: "Köklü sayı şu sorunun cevabıdır: hangi sayının karesi (ya da n. kuvveti) kökün içindeki sayıyı verir?",
  formula: {
    title: "Kök dışına çıkarma kuralı",
    rows: [
      { label: "Tek dereceli kök", expression: "ⁿ√(aⁿ) = a", note: "İşaret korunur: ³√(−27) = −3" },
      { label: "Çift dereceli kök", expression: "²ⁿ√(a²ⁿ) = |a|", note: "Mutlak değer olarak çıkar." },
    ],
  },
  trap: {
    title: "Sınav tuzağı",
    wrong: "√((−5)²) = −5",
    wrongWhy: "Kare ile kök birbirini götürür deyip eksiyi olduğu gibi çıkarmak.",
    right: "√((−5)²) = |−5| = 5",
    rightWhy: "Çift dereceli kökün sonucu negatif olamaz.",
  },
  hook: {
    title: "Hafıza çivisi",
    body: "Çift derece, çift muhafız: | |. Sayı kök dışına mutlak değer çizgilerinin arasından çıkar; eksi içeride kalır.",
  },
  cta: "Kuralı soruda dene",
} as const;

/* ---------- 4. Soru ---------- */

export const JOURNEY_QUESTION = {
  prompt: "√((−4)²) + ³√(−8) işleminin sonucu kaçtır?",
  options: ["−6", "−2", "2", "6", "12"],
  answer: "2",
  /** Doğru cevabın gerekçesi (cevaptan sonra gösterilir). */
  explanation: "Çift dereceli kökteki mutlak değer tuzağına düşmedin: |−4| + (−2) = 4 − 2 = 2.",
  /** Yanlış şıkkın neden çekici olduğu; cevabı söylemez, öğrenciyi yeniden düşündürür. */
  wrongWhy: {
    "−6": "Bu, ilk terimi eksiyle çıkarınca bulunan sonuç: tuzağın ta kendisi. Çift dereceli kökten negatif sonuç çıkmaz; ilk terime yeniden bak.",
    "−2": "Küp kökü doğru aldın, ama ilk terim hesaba girmedi. √((−4)²) kök dışına nasıl çıkar?",
    "6": "İlk terim doğru, ama küp kökü de artı aldın. Tek dereceli kök işareti korur.",
    "12": "Burada çarpma karışmış. İki terimi ayrı ayrı kök dışına çıkar, sonra topla.",
  } as Record<string, string>,
  /**
   * "İki şık arasında kaldım": en çok karıştırılan iki şık ve aralarındaki farkı hatırlatan cümle. Cevabı söylemez
   * (ürün kuralı; ipucunda hesap yapılmaz).
   */
  twoOption: {
    pair: ["−6", "2"] as [string, string],
    hint: "Biri kare ile kökün birbirini götürdüğünü varsayar; öbürü çift dereceli kökün sonucunun negatif olamayacağını kullanır. İlk terim kök dışına hangi işaretle çıkmalı?",
  },
  cta: "Akıllı kartlara geç",
} as const;

/* ---------- 5. Kart ---------- */

export const JOURNEY_CARD = {
  front: "√(a²) kök dışına nasıl çıkar, neden?",
  back: "|a| olarak çıkar. Çünkü çift dereceli kökün sonucu gerçek sayılarda negatif olamaz.",
  flipHint: "Karta dokun, arkasını çevir",
  again: "Tekrar sor",
  cta: "Öğrendim: doğru/yanlışa geç",
} as const;

/* ---------- 6. Doğru / Yanlış ---------- */

export const JOURNEY_TRUTH = {
  statement: "x < 0 olmak üzere, √(x²) ifadesi kök dışına −x olarak çıkar.",
  answer: true,
  explanation:
    "İnce nokta: x zaten negatif (örneğin x = −3). Sonucun pozitif çıkması için önüne eksi alır: −x = −(−3) = 3. Önerme doğru.",
  /** Doğru/yanlışta şık yoktur: koç cümlesi önermeye göre yazılır. */
  rightLine: "🎯 İnce noktayı yakaladın.",
  wrongLine: "💪 Çoğu kişi burada takılır; ince nokta şu:",
  doneTitle: "1. ders tamamlandı",
  cta: "Plus'ta başka neler var?",
} as const;

/* ---------- 7. Plus vitrini ---------- */

export type JourneyPlusCard = { id: string; icon: string; title: string; body: string; preview?: { who: string; line: string }[] };

/** Hepsi ücretsiz hesapta kapalı, Plus'ta açık olan özellikler (`PLUS_ONLY_ACTIONS` ve sınav sabahı kâğıdı). */
export const JOURNEY_PLUS_CARDS: JourneyPlusCard[] = [
  {
    id: "podcast",
    icon: "🎧",
    title: "Podcast",
    body: "Mutlak değer tuzağını iki sesli bir sohbet olarak dinle; konuşulan kelime ekranda işaretlenir.",
    preview: [
      { who: "Ada", line: "Kareyle kök birbirini götürür sanıyorsun, değil mi?" },
      { who: "Kerem", line: "Evet… eksi beşin karesinin kökü eksi beş değil mi?" },
      { who: "Ada", line: "Çift dereceli kökten negatif sonuç çıkmaz. Cevap beş." },
    ],
  },
  {
    id: "video",
    icon: "🎬",
    title: "1 dakikalık çizimli video",
    body: "Kök dışına çıkarmayı dikey ekranda, çizim ve formülle izle.",
  },
  {
    id: "oral",
    icon: "🎤",
    title: "Sözlü deneme",
    body: "Kuralı kendi cümlelerinle anlat; cevabın soru soru notlansın.",
  },
  {
    id: "exam",
    icon: "🎯",
    title: "Yazılı deneme ve sınav sabahı kâğıdı",
    body: "Çıkmış soruların tarzında ikiz sınav çöz; formüller ve tuzaklar tek sayfada, yazdır ya da PDF kaydet.",
  },
];

export const JOURNEY_FINAL = {
  title: "Köklü sayıların en çok düşülen tuzağını az önce kendi elinle çözdün.",
  body: "Şimdi ücretsiz hesabını aç; kendi notunu yükle ya da hazır müfredattan başla. İlk dersinin konu anlatımı, kartları, doğru/yanlışı ve konu testi süre sınırı olmadan ücretsiz.",
  cta: "İlk dersimi ücretsiz başlat",
  fine: "Kart istemiyoruz",
} as const;

/* ---------- Saf yardımcılar ---------- */

export function journeyStepIndex(id: JourneyStepId): number {
  return JOURNEY_STEP_IDS.indexOf(id);
}

/** Sıradaki adım; son adımdaysa null. */
export function nextJourneyStep(id: JourneyStepId): JourneyStepId | null {
  return JOURNEY_STEP_IDS[journeyStepIndex(id) + 1] ?? null;
}

/** "Adım 3/7: …" */
export function journeyGuideLine(id: JourneyStepId): string {
  const step = JOURNEY_STEPS[journeyStepIndex(id)]!;
  return `Adım ${journeyStepIndex(id) + 1}/${JOURNEY_STEPS.length}: ${step.guide}`;
}

/**
 * Turun sonucu: ziyaretçinin gerçekten verdiği cevaplardan. Cevaplanmayan soru sayılmaz; hiç cevap yoksa yüzde
 * yazılmaz (uydurma "%100" gösterilmez).
 */
export function journeyScore(input: { questionCorrect: boolean | null; truthCorrect: boolean | null }): {
  correct: number;
  answered: number;
  pct: number | null;
  line: string;
} {
  const results = [input.questionCorrect, input.truthCorrect].filter((value): value is boolean => value !== null);
  const correct = results.filter(Boolean).length;
  const answered = results.length;
  const pct = answered ? Math.round((correct / answered) * 100) : null;
  const line = answered ? `${answered} sorudan ${correct} doğru` : "Soruları atladın; istersen geri dönüp çöz";
  return { correct, answered, pct, line };
}

/** Kayıt bağlantısı seçili hedef kitleyi taşır (`signup-preset.ts`). */
export function journeySignupHref(segment: AudienceSegmentId): `/kayit?hedef=${AudienceSegmentId}` {
  return `/kayit?hedef=${segment}`;
}

/**
 * Ana sayfanın 7 adımlı tanıtım turu (11 Kasım 2026, ürün sahibi: "ziyaretçi sistemi kendi tıklamasıyla baştan
 * sona yaşasın").
 *
 * Misafir örnek bir notu tarama alanına bırakır; yol haritası, ilk ders, soru, kart, doğru/yanlış ve Plus vitrini
 * sırayla açılır. Tur model çağırmaz, ağ isteği atmaz, hiçbir şey yüklemez.
 *
 * Bu dosya turun kendi sözlerini tutar: adımlar, yönlendirme, not ve yol haritası adımı, Plus vitrini, sonuç.
 * Ders, konu testi, kartlar ve doğru/yanlış adımlarının içeriği burada DEĞİL: o adımlarda ürünün kendi ekranı
 * çalışır ve örnek veri ürünün veri biçiminde `lib/demo/guest-tour.ts`te durur (aynı gün, üçüncü tur). Üründe
 * olmayan bir şey gösterilmez. Plus'ta olan her şey "Plus" diye etiketlenir (bekçi `marketing-claims.test.ts`).
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
  { id: "lesson", short: "Ders", title: "Ders ekranın", guide: "Önce dene, sonra kuralı oku; dersi sonuna kadar ilerlet" },
  { id: "question", short: "Soru", title: "Konu testi", guide: "Bir şık seç ve kontrol et; takılırsan iki şık ipucunu aç" },
  { id: "cards", short: "Kart", title: "Akıllı kartlar", guide: "Önce hatırla, karta dokun, sonra kendini değerlendir" },
  { id: "check", short: "D/Y", title: "Doğru / Yanlış", guide: "Önerme doğru mu, yanlış mı?" },
  { id: "plus", short: "Plus", title: "Aynı not, beş yol daha", guide: "İlk dersini ücretsiz başlat" },
];

/** Ürünün kendi ekranıyla oynanan adımlar (`components/landing/tour/product-screens.tsx`). */
export const JOURNEY_PRODUCT_STEPS = ["lesson", "question", "cards", "check"] as const satisfies readonly JourneyStepId[];
export type JourneyProductStep = (typeof JOURNEY_PRODUCT_STEPS)[number];

export function isProductStep(id: JourneyStepId): id is JourneyProductStep {
  return (JOURNEY_PRODUCT_STEPS as readonly JourneyStepId[]).includes(id);
}

export const JOURNEY_COPY = {
  kicker: "Kayıt olmadan dene",
  title: "Bir not, yedi adımda derse dönüşsün",
  /** Dürüstlük notu: bu bir tanıtım turudur; örnek not hazırdır, hiçbir şey yüklenmez. */
  note: "Tanıtım turu: örnek not hazır, hiçbir dosya yüklenmez.",
  restart: "Turu baştan oyna",
  /** Çerçevenin üstündeki söz: içindeki ekran çizim değil, ürünün kendisi. */
  real: "Bu çerçevenin içi çizim değil, ürünün kendi ekranı. Kayıt olunca aynısıyla çalışırsın.",
  loading: "Ekran açılıyor…",
  failed: "Ekran açılamadı.",
  retry: "Tekrar dene",
  skip: "Bu adımı geç",
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

/** Tur bitince (doğru/yanlıştan sonra) görünen sonuç satırı. Ders, soru, kart ve önermelerin kendisi `guest-tour.ts`te. */
export const JOURNEY_RESULT = {
  doneTitle: "1. ders tamamlandı",
  cta: "Plus'ta başka neler var?",
} as const;

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
/**
 * Sonuç halkası ziyaretçinin gerçek cevaplarından: konu testi sorusu (ilk kilitlenen cevap) ve doğru/yanlış
 * önermeleri. Atlanan adım sayılmaz; hiç cevap yoksa yüzde yazılmaz.
 */
export function journeyScore(input: { questionCorrect: boolean | null; truth: { right: number; total: number } | null }): {
  correct: number;
  answered: number;
  pct: number | null;
  line: string;
} {
  const answered = (input.questionCorrect === null ? 0 : 1) + (input.truth?.total ?? 0);
  const correct = (input.questionCorrect ? 1 : 0) + (input.truth?.right ?? 0);
  if (!answered) return { correct: 0, answered: 0, pct: null, line: "Soruları atladın; kayıt olunca kendi notunla dene." };
  return { correct, answered, pct: Math.round((correct / answered) * 100), line: `${answered} sorudan ${correct} doğru` };
}

export function journeySignupHref(segment: AudienceSegmentId): `/kayit?hedef=${AudienceSegmentId}` {
  return `/kayit?hedef=${segment}`;
}

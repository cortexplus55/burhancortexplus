/**
 * Ana sayfanın 7 adımlı canlı kokpiti (11 Kasım 2026).
 *
 * İlk kurgu (sabah, ürün sahibi: "ziyaretçi sistemi kendi tıklamasıyla baştan sona yaşasın"): misafir örnek bir notu
 * tarama alanına bırakır; yol haritası, ilk ders, soru, kart, doğru/yanlış ve Plus vitrini sırayla açılır.
 *
 * Kokpit (gece, canlı denetimden altı kusur): tur artık kahramanın altında ayrı bir bölüm değil, ilk ekranın
 * kendisi. Birinci adım iki kapılıdır: hazır örnek notla turu başlat ya da KENDİ dosyanı bırak. Kendi dosya
 * sunucuya gitmez; tarayıcıda bekler ve kayıttan sonra kurulumda tek dokunuşla eklenir (`guest-handoff.ts`).
 * Plus adımı kuru liste değil: podcast, çizimli video ve sınav sabahı kâğıdının canlı önizlemeleri.
 *
 * Bu dosya kokpitin kendi sözlerini tutar: adımlar, yönlendirme, iki kapı, yol haritası, Plus önizlemeleri, sonuç.
 * Ders, konu testi, kartlar ve doğru/yanlış adımlarının içeriği burada DEĞİL: o adımlarda ürünün kendi ekranı
 * çalışır ve örnek veri ürünün veri biçiminde `lib/demo/guest-tour.ts`te durur. Üründe olmayan bir şey gösterilmez.
 * Plus'ta olan her şey "Plus" diye etiketlenir (bekçi `marketing-claims.test.ts`). Tur model çağırmaz ve hiçbir
 * dosyayı sunucuya göndermez.
 */

import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
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
  { id: "upload", short: "Not", title: "Notunu tarama çekirdeğine bırak", guide: "Örnek notu çekirdeğe sürükle ya da dokun" },
  { id: "roadmap", short: "Yol", title: "Yol haritan çıktı", guide: "1. dersi aç" },
  { id: "lesson", short: "Ders", title: "Ders ekranın", guide: "Önce dene, sonra kuralı oku; dersi sonuna kadar ilerlet" },
  { id: "question", short: "Soru", title: "Konu testi", guide: "Bir şık seç ve kontrol et; takılırsan iki şık ipucunu aç" },
  { id: "cards", short: "Kart", title: "Akıllı kartlar", guide: "Önce hatırla, karta dokun, sonra kendini değerlendir" },
  { id: "check", short: "D/Y", title: "Doğru / Yanlış", guide: "Önerme doğru mu, yanlış mı?" },
  { id: "plus", short: "Plus", title: "Aynı nottan Plus'ta çıkanlar", guide: "Önizlemeleri oynat, sonra ilk dersini ücretsiz başlat" },
];

/** Ürünün kendi ekranıyla oynanan adımlar (`components/landing/tour/product-screens.tsx`). */
export const JOURNEY_PRODUCT_STEPS = ["lesson", "question", "cards", "check"] as const satisfies readonly JourneyStepId[];
export type JourneyProductStep = (typeof JOURNEY_PRODUCT_STEPS)[number];

export function isProductStep(id: JourneyStepId): id is JourneyProductStep {
  return (JOURNEY_PRODUCT_STEPS as readonly JourneyStepId[]).includes(id);
}

export const JOURNEY_COPY = {
  /** Konsolun köşesindeki canlı etiketi. */
  live: "Canlı tur",
  kicker: "Kayıt olmadan dene",
  title: "Bir not, yedi adımda derse dönüşsün",
  restart: "Turu baştan oyna",
  /** Çerçevenin üstündeki söz: içindeki ekran çizim değil, ürünün kendisi. */
  real: "Bu çerçevenin içi çizim değil, ürünün kendi ekranı. Kayıt olunca aynısıyla çalışırsın.",
  loading: "Ekran açılıyor…",
  failed: "Ekran açılamadı.",
  retry: "Tekrar dene",
} as const;

/**
 * Ürün ekranının altındaki parlayan "sıradaki adım" düğmesi. Adım oynanmadan da ilerlenir: ziyaretçi takılmaz,
 * kokpit her adımda bir sonrakine davet eder.
 */
export const JOURNEY_NEXT_LABEL: Record<JourneyProductStep, string> = {
  lesson: "Öğrendiğin kuralı soruda dene",
  question: "Akıllı kartlara geç",
  cards: "Doğru / Yanlış'a geç",
  check: "Plus önizlemelerini gör",
};

/**
 * Hoca uyarısının izi (A4, 13 Kasım 2026). Taramadan sonra (2-7. adımlar) başlığın yanında kalıcı bir etiket durur;
 * yeni söz yok: etiket ve açıklaması örnek notun uyarı satırından (`SAME_NOTE_CASE`).
 */
export const JOURNEY_WARNING = {
  label: SAME_NOTE_CASE.input.lines[0].split(":")[0]!.trim(),
  line: SAME_NOTE_CASE.input.lines[0],
} as const;

/**
 * Uyarıdan çıkan adımlar: bu adıma girilince etiketin çerçevesi logonun şeridiyle bir kez (600 ms) parlar. Liste
 * örnek veriden türetilir (`tourWarningSteps`, `guest-tour.ts`); örnek veri ilk yükte olmasın diye burada sabit
 * durur, bekçi test ikisinin aynı olduğunu tutar.
 */
export const JOURNEY_WARNING_STEPS: readonly JourneyStepId[] = ["lesson", "question", "cards", "check"];

/* ---------- 1. Not: iki kapı ---------- */

/** Örnek notun sayfa sayısı: kartın alt satırı ve tarama anının ilk bulgusu aynı sayıdan. */
const SAMPLE_PAGES = 6;

/** A kapısı: hazır örnek not. Kart çekirdeğe sürüklenir ya da dokunulur; tarama anı oynar ve yol açılır. */
export const JOURNEY_FILE = {
  name: SAME_NOTE_CASE.input.file,
  /** "Örnek not" yazılı: ziyaretçi bunun hazır bir örnek olduğunu bilir. */
  meta: `Örnek not · Matematik · ${SAMPLE_PAGES} sayfa`,
  sampleCta: "Örnek notla başlat",
  zoneTitle: "Cortex tarama çekirdeği",
  zoneHint: "Örnek notu ya da kendi dosyanı buraya bırak",
  scanning: ["Sayfalar taranıyor…", "Formüller ve sınav tuzakları çıkarılıyor…"],
  /**
   * Tarama anı (A2, 13 Kasım 2026): 2,4 sn. Not çekirdeğe kayar, halkalar bir kez atar, bulgular sırayla belirir, sonra
   * yol açılır. Tıklama ya da tuş atlar; hareket azaltmada beklenmez (depo kararı 11).
   */
  scanMs: 2400,
} as const;

/**
 * B kapısı: misafirin kendi dosyası. Dosya sunucuya GÖNDERİLMEZ: tarayıcıda (sekme oturumu + IndexedDB) bekler,
 * kayıttan sonra kurulumun materyal adımında "Bu dosyayı ekle" diye sunulur. Tarayıcı saklamaya izin vermezse
 * kart bunu söyler (verilmeyen söz yok).
 */
export const JOURNEY_OWN = {
  title: "Kendi notun mu var?",
  hint: "PDF, Word, slayt ya da fotoğrafını bırak; dosyan cihazından çıkmaz.",
  pick: "Kendi notunu seç",
  kept: "Dosyan bu cihazda bekliyor; hiçbir yere gönderilmedi. Hesabını açınca kurulumda tek dokunuşla eklenir.",
  notKept: "Dosyan seçildi ama tarayıcın saklamaya izin vermedi; hesabını açınca aynı dosyayı bir kez daha seçeceksin.",
  body: `Bu belgeden ilk dersin, akıllı kartların ve konu testin yazılsın. İlk dersin süre sınırı olmadan ücretsiz; ücretsiz hesapta toplam ${FREE_PAGE_TOTAL} sayfa belge işlenir.`,
  cta: "Ücretsiz hesabımı aç, bu belgeyle başla",
  playSample: "Önce örnek turu oyna",
  remove: "Dosyayı kaldır",
  fine: "Kart istemiyoruz",
  /** Dosya bekliyorken adım satırı: ekranda artık örnek not ve çekirdek yok, onları anlatan cümle yanıltır. */
  guide: "Dosyan hazır; hesabını aç ya da önce örnek turu oyna",
} as const;

/** Onay kartının başlığı: tek dosyada adıyla, birden çok dosyada sayısıyla. */
export function ownReadyTitle(names: readonly string[]): string {
  if (names.length === 1) return `“${names[0]}” taramaya hazır!`;
  return `${names.length} dosya taramaya hazır!`;
}

/**
 * Tarama anında sırayla belirenler (A2). Yeni cümle yok: sayfa sayısı kartın alt satırından, konu sayısı yol
 * haritasının satır sayısından, hocanın uyarısı ve şekil satırı "Aynı not" kartındaki aynı notun satırlarından
 * (`SAME_NOTE_CASE`). Bekçi test sayıların fikstürle aynı olduğunu tutar.
 */
export function journeyScanFindings(): { id: "pages" | "topics" | "warning" | "figure"; text: string }[] {
  const [warning, figure] = SAME_NOTE_CASE.input.lines;
  return [
    { id: "pages", text: `${SAMPLE_PAGES} sayfa` },
    { id: "topics", text: `${JOURNEY_ROADMAP.days.length} konu` },
    { id: "warning", text: warning },
    { id: "figure", text: figure },
  ];
}

/* ---------- 2. Yol haritası ---------- */

export const JOURNEY_ROADMAP = {
  days: [
    { day: "1. gün", title: "Köklü ifadelerin tanımı ve çift derece kuralı", ready: true, meta: "Hazır · 5 dk" },
    { day: "2. gün", title: "Sayıyı kök dışına çıkarma ve kök içine alma", ready: false, meta: "" },
    { day: "3. gün", title: "Köklü sayılarda toplama, çıkarma ve çarpma", ready: false, meta: "" },
    { day: "4. gün", title: "Eşlenik ve paydayı rasyonel yapma", ready: false, meta: "" },
    { day: "5–7. gün", title: "İç içe kökler, konu testi ve genel tekrar", ready: false, meta: "" },
  ],
  cta: "Şimdi 1. dersi aç",
} as const;

/** Yol haritasının hedef çipleri: ilk çip seçili sekmenin sınav sözüyle başlar ("Vizene 7 gün var"). */
export function journeyGoals(examWord: string): string[] {
  return [`${examWord} 7 gün var`, "Günde 30 dk", "Hedef: 95+"];
}

/* ---------- 3-6. Ürün ekranları ---------- */

/** Tur bitince (doğru/yanlıştan sonra) görünen sonuç satırı. Ders, soru, kart ve önermelerin kendisi `guest-tour.ts`te. */
export const JOURNEY_RESULT = {
  doneTitle: "1. ders tamamlandı",
  cta: "Plus önizlemelerini gör",
} as const;

/* ---------- 7. Plus: canlı önizlemeler ---------- */

export const JOURNEY_PLUS_PREVIEW_IDS = ["podcast", "video", "sheet"] as const;
export type JourneyPlusPreviewId = (typeof JOURNEY_PLUS_PREVIEW_IDS)[number];

export type JourneyPlusPreview = {
  id: JourneyPlusPreviewId;
  icon: string;
  /** Önizleme seçicideki kısa ad. */
  tab: string;
  title: string;
  body: string;
  /** Dürüstlük notu: önizlemenin neyin kesiti olduğu. */
  note: string;
};

/**
 * Üçü de ücretsiz hesapta kapalı, Plus'ta açık (`PLUS_ONLY_ACTIONS` ve sınav sabahı kâğıdı). Önizlemeler ürünün
 * kendi parçalarıyla çizilir (`tour/plus-previews.tsx`): podcast gerçek bir bölümün sesinden kısa bir kesit, video
 * ürünün çizim tahtası, kâğıt ürünün derleyicisinin turdaki örnek dersten çıkardığı sayfa.
 */
export const JOURNEY_PLUS_PREVIEWS: JourneyPlusPreview[] = [
  {
    id: "podcast",
    icon: "🎧",
    tab: "Podcast",
    title: "İki sesli podcast: Ada ve Kerem",
    body: "Notun iki kişilik bir sohbete dönüşür; okunan kelime ekranda işaretlenir.",
    note: "Gerçek bir bölümden kesit (fotosentez ders notu). Senin notundan da böyle bir bölüm yazılır ve seslendirilir.",
  },
  {
    id: "video",
    icon: "🎬",
    tab: "Çizimli video",
    title: "1 dakikalık çizimli video (dikey 9:16)",
    body: "Kural tahtada adım adım çizilir, alt yazı anlatımla birlikte akar.",
    note: "Sessiz önizleme: tahta ürünün kendi oynatıcısından. Gerçek videoda anlatım sesi de var.",
  },
  {
    id: "sheet",
    icon: "⚡",
    tab: "Sınav sabahı kâğıdı",
    title: "Sınav sabahı kâğıdı ve İkiz Sınav",
    body: "Formüller ve sınav tuzakları tek sayfada; yazdır ya da PDF kaydet. Çıkmış sorularını yüklersen onların tarzında İkiz Sınav çözersin.",
    note: "Bu kâğıt turdaki örnek dersten, ürünün kendi derleyicisiyle çıkarıldı.",
  },
];

/** Önizlemesi olmayan öbür Plus özellikleri: tek satır. */
export const JOURNEY_PLUS_ALSO = "Plus'ta ayrıca: sözlü deneme, yazılı deneme, bütün konular ve belgenin tamamı.";

export const JOURNEY_PLUS_PLAY = {
  podcast: "15 saniyelik kesiti oynat",
  video: "Sahneyi oynat",
  pause: "Duraklat",
  replay: "Baştan oynat",
  /** Ses yüklenemezse: görsel akış sürer, gerçek bölümün yeri söylenir. */
  silent: "Ses yüklenemedi; kelimeler sessiz akıyor. Tam bölüm örnek ders sayfasında.",
} as const;

export const JOURNEY_FINAL = {
  title: "İlk dersinin konu anlatımı, kartları, doğru/yanlışı ve konu testi süre sınırı olmadan ücretsiz.",
  body: "Ücretsiz hesabını aç; kendi notunu yükle ya da hazır müfredattan başla.",
  cta: "Şimdi kendi notunla başla",
  /** Misafir birinci adımda kendi dosyasını bıraktıysa. */
  ctaWithDocument: "Hesabımı aç, belgemle başla",
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

/** "Adım 3/7: …". Birinci adımda misafirin kendi dosyası bekliyorsa satır onu anlatır. */
export function journeyGuideLine(id: JourneyStepId, options: { ownDocument?: boolean } = {}): string {
  const step = JOURNEY_STEPS[journeyStepIndex(id)]!;
  const guide = id === "upload" && options.ownDocument ? JOURNEY_OWN.guide : step.guide;
  return `Adım ${journeyStepIndex(id) + 1}/${JOURNEY_STEPS.length}: ${guide}`;
}

/**
 * Sonuç halkası ziyaretçinin gerçek cevaplarından: konu testi sorusu (ilk kilitlenen cevap) ve doğru/yanlış
 * önermeleri. Atlanan adım sayılmaz; hiç cevap yoksa yüzde yazılmaz (uydurma "%100" gösterilmez).
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

/** Misafirin dosyasıyla kayıt olan öğrenci kayıt bitince buraya gelir; dosya kurulumun materyal adımında bekler. */
export const GUEST_DOCUMENT_NEXT = "/deneme-sinavlari/olustur";

/**
 * Kayıt bağlantısı. Misafir kendi dosyasını bıraktıysa (`withDocument`) bağlantı `kaynak=belge` taşır ve kayıt
 * bitince kuruluma götürür.
 */
export function journeySignupHref(segment: AudienceSegmentId, options: { withDocument?: boolean } = {}): string {
  if (!options.withDocument) return `/kayit?hedef=${segment}`;
  return `/kayit?hedef=${segment}&kaynak=belge&next=${encodeURIComponent(GUEST_DOCUMENT_NEXT)}`;
}

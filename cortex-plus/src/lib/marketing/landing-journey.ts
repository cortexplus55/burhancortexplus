/**
 * Ana sayfanın 7 adımlı canlı kokpiti (11 Kasım 2026).
 *
 * İlk kurgu (sabah, ürün sahibi: "ziyaretçi sistemi kendi tıklamasıyla baştan sona yaşasın"): misafir örnek bir notu
 * tarama alanına bırakır; yol haritası, ilk ders, soru, kart, doğru/yanlış ve Plus vitrini sırayla açılır.
 *
 * Kokpit (gece, canlı denetimden altı kusur): tur artık kahramanın altında ayrı bir bölüm değil, ilk ekranın
 * kendisi. Birinci adım iki kapılıdır: hazır örnek notla turu başlat ya da KENDİ dosyanı bırak. Kendi dosya
 * sunucuya gitmez; tarayıcıda bekler ve giriş ya da kayıttan sonra kurulum sihirbazına kendiliğinden aktarılır (`guest-handoff.ts`).
 * Plus adımı kuru liste değil: podcast, çizimli video ve sınav sabahı kâğıdının canlı önizlemeleri.
 *
 * Bu dosya kokpitin kendi sözlerini tutar: adımlar, yönlendirme, iki kapı, yol haritası, Plus önizlemeleri, sonuç.
 * Ders, konu testi, kartlar ve doğru/yanlış adımlarının içeriği burada DEĞİL: o adımlarda ürünün kendi ekranı
 * çalışır ve örnek veri ürünün veri biçiminde `lib/demo/guest-tour.ts`te durur. Üründe olmayan bir şey gösterilmez.
 * Plus'ta olan her şey "Plus" diye etiketlenir (bekçi `marketing-claims.test.ts`). Tur model çağırmaz ve hiçbir
 * dosyayı sunucuya göndermez.
 *
 * Faz 7 (20 Kasım 2026): tur seçilen branşın örnek notuyla oynanır (`guest-demo-tracks.ts`). Branşa bağlı sözler
 * (dosya, sayfa, bulgular, yol, uyarı, Plus önizlemelerinin notu) branş alan işlevlerden gelir; `JOURNEY_FILE`,
 * `JOURNEY_ROADMAP`, `JOURNEY_WARNING` ve `JOURNEY_PLUS_PREVIEWS` lise branşının değerleridir (öteden beri oynanan örnek).
 *
 * Faz 9 (20 Kasım 2026, ürün sahibi: "birinci adımda üç kutu yarışıyor"): ana sayfadaki birinci adım TEK kart ("Akıllı
 * Not Stüdyosu"): üstte yedi adımlık ray, ortada bırakma alanı (örnek notun rozeti + tek cümle), altta iki düğme
 * (örnek notla turu izle / kendi notunu seç). Canlı rozeti, konsol başlığı, bağlam satırı ve branş şeridi kalktı; branş
 * kahramanın tek seçicisinden gelir.
 *
 * Faz 9.1 (20 Kasım 2026, ürün sahibi tek kartı geri çevirdi): birinci adım "Çekirdeğe bırak". Kart ve iki düğme
 * kalktı; örnek not kâğıt kart olarak ders çekirdeğine sürüklenir (ya da dokunulur), tarama ana sayfada olur,
 * "Sınavın ne zaman?" sorulur (`JOURNEY_EXAM_DAYS`), gün seçilince çekirdekten ilk ders doğar: üç kart (`JOURNEY_OUTPUTS`,
 * "hazır") ve günlere yayılmış küçük yol (`journeyDayPlan`). Bileşen `components/landing/lesson-core.tsx`.
 */

import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { DEMO_PODCASTS } from "@/lib/demo/demo-podcasts";
import { GUEST_DOCUMENT_NEXT } from "@/lib/documents/guest-handoff";
import {
  DEFAULT_GUEST_TRACK,
  GUEST_DEMO_TRACKS,
  guestDemoTrack,
  trackHasPodcast,
  trackWarningLabel,
  type GuestDemoRoadmapDay,
  type GuestTrackId,
} from "@/lib/marketing/guest-demo-tracks";
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
  { id: "upload", short: "Not", title: "Notunu tarama çekirdeğine bırak", guide: "Örnek notu ders çekirdeğine götür ya da kendi notunu bırak" },
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
  /** Ana sayfadaki birinci adımın adı (Faz 9.1): bölümün başlığı, ekranda gizli, ekran okuyucuda okunur. */
  card: "Notunu ders çekirdeğine bırak",
  /** Tam ekran stüdyonun adı (iletişim penceresinin ekran okuyucu adı). */
  title: "Bir not, yedi adımda derse dönüşsün",
  restart: "Turu baştan oyna",
  /** Tam ekran stüdyonun kapatma düğmesi (ekran okuyucu adı; görünen ✕). */
  close: "Kapat",
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
 * yeni söz yok: etiket ve açıklaması örnek notun uyarı satırından (lise: `SAME_NOTE_CASE`). Faz 7: her branşın
 * örnek notunun kendi uyarısı ("Hoca uyarısı", "TUS spotu", "Sınav tuzağı").
 */
export function journeyWarning(track: GuestTrackId): { label: string; line: string } {
  return { label: trackWarningLabel(track), line: guestDemoTrack(track).warning };
}

export const JOURNEY_WARNING = journeyWarning(DEFAULT_GUEST_TRACK);

/**
 * Uyarıdan çıkan adımlar: bu adıma girilince etiketin çerçevesi logonun şeridiyle bir kez (600 ms) parlar. Liste
 * örnek veriden türetilir (`guestTourWarningSteps`, `guest-tour-tracks.ts`); örnek veri ilk yükte olmasın diye burada
 * sabit durur, bekçi test dört branşta da ikisinin aynı olduğunu tutar.
 */
export const JOURNEY_WARNING_STEPS: readonly JourneyStepId[] = ["lesson", "question", "cards", "check"];

/* ---------- 1. Not: Akıllı Not Stüdyosu kartı ---------- */

/**
 * A: hazır örnek not (Faz 9.1, ürün sahibinin seçimi "Çekirdeğe bırak"). Ana sayfada örnek notun kâğıt kartı tutulup
 * ders çekirdeğine götürülür; çekirdeğe yaklaşınca mıknatıs gibi oturur ve bırakılınca içine çekilir. Kartın kendisi
 * bir düğmedir: dokunmak ya da Enter / Space sürükleyip bırakmakla aynı işi yapar (çekirdeğe dokunmak da).
 */
export const JOURNEY_FILE = {
  name: GUEST_DEMO_TRACKS.lise.file,
  /** Kartın sayfa satırı ("6 sayfa"). */
  pagesLabel: `${GUEST_DEMO_TRACKS.lise.pages} sayfa`,
  /** Kartın ekran okuyucu adının başı (görünen yazı arkasından gelir). */
  send: "Örnek notu çekirdeğe gönder",
  /** Kartın altındaki küçük yazı. */
  grip: "Tut ve sürükle",
  /** Çekirdeğin ekran okuyucu adının başı. */
  coreName: "Ders çekirdeği",
  coreLabel: "Notunu buraya bırak",
  /** Not çekirdeğe yaklaşınca (mıknatıs) ya da üstünde dosya tutulurken. */
  coreNear: "Bırak",
  /** Not çekirdeğe girdikten sonra çekirdeğin altındaki yazı: tarama ve dersin doğuşu. */
  coreScanned: "Not tarandı",
  coreBorn: "İlk ders hazır",
  /** Yön ipucu: geniş ekranda not solda, çekirdek sağda; telefonda not üstte, çekirdek altta. */
  hintWide: "Notu tut, çekirdeğe götür",
  hintNarrow: "Aşağı sürükle ya da çekirdeğe dokun",
  /** Not çekirdeğe çekilirken (an): kart küçülerek içine girer. */
  absorbMs: 280,
  /**
   * Tarama bulguları sırayla belirir (an, 1,2 sn). Tıklama ya da tuş atlar; hareket azaltmada beklenmez (depo kararı
   * 11). Bulgular görünüp sınav günü seçilince ders doğar.
   */
  findingsMs: 1200,
} as const;

/** Seçili branşın örnek notu: dosya adı ve sayfa satırı. */
export function journeyFile(track: GuestTrackId): typeof JOURNEY_FILE {
  const item = guestDemoTrack(track);
  return { ...JOURNEY_FILE, name: item.file, pagesLabel: `${item.pages} sayfa` };
}

/**
 * B: misafirin kendi dosyası (örnek notun altındaki küçük yuva ya da çekirdeğe bırakılan dosya). Dosya sunucuya
 * GÖNDERİLMEZ: tarayıcıda (sekme oturumu + IndexedDB) bekler, kayıttan sonra kurulumun materyal adımında "Bu dosyayı
 * ekle" diye sunulur. Tarayıcı saklamaya izin vermezse kart bunu söyler (verilmeyen söz yok).
 */
export const JOURNEY_OWN = {
  /** Örnek notun altındaki kesikli yuva: dokununca dosya seçici açılır, üstüne dosya bırakılabilir. */
  pick: "Kendi notunu bırak",
  /** Yuvanın ikinci satırı: misafirin bırakabileceği türler (kahramandan taşındı; ürünün okuduğu türler). */
  types: "PDF, slayt, Word ya da defter fotoğrafı",
  kept: "Dosyan bu cihazda bekliyor; hiçbir yere gönderilmedi. Hesabını açınca ya da giriş yapınca kurulum sihirbazına kendiliğinden aktarılır.",
  notKept: "Dosyan seçildi ama tarayıcın saklamaya izin vermedi; hesabını açınca aynı dosyayı bir kez daha seçeceksin.",
  body: `Bu belgeden ilk dersin, akıllı kartların ve konu testin yazılsın. İlk dersin süre sınırı olmadan ücretsiz; ücretsiz hesapta toplam ${FREE_PAGE_TOTAL} sayfa belge işlenir.`,
  cta: "Ücretsiz hesabımı aç, bu belgeyle başla",
  playSample: "Önce örnek turu oyna",
  remove: "Dosyayı kaldır",
  fine: "Kart istemiyoruz",
  /** Hesabı olan misafir (Faz 5 §1.3): girişten sonra da dosya kurulum sihirbazına aktarılır. */
  login: "Hesabın var mı? Giriş yap, dosyan kurulumda seni beklesin",
  /** Dosya bekliyorken adım satırı: ekranda artık örnek not ve çekirdek yok, onları anlatan cümle yanıltır. */
  guide: "Dosyan hazır; hesabını aç ya da önce örnek turu oyna",
} as const;

/** Onay kartının başlığı: tek dosyada adıyla, birden çok dosyada sayısıyla. */
export function ownReadyTitle(names: readonly string[]): string {
  if (names.length === 1) return `“${names[0]}” taramaya hazır!`;
  return `${names.length} dosya taramaya hazır!`;
}

/**
 * Tarama anında sırayla belirenler (A2). Yeni cümle yok: sayfa sayısı kartın alt satırından, konu sayısı yolun
 * konularından, uyarı ve şekil satırı örnek notun satırlarından (lise: "Aynı not" kartındaki aynı notun satırları,
 * `SAME_NOTE_CASE`). Bekçi test sayıların fikstürle aynı olduğunu tutar.
 */
export function journeyScanFindings(track: GuestTrackId = DEFAULT_GUEST_TRACK): { id: "pages" | "topics" | "warning" | "figure"; text: string }[] {
  const item = guestDemoTrack(track);
  return [
    { id: "pages", text: `${item.pages} sayfa` },
    { id: "topics", text: `${item.units.length} konu` },
    { id: "warning", text: item.warning },
    { id: "figure", text: item.figure },
  ];
}

/* ---------- 1b. Sınav günü ve dersin doğuşu (Faz 9.1) ---------- */

/** Tarama sürerken sorulan sınav günü: dört seçenek. Seçilen gün stüdyodaki "Sınavına N gün var" çipine de yazılır. */
export const JOURNEY_EXAM_DAYS = [3, 7, 14, 30] as const;
export type JourneyExamDays = (typeof JOURNEY_EXAM_DAYS)[number];
/** Gün seçilmeden stüdyo açılırsa (raydan) çipin günü. */
export const DEFAULT_EXAM_DAYS: JourneyExamDays = 7;

export function isJourneyExamDays(value: unknown): value is JourneyExamDays {
  return typeof value === "number" && (JOURNEY_EXAM_DAYS as readonly number[]).includes(value);
}

export const JOURNEY_DATE = {
  title: "Sınavın ne zaman?",
  chip: (days: JourneyExamDays) => `${days} gün`,
  /** Dersin doğuşunun birincil düğmesi: stüdyoyu doğrudan dersin ilk ekranında açar. */
  cta: "İlk ekranı aç",
  planTitle: (days: JourneyExamDays) => `${days} günlük yolun`,
  /** Ekran okuyucunun duyuruları: not tarandı ve gün soruluyor; ders doğdu. */
  scanned: "Not tarandı. Sınavın ne zaman?",
  born: (days: JourneyExamDays) => `İlk ders hazır: ders, konu testi ve kartlar. ${days} günlük yolun altında.`,
} as const;

export type JourneyOutput = { id: "lesson" | "question" | "cards"; title: string; meta: string };

/**
 * Çekirdekten doğan üç kart (Faz 9.1, ürün sahibinin kararı: "sayı yerine hazır"). Örnek notun turdaki içeriği bir
 * dilim (2 bölüm, 1 soru, 2 kart); o küçük sayılar yazılmaz, gerçek notta çıkacak bir sayı da iddia edilmez. Kartlar
 * yalnız neyin hazır olduğunu söyler; ders, örnek bölüm olduğunu açıkça yazar.
 */
export const JOURNEY_OUTPUTS: readonly JourneyOutput[] = [
  { id: "lesson", title: "Ders", meta: "Hazır · örnek bölüm" },
  { id: "question", title: "Konu testi", meta: "Hazır" },
  { id: "cards", title: "Kartlar", meta: "Hazır" },
];

export type JourneyDayRow = { when: string; steps: string[] };

/** Bugün 1. gün; "Bugün", "Yarın", sonra "N. gün". */
function dayLabel(day: number): string {
  if (day === 1) return "Bugün";
  if (day === 2) return "Yarın";
  return `${day}. gün`;
}

/**
 * Seçilen güne göre küçük yol: ilk dersin döngüsü (ders, konu testi, kartlar, doğru/yanlış) ve sınav sabahı kartlarla
 * tekrar. Hepsi ücretsiz hesapta da açık adımlar (ilk dersin temel döngüsü, `first-lesson-cycle.ts`): sınav sabahı
 * kâğıdı ve "Kartlarla son tekrar" (hazırlık geneli adım) Plus'ta olduğu için burada yok.
 *
 * - 3 gün: sıkışır (ilk iki gün ikişer adım).
 * - 7 gün ve üstü: her adım ayrı gün; testler ilk iki günde, kartlar ve doğru/yanlış süreye yayılır (14 ve 30 günde
 *   aralar açılır). Son adım sınavdan önceki son çalışma gününü geçmez.
 */
export function journeyDayPlan(days: JourneyExamDays): JourneyDayRow[] {
  const morning: JourneyDayRow = { when: "Sınav sabahı", steps: ["Kartlarla tekrar"] };
  if (days <= 3) {
    return [
      { when: dayLabel(1), steps: ["Ders", "Konu testi"] },
      { when: dayLabel(2), steps: ["Kartlar", "Doğru/Yanlış"] },
      morning,
    ];
  }
  const cards = Math.max(3, Math.round(days * 0.4));
  const truth = Math.min(days, Math.max(cards + 1, Math.round(days * 0.7)));
  return [
    { when: dayLabel(1), steps: ["Ders"] },
    { when: dayLabel(2), steps: ["Konu testi"] },
    { when: dayLabel(cards), steps: ["Kartlar"] },
    { when: dayLabel(truth), steps: ["Doğru/Yanlış"] },
    morning,
  ];
}

/* ---------- 2. Yol haritası ---------- */

const ROADMAP_CTA = "Şimdi 1. dersi aç";

/** Seçili branşın yol haritası: konular gün gün, ilk gün hazır ders. */
export function journeyRoadmap(track: GuestTrackId): { days: readonly GuestDemoRoadmapDay[]; cta: string } {
  return { days: guestDemoTrack(track).days, cta: ROADMAP_CTA };
}

export const JOURNEY_ROADMAP = journeyRoadmap(DEFAULT_GUEST_TRACK);

/**
 * Yol haritasının hedef çipleri: ilk çip seçili profilin sınav sözüyle ve birinci adımda seçilen günle başlar
 * ("Vizene 14 gün var"); gün seçilmediyse 7.
 */
export function journeyGoals(examWord: string, days: JourneyExamDays = DEFAULT_EXAM_DAYS): string[] {
  return [`${examWord} ${days} gün var`, "Günde 30 dk", "Hedef: 95+"];
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
    note: "Gerçek bir bölümden kesit (bu turdaki Köklü Sayılar dersi). Senin notundan da böyle bir bölüm yazılır ve seslendirilir.",
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

/** Çizimli video önizlemesinin gövdesi, branşın sahnesine göre (lise: ürünün çizim tahtası; öbürleri branşa özel şema). */
const VIDEO_BODY: Record<GuestTrackId, string> = {
  lise: JOURNEY_PLUS_PREVIEWS[1]!.body,
  muhendislik: "Kuvvet diyagramı adım adım çizilir, alt yazı anlatımla birlikte akar.",
  tus: "Kanal blokajının mekanizma zinciri adım adım çizilir, alt yazı anlatımla birlikte akar.",
  hukuk: "Karar ağacı ve çoğunluk barometresi adım adım çizilir, alt yazı anlatımla birlikte akar.",
};

/**
 * Seçili branşın Plus önizlemeleri. Podcast kesitleri yalnız `DEMO_PODCASTS`tan: kesiti olmayan branşta podcast
 * önizlemesi hiç gösterilmez (yer tutucu ya da "yakında" yazısı yok). Podcast notu kesitin ünitesini anar.
 */
export function journeyPlusPreviews(track: GuestTrackId): JourneyPlusPreview[] {
  const [podcast, video, sheet] = JOURNEY_PLUS_PREVIEWS as [JourneyPlusPreview, JourneyPlusPreview, JourneyPlusPreview];
  const clip = DEMO_PODCASTS[track];
  return [
    ...(clip && trackHasPodcast(track)
      ? [{ ...podcast, note: `Gerçek bir bölümden kesit (bu turdaki ${clip.unit} dersi). Senin notundan da böyle bir bölüm yazılır ve seslendirilir.` }]
      : []),
    { ...video, body: VIDEO_BODY[track] },
    sheet,
  ];
}

/** Önizlemesi olmayan öbür Plus özellikleri: tek satır. */
export const JOURNEY_PLUS_ALSO = "Plus'ta ayrıca: sözlü deneme, yazılı deneme, bütün konular ve belgenin tamamı.";

export const JOURNEY_PLUS_PLAY = {
  podcast: "15 saniyelik kesiti oynat",
  video: "Sahneyi oynat",
  pause: "Duraklat",
  replay: "Baştan oynat",
  /** Faz 7: tur sahnesi küçük çizildiği için videoyu ekrana sığan en büyük boyutta açar. */
  enlarge: "Büyüt",
  shrink: "Küçült",
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

/** Misafirin dosyasıyla kayıt olan öğrenci kayıt bitince buraya gelir; dosya kurulumun materyal adımında kendiliğinden eklenir. */
export { GUEST_DOCUMENT_NEXT };

/**
 * Kayıt bağlantısı. Misafir kendi dosyasını bıraktıysa (`withDocument`) bağlantı `kaynak=belge` taşır ve kayıt
 * bitince kuruluma götürür.
 */
/** Dosyası bekleyen misafirin giriş bağlantısı (Faz 5 §1.3): giriş bitince kurulum sihirbazına. */
export function journeyLoginHref(): string {
  return `/giris?kaynak=belge&next=${encodeURIComponent(GUEST_DOCUMENT_NEXT)}`;
}

export function journeySignupHref(segment: AudienceSegmentId, options: { withDocument?: boolean } = {}): string {
  if (!options.withDocument) return `/kayit?hedef=${segment}`;
  return `/kayit?hedef=${segment}&kaynak=belge&next=${encodeURIComponent(GUEST_DOCUMENT_NEXT)}`;
}

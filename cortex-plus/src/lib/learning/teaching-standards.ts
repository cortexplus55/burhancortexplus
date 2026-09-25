/**
 * Stage 5 — shared teaching-standard contract for pdf_learning_v2.
 * Schemas, prompt constraints, and deterministic pedagogy validators.
 * Legacy paths stay untouched when the flag is OFF.
 */

import { z } from "zod";
import { diagramIssues, lessonDiagramSchema } from "@/lib/learning/lesson-diagram";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { foldTr } from "@/lib/documents/page-analysis";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import type { PodcastChapter } from "@/lib/learning/podcast-script";
import {
  acceptReviewVariant,
  reviewQuestionFor,
  type MaterialLanguage,
} from "@/lib/learning/teacher-brain";

export type TeachingActivity =
  | "intro_qa"
  | "lesson"
  | "quiz"
  | "true_false"
  | "podcast"
  | "flashcards"
  | "oral"
  | "written";

export type SessionTeachingMeta = {
  topicId?: string;
  topicTitle?: string;
  objective?: string;
  sourcePages?: number[];
  durationMinutes?: number;
  role?: "learn" | "practice" | "review" | "mock";
  calendarDate?: string;
};

export type MisconceptionDraft = {
  claim: string;
  corrected: string | null;
  wrongType: string;
  sourceKind: string;
  topicLabel: string | null;
  questionPreview: string | null;
};

const META_OPTIONS =
  /^(hepsi|hiçbiri|all of the above|none of the above|yukarıdakilerin hepsi|yukarıdakilerin hiçbiri)/i;

const VAGUE_TF =
  /\b(her zaman|asla|hiçbir zaman|kesinlikle|mutlaka|genelde|çoğu zaman|bazen|her şey|herkes)\b/i;

/** Map exam-prep node kinds onto teaching activities. */
export function teachingActivityForKind(kind: PlanNodeKind): TeachingActivity {
  if (kind === "qa") return "intro_qa";
  if (kind === "lesson") return "lesson";
  if (kind === "podcast") return "podcast";
  if (kind === "true_false") return "true_false";
  if (kind === "oral") return "oral";
  if (kind === "flashcards" || kind === "spaced") return "flashcards";
  if (kind === "written_exam") return "written";
  return "quiz";
}

export function parseSessionMeta(raw: unknown): SessionTeachingMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const sourcePages = Array.isArray(row.sourcePages)
    ? row.sourcePages.filter((n): n is number => typeof n === "number" && n > 0)
    : undefined;
  const role =
    row.role === "learn" ||
    row.role === "practice" ||
    row.role === "review" ||
    row.role === "mock"
      ? row.role
      : undefined;
  return {
    topicId: typeof row.topicId === "string" ? row.topicId : undefined,
    topicTitle: typeof row.topicTitle === "string" ? row.topicTitle : undefined,
    objective: typeof row.objective === "string" ? row.objective : undefined,
    sourcePages,
    durationMinutes:
      typeof row.durationMinutes === "number" ? row.durationMinutes : undefined,
    role,
    calendarDate: typeof row.calendarDate === "string" ? row.calendarDate : undefined,
  };
}

/** Bind topic / objective / pages into the generation prompt (Stage 2–4 meta). */
export function teachingSessionContext(
  meta: SessionTeachingMeta | null,
  topicLabel: string,
): string {
  const topic = meta?.topicTitle?.trim() || topicLabel;
  const objective = meta?.objective?.trim();
  const pages = meta?.sourcePages?.length
    ? `Kaynak sayfalar: ${meta.sourcePages.join(", ")}.`
    : "";
  const role = meta?.role ? `Oturum rolü: ${meta.role}.` : "";
  const duration =
    typeof meta?.durationMinutes === "number"
      ? `Hedef süre: ~${meta.durationMinutes} dk.`
      : "";
  return [
    `Öğretim konusu: ${topic}.`,
    objective ? `Öğrenme hedefi: ${objective}.` : "",
    pages,
    role,
    duration,
    "Yalnızca bu konu ve hedefe bağlı kal; başka konulara sapma.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Prompt constraints per §7 activity type. */
export function teachingStandardConstraints(activity: TeachingActivity): string {
  switch (activity) {
    case "intro_qa":
      return (
        "Soru-cevap öğretimi: tek kavram/problemle başla. Öğrenci düşünmeden cevabı verme. " +
        "Yanlışı sınıflandır (tanım / işlem / kavram yanılgısı). İpuçlarını kademeli ver. " +
        "Doğru sonra kısa kavram kontrolü. Döngüde sıkıştırma: yeterince deneme veya " +
        "öğrenci isterse çözümü göster. Her soruda learningObjective ve misconceptionTag yaz. " +
        "Açıklama en az bir yanlış şıkkın gerçekte ne olduğunu söylesin. Filler yok."
      );
    case "lesson":
      return (
        "Ders şunları kapsamalı: öğrenme hedefi, konuyu açan anlatım, kaynağa dayalı " +
        "çözümlü örnek, gerekirse adımlar, yaygın hata (commonMistake), bilgi kontrolü " +
        "(infoCheck), kapanış ve sonraki adım. " +
        // Bu maddeler bölüm BAŞLIĞI olarak kopyalanıyordu: üretilen bir derste
        // başlıklar "Kısa Açıklama / Kaynağa Dayalı Örnek / Yaygın Hata / Orta
        // Bilgi Kontrolü / Kısa Kapanış" çıktı. Öğrenci başlıktan ne
        // öğreneceğini değil, ders şablonunun iskeletini görüyor.
        "BÖLÜM BAŞLIKLARI KONUNUN KENDİSİNDEN GELSİN: o bölümde ne öğretiliyorsa onu " +
        "adlandır (ör. \"Su Tablası Yükselince Ne Değişir\", \"Ayrışma Türleri\"). " +
        "\"Kısa açıklama\", \"Kaynağa dayalı örnek\", \"Yaygın hata\", \"Bilgi kontrolü\", " +
        "\"Kapanış\", \"Giriş\", \"Bölüm 1\" gibi yapı adlarını başlık yapma. " +
        // Hedef ve genel bakış başlığı tekrar ediyordu: "Efektif Gerilme İlkesi
        // konusunu öğren." bir hedef değil, başlığın kopyası.
        "objective ve overview başlığı tekrarlamasın: hedef öğrencinin ne YAPABİLİR " +
        "olacağını söylesin, genel bakış konunun özünü bir cümlede versin. " +
        "\"Bu derste X konusunu öğreneceğiz\" gibi içi boş cümleler yasak. " +
        "Anlamlı bölümler; duvar metin yok. Her bölüm kısa tut. " +
        // Üretilen bir derste "(2/3)⁻³ = 3²/2³ = 27/8" çıktı: sonuç doğru, ara
        // adım yanlış (3² değil 3³). Öğrenci ara adımı ezberliyor; sonucun
        // tutması hatayı görünmez kılıyor.
        "Çözümde her ara adımı yaz ve her adımın kendi içinde doğru olduğunu denetle: " +
        "bir önceki satırdan bu satıra hangi kuralla geçildiği tutarlı olmalı. " +
        "Sonucun doğru çıkması ara adımı doğrulamaz — yanlış bir ara adımla doğru sonuca varma. " +
        // Sınava iki gün kala dersi yeniden okuyan öğrenci düz paragraftan
        // neye bakacağını çıkaramıyordu.
        "ANAHTAR TERİMLERİ İŞARETLE: sınavda çıkacak terim ve tanımları bölüm metninde " +
        "**iki yıldız** arasına al (**boşluk oranı**, **likit limit**). Cümlenin tamamını " +
        "değil, terimi işaretle; ders başına en az iki tane. " +
        // Yanılgı dersin sonunda tek adımdı; öğrenci onu beş adım sonra
        // görüyordu. Okunduğu yerde kesilirse hiç yerleşmiyor.
        "TUZAĞI YERİNDE UYAR: bir bölümde karıştırılması kolay bir ayrım varsa o bölüme " +
        "note ekle — kısa başlık ve tek cümle (\"Havanın Ağırlığı: hacmi hesaba dahil, " +
        "ağırlığı değil\"). Her bölüme değil, gerçekten tuzak olan yere. " +
        "Kaynak kaç kavram veriyorsa o kadar bölüm; en az bir kavram bölümü. " +
        "Sırf sayıyı doldurmak için yeni bölüm uydurma. En az bir bölümde yanıtlı check olsun: " +
        "type trueFalse ekranda DOĞRU MU YANLIŞ, type mcq ekranda HIZLI SINAV. " +
        "explanation (AÇIKLAMA) yanlış seçeneğin neden çürük olduğunu yazsın; yalnızca doğruyu tekrarlama. " +
        "JSON anahtarları İngilizce kalır: objective, sections, example, commonMistake, infoCheck. " +
        "example, commonMistake veya objective yazamıyorsan alanı atla; uydurma. " +
        "Kaynakta olmayan formül veya teorem yazma; emin değilsen materyalde geçtiği hâliyle söyle."
      );
    case "quiz":
      return (
        "Her soruda net learningObjective. Yeterli bilgi ver. correct seçenekleri options içinde birebir. " +
        "Çeldiriciler gerçek yanılgılardan gelsin. misconceptionTag her soruda dolu olsun. Açıklama doğru kümesiyle uyumlu. " +
        // Üretilen beş sorunun beşinde de açıklama yalnızca doğruyu
        // tekrarlıyordu. Yanlışı çürütmek zorunda olan bir açıklama
        // ayrıca soruyu denetler: aynı beşlide "90° ve 270°'de tanımsız"
        // sorusunun Sec şıkkı da doğruydu ve kimse fark etmemişti.
        "AÇIKLAMA YANLIŞI DA ÇÜRÜTSÜN: en az bir çeldiricinin gerçekte ne olduğunu yaz " +
        "(\"Sin 90°'de 1'dir, tanımsız değildir\"). Bir çeldiriciyi çürütemiyorsan o şık " +
        "aslında doğrudur — soruyu düzelt. " +
        "Eşdeğer tekrar şık yok. Seviyeye uygun. multi=true yalnızca birden fazla bağımsız doğru varken; " +
        "'hepsi/hiçbiri' şıkkı yok."
      );
    case "true_false":
      return (
        "Her madde tek iddia. Belirsiz genellemelerden kaçın. Yanlışsa correctedStatement zorunlu. " +
        "explanation nedeni anlatsın ve yanlış iddiayı çürütsün. misconceptionTag her maddede dolu olsun (Stage 6)."
      );
    case "podcast":
      return (
        "Tek öğretmen anlatır; iki kişi diyalog kurmaz. Bölüm sırası: ne olduğu, neden önemli, " +
        "kaynaktaki somut örnek, öğrencinin gerçekten yaptığı hata, tek cümlelik tekrar. " +
        "Benzetme açıklamanın yerine geçmez. Sınavda çıkan noktayı vurgula. " +
        "Formüller konuşulabilir Unicode. Kaynak dışı sayı ve iddia yok. " +
        "Her satır tek anlatıcıda (ada) ve TTS öncesi doğrulanabilir kısa cümle."
      );
    case "flashcards":
      return (
        "Kart başına tek olgu/beceri. Ön yüz cevabı sızdırmasın. 'Biliyorum' sınav ustalığı değildir. " +
        "Zor kartlar (difficulty=hard) önce gelsin. Tekrarlı işaretleme sahte ustalık üretmesin."
      );
    case "oral":
      return (
        "Her soruda rubrik (rubricCriteria) ve beklenen noktalar (expectedPoints). " +
        "Eşdeğer doğru kabul edilir. Gerekçesiz uzun metin doğru sayılmaz. " +
        "Sınav kipinde yardım sınırlı; skor gerekçesi ve eksik hedefler kayda hazır olsun."
      );
    case "written":
      return (
        "Yazılı deneme: yardım/ipucu yok. Her soruda learningObjective + rubrik. " +
        "Eşdeğer doğrular kabul; kısmi puan gerekçeye bağlı. Uzun ilgisiz metin = yanlış. " +
        "Skor gerekçesi ve kaçırılan hedefler için explanation net olsun."
      );
    default:
      return "";
  }
}

/**
 * Bölüm sonu kontrolü.
 *
 * Ders tek akış hâlinde okunurken öğrenci anlayıp anlamadığını ancak en sonda
 * öğreniyordu. Her bölümün kendi kontrolü olunca yanlış anlama okunduğu yerde
 * yakalanıyor. `answerIndex` seçenek dizisine bakar; `explanation` cevabı
 * bölümün metnine bağlar.
 */
const reviewVariantSchema = z.object({
  prompt: z.string().min(8).max(180),
  /**
   * Şıklar modelden istenmez. Eski bir taslak yine de kopyaladıysa
   * kabul kuralı bakar; uymayan dizi dersi düşürmez, alan atılır.
   */
  options: z.array(z.string().min(1).max(160)).min(2).max(4).optional(),
  answerIndex: z.number().int().min(0).max(3).optional(),
});

export const sectionCheckSchema = z.object({
  type: z.enum(["mcq", "trueFalse"]),
  prompt: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  answerIndex: z.number().int().min(0).max(5),
  explanation: z.preprocess(
    (value) => (typeof value === "string" ? value.slice(0, 600) : ""),
    z.string().max(600),
  ),
  /**
   * Aynı üretim çağrısında yazılan tekrar. Bozuk varyant dersi düşürmez;
   * ekran o zaman şık kaydırma + önek kullanır.
   */
  review: reviewVariantSchema.optional().catch(undefined),
});

export type SectionCheck = z.infer<typeof sectionCheckSchema>;

/**
 * Bölümün içindeki uyarı kutusu.
 *
 * Referans ürün tuzağı kavramın hemen yanında veriyor: üç fazlı model anlatılırken
 * "Havanın Ağırlığı — hacmi hesaba dahil, ağırlığı değil" diye küçük bir
 * kutu çıkıyor. Bizde yanılgı dersin en sonunda tek bir adımdı; öğrenci
 * onu, üzerinden beş adım geçtikten sonra görüyordu. Yanılgı okunduğu
 * yerde kesilirse hiç yerleşmiyor.
 */
export const sectionNoteSchema = z.object({
  title: z.string().min(3).max(80),
  body: z.string().min(10).max(400),
  /** warn = kırmızı uyarı, info = altın bilgi, unit = turuncu birim. */
  tone: z.enum(["warn", "info", "unit"]).optional().catch(undefined),
});

export type SectionNote = z.infer<typeof sectionNoteSchema>;

const looseText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined),
    z.string().max(max).optional().catch(undefined),
  );

export const lessonV2Schema = z.object({
  title: z.string().min(2).max(160),
  objective: looseText(400),
  overview: looseText(1500),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2).max(160),
        // Anahtar terimler **iki yıldız** arasında gelir; ekranda koyu
        // görünür. Sınava iki gün kala dersi yeniden okuyan öğrenci neye
        // bakacağını düz paragraftan çıkaramıyordu.
        body: z.string().min(20).max(2500),
        check: sectionCheckSchema.optional().catch(undefined),
        // Süs alanlar dersi düşürmemeli.
        //
        // diagram eklenince ders üretimi tamamen durdu: model kurala
        // uymayan tek bir çizim yazdığında (alan dışı koordinat, uydurma
        // renk) lessonV2Schema tümden başarısız oluyor ve elde ders
        // kalmıyordu. Oysa çizim isteğe bağlı bir ek — yokluğu dersi
        // bozmaz, bozuğu da bozmamalı. `.catch` bozuk olanı düşürüyor,
        // dersin geri kalanı ayakta kalıyor.
        note: sectionNoteSchema.optional().catch(undefined),
        // Kardeş kavramlar (Kapalı sistem / Açık sistem) yatay kart olarak
        // gelir. Bozuk dizi dersi düşürmez.
        cards: z
          .array(
            z.object({
              title: z.string().min(2).max(80),
              body: z.string().min(4).max(320),
            }),
          )
          .min(2)
          .max(6)
          .optional()
          .catch(undefined),
        // Şekille anlaşılan konularda çizim; model tarifini veriyor,
        // SVG'yi biz kuruyoruz (bkz. lesson-diagram.ts).
        diagram: lessonDiagramSchema.optional().catch(undefined),
      }),
    )
    // Alt sınır bir: dar kaynak iki kavram da taşımayabilir ve uydurulan
    // örnek kesilince geriye tek sağlam bölüm kalabilir. İki bölüm hâlâ
    // istenen hedeftir; sayı tek başına dersi düşürmez.
    .min(1)
    .max(8),
  example: z
    .object({
      prompt: z.string().min(8).max(800),
      solution: z.string().min(8).max(1500),
    })
    .optional()
    .catch(undefined),
  commonMistake: z
    .object({
      claim: z.string().min(8).max(400),
      correction: z.string().min(8).max(400),
    })
    .optional()
    .catch(undefined),
  infoCheck: z
    .object({
      prompt: z.string().min(8).max(400),
      answer: z.string().min(2).max(400),
    })
    .optional()
    .catch(undefined),
  summary: z.array(z.string().min(2).max(240)).max(8).optional().catch(undefined),
  nextFocus: z.array(z.string().min(2).max(200)).max(6).optional().catch(undefined),
});

export type LessonV2 = z.infer<typeof lessonV2Schema>;

export const flashcardV2Schema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(4).max(200),
        back: z.string().min(2).max(400),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      }),
    )
    .min(4)
    .max(12),
});

export const oralV2Schema = z.object({
  questions: z
    .array(
      z.object({
        prompt: z.string().min(8),
        hint: z.string().optional(),
        learningObjective: z.string().min(8).optional(),
        rubricCriteria: z.array(z.string().min(2)).min(1).max(5).optional(),
        expectedPoints: z.array(z.string().min(2)).min(1).max(6).optional(),
      }),
    )
    .min(3)
    .max(6),
});

export const podcastV2Schema = z.object({
  title: z.string().min(1),
  objective: z.string().min(8).optional(),
  sourcePoints: z.array(z.string().min(4)).min(2).max(8).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1),
        lines: z
          .array(
            z.object({
              speaker: z.enum(["ada", "kerem"]),
              text: z.string().min(4).max(180),
            }),
          )
          .min(2)
          .max(14),
      }),
    )
    .min(4)
    // Üst sınır 5 idi ve eski beş evreli tasarımdan (Tanım→Neden→Örnek→
    // Hata→Özet) kalmıştı. Podcast artık dersi izliyor: ders 3-6 bölüm,
    // üstüne çözümlü örnek, yaygın hata ve kapanış. Dersten türeyen ilk
    // podcast 7 bölüm üretti ve 32 denemenin 32'sinde bu sınıra takıldı.
    .max(8),
});

function normalizeOption(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/^[a-d][).:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wallOfText(body: string) {
  return body.trim().length > 700 || body.split(/\n+/).length > 8;
}

/**
 * Ders şablonunun iskeleti başlık olarak kullanılamaz.
 *
 * Kısıt metni bölümleri sayınca model onları başlığa çeviriyordu: bir zemin
 * dersinde başlıklar "Kısa Açıklama / Kaynağa Dayalı Örnek / Yaygın Hata /
 * Orta Bilgi Kontrolü / Kısa Kapanış" çıktı. Öğrenci içindekilerden ne
 * öğreneceğini değil, üretim şablonunu okuyor.
 */
const SCAFFOLD_HEADINGS = [
  "kisa aciklama",
  "aciklama",
  "kaynaga dayali ornek",
  "ornek",
  "yaygin hata",
  "bilgi kontrolu",
  "orta bilgi kontrolu",
  // Pediatri dersinde bu çıktı: dört başlığın üçü kavramdı, dördüncüsü
  // yine şablonun adıydı. Liste sızdıkça büyüyor.
  "kontrol noktasi",
  "kontrol",
  "kisa kontrol",
  "degerlendirme",
  "uygulama",
  "kisa kapanis",
  "kapanis",
  "giris",
  "ozet",
  "adimlar",
  // Podcast'in beş evresi de aynı tuzağa düşüyordu: bölüm adları
  // "TANIM / NEDEN / ÖRNEK / YAYGIN HATA / ÖZET" çıkıyordu.
  "tanim",
  "neden",
  "nicin",
  "sonuc",
  "tekrar",
];

/** Şablon adı mı, yoksa konunun kendi adı mı? */
export function isScaffoldHeading(heading: string): boolean {
  const folded = foldTr(heading).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (/^bolum\s+\d+\b/.test(folded)) return true;
  return SCAFFOLD_HEADINGS.includes(folded.replace(/[^a-z ]/g, "").trim());
}

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻⁽⁾";

/**
 * Yarım kalmış üst simge dizisi.
 *
 * Üretilen bir derste "2³+⁴" geçti: model 2⁽³⁺⁴⁾ demek istemiş ama üssün
 * ortasında normal satıra düşmüş. Ekranda "2 üssü 3, artı 4" okunuyor ve
 * anlam tersine dönüyor. Üst simgeden sonra normal bir işleç gelip ardından
 * yeniden üst simgeye dönülüyorsa üs bölünmüş demektir.
 */
export function brokenSuperscript(text: string): boolean {
  return new RegExp(`[${SUPERSCRIPTS}]\\s*[+\\-*/×÷]\\s*[${SUPERSCRIPTS}]`).test(
    text,
  );
}

/**
 * Bölümler yalnızca kavram; şablon adlı bölümler atılır.
 *
 * Referans ürünün dersinde "Yaygın Hata" ya da "Bilgi Kontrolü" diye bir bölüm
 * yok: bölümlerin hepsi kavram, yanılgı bölümün içinde kutu, kontrol
 * bölümün içinde soru, özet ayrı adım.
 *
 * Bizim şemamızda da commonMistake, infoCheck ve summary ayrı alanlar.
 * Ama model onları bir kez daha bölüm olarak yazıyordu — üretilen bir
 * derste beş bölümün üçü "Yaygın Hata", "Bilgi Kontrolü", "Kapanış"tı ve
 * öğrenci aynı içeriği iki kez görüyordu. Bu kozmetik bir kusur değil,
 * tekrar.
 *
 * Prompta bir talimat daha eklemek bugün defalarca ters tepti; ikna
 * etmek yerine atıyoruz. Atmak içerik kaybettirmiyor çünkü karşılığı
 * zaten kendi alanında duruyor.
 *
 * Eşik ikide, üçte değil. Model şemanın alt sınırı olan üç bölümü
 * yazıp üçüncüyü şablonla dolduruyor; eşik üç olunca ayıklama hiç
 * çalışmıyor, ders şablon başlıkla yayına gidiyordu. İki kavram bölümü
 * + örnek + yanılgı + kontrol + özet zaten bir ders; tek kavram
 * kalacaksa dokunmuyoruz.
 */
/**
 * Tekrarı şemadan ayır.
 *
 * Bozuk bir `review` zod'da zaten düşüyor. Yine de üretim kapısı onu
 * görmeden dersi okusun: dev bir dizi, yanlış tür veya yarım nesne
 * bölümü de beraberinde götürmesin. Geçerli cümle ayrıştırma bitince geri
 * konur; uymayanı `sanitizeReviewVariants` atar.
 */
function splitReviews(raw: unknown): { body: unknown; reviews: unknown[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { body: raw, reviews: [] };
  }
  const lesson = raw as { sections?: unknown };
  if (!Array.isArray(lesson.sections)) return { body: raw, reviews: [] };
  const reviews: unknown[] = [];
  const sections = lesson.sections.map((section) => {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      reviews.push(undefined);
      return section;
    }
    const row = section as { check?: unknown };
    if (!row.check || typeof row.check !== "object" || Array.isArray(row.check)) {
      reviews.push(undefined);
      return section;
    }
    const check = { ...(row.check as Record<string, unknown>) };
    reviews.push(check.review);
    delete check.review;
    return { ...(section as Record<string, unknown>), check };
  });
  return { body: { ...(raw as Record<string, unknown>), sections }, reviews };
}

function looseReview(
  value: unknown,
): { prompt: string; options?: string[]; answerIndex?: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.prompt !== "string") return undefined;
  const prompt = row.prompt.trim().slice(0, 180);
  if (prompt.length < 8) return undefined;
  const options = Array.isArray(row.options)
    ? row.options
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 160))
        .slice(0, 4)
    : undefined;
  const answerIndex =
    typeof row.answerIndex === "number" && Number.isInteger(row.answerIndex)
      ? row.answerIndex
      : undefined;
  return {
    prompt,
    ...(options && options.length >= 2 ? { options, answerIndex } : {}),
  };
}

/**
 * JSON kaçışına çarpan LaTeX komutları.
 * `\frac` içindeki `\f` geçerli bir kaçıştır; ayrıştırıcı formülü bozar
 * ya da `\(` yüzünden tüm metni geçersiz sayar. İkisi de `invalid_json` değil.
 */
const LATEX_COMMANDS = new Set([
  "frac", "forall", "flat", "beta", "bar", "begin", "binom", "boxed",
  "boldsymbol", "text", "textbf", "textit", "textrm", "times", "theta",
  "tau", "tan", "tilde", "neq", "nabla", "nu", "not", "newline", "rho",
  "right", "rightarrow", "vec", "hat", "sqrt", "sum", "sin", "cos", "ln",
  "log", "left", "leq", "geq", "infty", "alpha", "gamma", "delta", "Delta",
  "cdot", "pm", "div", "pi", "sigma", "omega", "phi", "partial", "mu",
  "lambda", "quad", "qquad", "mathrm", "mathbf", "operatorname", "overline",
  "underline", "circ", "approx", "subset", "int", "lim", "to",
]);

function escapeLatexInJson(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] !== "\\") {
      out += input[i];
      i += 1;
      continue;
    }
    const next = input[i + 1];
    if (next === "\\") {
      out += "\\\\";
      i += 2;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(input.slice(i + 1))?.[0] ?? "";
    if (name && LATEX_COMMANDS.has(name)) {
      out += "\\\\";
      i += 1;
      continue;
    }
    if (!next || !"\"\\/bfnrtu".includes(next)) {
      out += "\\\\";
      i += 1;
      continue;
    }
    if (next === "u" && !/^[0-9a-fA-F]{4}/.test(input.slice(i + 2, i + 6))) {
      out += "\\\\";
      i += 1;
      continue;
    }
    out += `\\${next}`;
    i += 2;
  }
  return out;
}

function jsonHasLatexEscapes(input: string): boolean {
  if (/\\[()[\]]/.test(input)) return true;
  for (const name of LATEX_COMMANDS) {
    if (input.includes(`\\${name}`)) return true;
  }
  return false;
}

function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const seeds = trimmed === fenced ? [trimmed] : [trimmed, fenced];
  const candidates: string[] = [];
  for (const seed of seeds) {
    const repaired = escapeLatexInJson(seed);
    const loose = (value: string) => value.replace(/,\s*([}\]])/g, "$1");
    const ordered = jsonHasLatexEscapes(seed)
      ? [repaired, loose(repaired), seed, loose(seed)]
      : [seed, loose(seed), repaired, loose(repaired)];
    for (const candidate of ordered) {
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }
  return candidates;
}

/**
 * Model JSON'unu ayrıştır.
 * Çit, sondaki virgül ve LaTeX ters bölüleri onarılır. Ancak onarım da
 * okuyamazsa null döner; çağıran bunu `invalid_json` sayabilir.
 */
export function parseModelJson(raw: string): unknown | null {
  for (const candidate of jsonCandidates(raw)) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* sıradaki aday */
    }
  }
  return null;
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  geq: "≥",
  leq: "≤",
  neq: "≠",
  infty: "∞",
  rightarrow: "→",
  to: "→",
  partial: "∂",
  approx: "≈",
  circ: "°",
};

function toDigitScript(value: string, table: string): string {
  return value.replace(/\d/g, (digit) => table[Number(digit)] ?? digit);
}

/** Ham LaTeX'i öğrencinin okuduğu düz yazıma çevirir. Yeni olgu eklemez. */
export function normalizeMathNotation(text: string): string {
  let out = text;
  out = out.replace(/\\frac\s*\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
  out = out.replace(/_\{([^{}]+)\}/g, (_match, inner: string) => toDigitScript(inner, SUBSCRIPTS));
  out = out.replace(/\^\{([^{}]+)\}/g, (_match, inner: string) =>
    toDigitScript(inner, SUPERSCRIPT_DIGITS),
  );
  out = out.replace(/_(\d)/g, (_match, digit: string) => SUBSCRIPTS[Number(digit)] ?? digit);
  out = out.replace(/\^(\d)/g, (_match, digit: string) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit);
  out = out.replace(/\\([A-Za-z]+)/g, (full, name: string) => LATEX_SYMBOLS[name] ?? full);
  out = out.replace(/\\\(|\\\)|\\\[|\\\]|\$\$|\$/g, "");
  return out;
}

function overviewFromBody(body: string): string {
  const flat = body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const picked = sentence.length >= 20 ? sentence : flat;
  return picked.slice(0, 380);
}

function isTermEdge(text: string, index: number): boolean {
  const ch = text[index];
  return !ch || !/[\p{L}\p{N}]/u.test(ch);
}

/**
 * Listelenen terimi gövdede bir kez koyulaştırır.
 * Yeni terim yazmaz; metinde geçmeyen adı eklemez.
 */
export function emphasizeTerms(text: string, terms: string[]): string {
  let out = text;
  const ordered = [...new Set(terms.map((term) => term.trim()))]
    .filter((term) => term.length >= 3 && term.length <= 60)
    .sort((a, b) => b.length - a.length);
  for (const term of ordered) {
    const lower = out.toLocaleLowerCase("tr");
    const needle = term.toLocaleLowerCase("tr");
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const end = idx + needle.length;
      if (!isTermEdge(lower, idx - 1) || !isTermEdge(lower, end)) {
        from = end;
        continue;
      }
      if (out.slice(Math.max(0, idx - 2), idx) === "**" || out.slice(end, end + 2) === "**") {
        from = end;
        continue;
      }
      const found = out.slice(idx, end);
      out = `${out.slice(0, idx)}**${found}**${out.slice(end)}`;
      break;
    }
  }
  return out;
}

/** Başlık ve anahtar terim listesi gövdede geçiyorsa koyulaştır. Yeni terim uydurmaz. */
function boldExistingTerm(heading: string, body: string, keyTerms: string[] = []): string {
  const words = heading.split(/\s+/).filter((word) => word.length >= 5);
  return emphasizeTerms(body, [heading, ...words, ...keyTerms]);
}

/**
 * Eksik giriş, özet ve koyu terim dersin olgusunu değiştirmez.
 * Kaynakta olmayan örnek veya formül burada üretilmez.
 */
function normalizeLessonField(value: unknown): unknown {
  return typeof value === "string" ? normalizeMathNotation(value) : value;
}

function asLessonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function foldedKey(key: string): string {
  return foldTr(key).replace(/[^a-z0-9]/g, "");
}

function renameFields(
  row: Record<string, unknown>,
  aliases: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const next = aliases[foldedKey(key)] ?? key;
    if (out[next] == null) out[next] = value;
  }
  return out;
}

const LESSON_KEY_ALIASES: Record<string, string> = {
  title: "title",
  baslik: "title",
  objective: "objective",
  hedef: "objective",
  amac: "objective",
  ogrenmehedefi: "objective",
  learningobjective: "objective",
  goal: "objective",
  overview: "overview",
  giris: "overview",
  introduction: "overview",
  sections: "sections",
  bolumler: "sections",
  chapters: "sections",
  example: "example",
  ornek: "example",
  workedexample: "example",
  cozumluornek: "example",
  commonmistake: "commonMistake",
  yayginhata: "commonMistake",
  misconception: "commonMistake",
  yanilgi: "commonMistake",
  infocheck: "infoCheck",
  bilgikontrolu: "infoCheck",
  bilgikontrol: "infoCheck",
  knowledgecheck: "infoCheck",
  summary: "summary",
  ozet: "summary",
  nextfocus: "nextFocus",
  sonraki: "nextFocus",
  sonrakiadim: "nextFocus",
  nextstep: "nextFocus",
};

const SECTION_KEY_ALIASES: Record<string, string> = {
  heading: "heading",
  baslik: "heading",
  title: "heading",
  body: "body",
  metin: "body",
  content: "body",
  anlatim: "body",
  text: "body",
  check: "check",
  kontrol: "check",
  soru: "check",
  quiz: "check",
  note: "note",
  not: "note",
  cards: "cards",
  kartlar: "cards",
  diagram: "diagram",
  cizim: "diagram",
};

const PAIR_KEY_ALIASES: Record<string, string> = {
  prompt: "prompt",
  soru: "prompt",
  question: "prompt",
  problem: "prompt",
  solution: "solution",
  cozum: "solution",
  answer: "answer",
  cevap: "answer",
  correct: "answer",
  dogru: "answer",
  claim: "claim",
  iddia: "claim",
  yanlis: "claim",
  mistake: "claim",
  correction: "correction",
  duzeltme: "correction",
  explanation: "explanation",
  aciklama: "explanation",
  options: "options",
  siklar: "options",
  secenekler: "options",
  choices: "options",
  answerindex: "answerIndex",
  dogruindeks: "answerIndex",
  correctindex: "answerIndex",
  type: "type",
  tur: "type",
};

function clipText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function stringList(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (typeof value === "string") {
    const parts = value
      .split(/\n+|;\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
    const list = (parts.length ? parts : [value.trim()]).filter((item) => item.length >= 2);
    return list.length ? list.slice(0, maxItems).map((item) => item.slice(0, maxLen)) : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((item) => (typeof item === "string" ? item.trim().slice(0, maxLen) : ""))
    .filter((item) => item.length >= 2);
  return list.length ? list.slice(0, maxItems) : undefined;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = asLessonRecord(value);
  if (!row) return [];
  const values = Object.values(row);
  if (values.length && values.every((item) => item && typeof item === "object")) return values;
  return [row];
}

function normalizeCheckType(value: unknown, options: string[]): "mcq" | "trueFalse" {
  const folded = foldTr(String(value ?? ""));
  if (/truefalse|true_false|dogruyanlis|^dy$|^tf$/.test(folded.replace(/[^a-z_]/g, ""))) {
    return "trueFalse";
  }
  const foldedOptions = options.map((option) => foldTr(option));
  if (
    foldedOptions.length === 2 &&
    foldedOptions.includes("dogru") &&
    foldedOptions.includes("yanlis")
  ) {
    return "trueFalse";
  }
  return "mcq";
}

function normalizeCheck(value: unknown): Record<string, unknown> | undefined {
  const row = asLessonRecord(value);
  if (!row) return undefined;
  const named = renameFields(row, PAIR_KEY_ALIASES);
  const prompt = clipText(named.prompt ?? named.text, 400);
  if (!prompt || prompt.length < 8) return undefined;
  let options = Array.isArray(named.options)
    ? named.options
        .map((option) => (typeof option === "string" ? option.trim().slice(0, 200) : ""))
        .filter((option) => option.length >= 1)
    : [];
  let answerIndex = typeof named.answerIndex === "number" ? named.answerIndex : undefined;
  const answer = named.answer;
  if (typeof answer === "string" && answer.trim()) {
    const folded = foldTr(answer);
    const found = options.findIndex((option) => foldTr(option) === folded);
    if (found >= 0) answerIndex = found;
  }
  if (typeof answer === "boolean" && options.length >= 2) {
    const yes = options.findIndex((option) => foldTr(option) === "dogru");
    const no = options.findIndex((option) => foldTr(option) === "yanlis");
    if (yes >= 0 && no >= 0) answerIndex = answer ? yes : no;
  }
  if (options.length < 2 && (foldTr(prompt).includes("dogru") || named.type)) {
    if (foldTr(String(answer ?? "")) === "yanlis" || answer === false) {
      options = ["Doğru", "Yanlış"];
      answerIndex = 1;
    } else if (foldTr(String(answer ?? "")) === "dogru" || answer === true) {
      options = ["Doğru", "Yanlış"];
      answerIndex = 0;
    }
  }
  if (options.length < 2 || answerIndex == null || answerIndex < 0 || answerIndex >= options.length) {
    return undefined;
  }
  const explanation = clipText(named.explanation, 600) ?? "";
  const check: Record<string, unknown> = {
    type: normalizeCheckType(named.type, options),
    prompt,
    options: options.slice(0, 6),
    answerIndex,
    explanation,
  };
  if (named.review != null) check.review = named.review;
  return check;
}

function normalizePair(
  value: unknown,
  left: "prompt" | "claim",
  right: "solution" | "correction" | "answer",
): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    const split = value.split(/\s+(?:doğrusu|cozum|çözüm|çünkü)\s*:\s*/i);
    if (split.length >= 2 && split[0].trim().length >= 8 && split[1].trim().length >= 4) {
      return { [left]: split[0].trim().slice(0, 700), [right]: split[1].trim().slice(0, 700) };
    }
    return undefined;
  }
  const row = asLessonRecord(value);
  if (!row) return undefined;
  const named = renameFields(row, PAIR_KEY_ALIASES);
  const a = clipText(named[left] ?? named.prompt ?? named.claim, 800);
  const b = clipText(named[right] ?? named.solution ?? named.correction ?? named.answer, 1500);
  if (!a || !b || a.length < 8 || b.length < (right === "answer" ? 2 : 8)) return undefined;
  if (foldTr(a) === foldTr(b)) return undefined;
  return { [left]: a, [right]: b };
}

function unwrapLesson(raw: unknown): Record<string, unknown> | null {
  const row = asLessonRecord(raw);
  if (!row) return null;
  const named = renameFields(row, LESSON_KEY_ALIASES);
  if (named.sections) return named;
  for (const key of ["lesson", "ders", "content", "data", "result"]) {
    const inner = unwrapLesson(row[key] ?? named[key]);
    if (inner?.sections) return inner;
  }
  return named;
}

function normalizeSection(value: unknown): Record<string, unknown> | undefined {
  const row = asLessonRecord(value);
  if (!row) return undefined;
  const named = renameFields(row, SECTION_KEY_ALIASES);
  const heading = clipText(named.heading, 160);
  const body = clipText(named.body, 2500);
  if (!heading || heading.length < 2 || !body || body.length < 20) return undefined;
  const check = normalizeCheck(named.check);
  const section: Record<string, unknown> = { heading, body };
  if (check) section.check = check;
  else {
    const namedCheck = renameFields(asLessonRecord(named.check) ?? {}, PAIR_KEY_ALIASES);
    const prompt = clipText(namedCheck.prompt ?? namedCheck.text, 400);
    const answer = clipText(namedCheck.answer, 400);
    if (prompt && answer && prompt.length >= 8 && answer.length >= 2 && foldTr(prompt) !== foldTr(answer)) {
      section.freeCheck = { prompt, answer };
    }
  }
  if (named.note) section.note = named.note;
  if (named.cards) section.cards = named.cards;
  if (named.diagram) section.diagram = named.diagram;
  return section;
}

export type LessonShapeGap = {
  field: string;
  problem: string;
  core: boolean;
};

/**
 * Modelin sık yazdığı şekil varyantlarını v2 alanlarına çevirir.
 * Türkçe anahtar, tek nesne, bir seviye iç içe sarmalama, cevap
 * metni. Yeni olgu yazılmaz; eşlenemeyen isteğe bağlı alan düşer.
 */
export function normalizeLessonShape(raw: unknown): unknown {
  const named = unwrapLesson(raw);
  if (!named) return raw;
  const sections = toArray(named.sections).map(normalizeSection).filter(Boolean);
  const example = normalizePair(named.example, "prompt", "solution");
  const commonMistake = normalizePair(named.commonMistake, "claim", "correction");
  let infoCheck = normalizePair(named.infoCheck, "prompt", "answer");
  if (!infoCheck) {
    const donor = sections.find((section) => section?.check) as
      | { check?: { prompt?: string; options?: string[]; answerIndex?: number }; freeCheck?: { prompt: string; answer: string } }
      | undefined;
    const free = sections.find((section) => section?.freeCheck) as
      | { freeCheck?: { prompt: string; answer: string } }
      | undefined;
    const check = donor?.check;
    const answer = check?.options?.[check.answerIndex ?? -1];
    if (check?.prompt && typeof answer === "string" && answer.trim().length >= 2) {
      infoCheck = { prompt: check.prompt.slice(0, 400), answer: answer.trim().slice(0, 400) };
    } else if (free?.freeCheck) {
      infoCheck = free.freeCheck;
    }
  }
  for (const section of sections) {
    if (section && "freeCheck" in section) delete section.freeCheck;
  }
  const objective = clipText(named.objective, 400);
  const firstHeading = sections.find((section) => typeof section?.heading === "string")?.heading;
  const title = clipText(named.title, 160) ?? clipText(firstHeading, 160);
  const overview = clipText(named.overview, 1500);
  const summary = stringList(named.summary, 8, 240);
  const nextFocus = stringList(named.nextFocus, 6, 200);
  const lesson: Record<string, unknown> = {
    ...(title ? { title } : {}),
    ...(objective ? { objective } : {}),
    ...(overview ? { overview } : {}),
    sections,
  };
  if (example) lesson.example = example;
  if (commonMistake) lesson.commonMistake = commonMistake;
  if (infoCheck) lesson.infoCheck = infoCheck;
  if (summary?.length) lesson.summary = summary;
  if (nextFocus?.length) lesson.nextFocus = nextFocus;
  return lesson;
}

function sectionHasAnswer(section: Record<string, unknown> | undefined): boolean {
  const check = asLessonRecord(section?.check);
  if (!check) return false;
  const prompt = typeof check.prompt === "string" ? check.prompt.trim() : "";
  if (prompt.length < 8) return false;
  const options = Array.isArray(check.options) ? check.options : [];
  const index = check.answerIndex;
  if (typeof index === "number" && typeof options[index] === "string" && String(options[index]).trim()) {
    return true;
  }
  return typeof check.answer === "string" && check.answer.trim().length >= 2;
}

/** En az bir kavram bölümü ve yanıtlı bir kontrol. İsteğe bağlı alanlar sayılmaz. */
export function lessonHasTeachingCore(raw: unknown): boolean {
  const named = asLessonRecord(normalizeLessonShape(raw));
  if (!named || !Array.isArray(named.sections)) return false;
  const sections = named.sections.filter((section) => {
    const row = asLessonRecord(section);
    const body = typeof row?.body === "string" ? row.body.trim() : "";
    const heading = typeof row?.heading === "string" ? row.heading.trim() : "";
    return heading.length >= 2 && body.length >= 20;
  }) as Record<string, unknown>[];
  if (!sections.length) return false;
  if (sections.some(sectionHasAnswer)) return true;
  const info = asLessonRecord(named.infoCheck);
  const prompt = typeof info?.prompt === "string" ? info.prompt.trim() : "";
  const answer = typeof info?.answer === "string" ? info.answer.trim() : "";
  return prompt.length >= 8 && answer.length >= 2 && foldTr(prompt) !== foldTr(answer);
}

/** Hangi alanın eksik ya da bozuk olduğunu söyler. Çekirdek olanlar dersi düşürür. */
export function describeLessonShapeGaps(raw: unknown): LessonShapeGap[] {
  const named = asLessonRecord(normalizeLessonShape(raw));
  const gaps: LessonShapeGap[] = [];
  if (!named) {
    return [{ field: "lesson", problem: "JSON nesnesi değil", core: true }];
  }
  if (typeof named.title !== "string" || named.title.trim().length < 2) {
    gaps.push({ field: "title", problem: "başlık yok", core: false });
  }
  const sections = Array.isArray(named.sections) ? named.sections : [];
  const real = sections.filter((section) => {
    const row = asLessonRecord(section);
    return typeof row?.body === "string" && row.body.trim().length >= 20;
  });
  if (!real.length) {
    gaps.push({ field: "sections", problem: "metinli kavram bölümü yok", core: true });
  }
  const hasQuestion = lessonHasTeachingCore({ ...named, sections: real.length ? real : sections });
  if (!hasQuestion) {
    gaps.push({
      field: "sections.check",
      problem: "yanıtlı kontrol sorusu yok (prompt + answerIndex veya infoCheck.answer)",
      core: true,
    });
  }
  if (!named.objective) gaps.push({ field: "objective", problem: "öğrenme hedefi yok", core: false });
  if (!named.overview) gaps.push({ field: "overview", problem: "genel bakış yok", core: false });
  if (!named.example) gaps.push({ field: "example", problem: "çözümlü örnek yok", core: false });
  if (!named.commonMistake) {
    gaps.push({ field: "commonMistake", problem: "yaygın hata yok", core: false });
  }
  if (!named.infoCheck) gaps.push({ field: "infoCheck", problem: "bilgi kontrolü yok", core: false });
  return gaps;
}

export function coerceLessonCosmetics(raw: unknown, keyTerms: string[] = []): unknown {
  const shaped = normalizeLessonShape(raw);
  if (!shaped || typeof shaped !== "object" || Array.isArray(shaped)) return shaped;
  const row = { ...(shaped as Record<string, unknown>) };
  for (const key of ["title", "objective", "overview"] as const) {
    row[key] = normalizeLessonField(row[key]);
  }
  if (row.example && typeof row.example === "object" && !Array.isArray(row.example)) {
    const example = { ...(row.example as Record<string, unknown>) };
    example.prompt = normalizeLessonField(example.prompt);
    example.solution = normalizeLessonField(example.solution);
    row.example = example;
  }
  if (row.commonMistake && typeof row.commonMistake === "object" && !Array.isArray(row.commonMistake)) {
    const mistake = { ...(row.commonMistake as Record<string, unknown>) };
    mistake.claim = normalizeLessonField(mistake.claim);
    mistake.correction = normalizeLessonField(mistake.correction);
    row.commonMistake = mistake;
  }
  const sections = Array.isArray(row.sections)
    ? row.sections.map((section) => {
        if (!section || typeof section !== "object" || Array.isArray(section)) return section;
        const item = { ...(section as Record<string, unknown>) };
        if (typeof item.heading === "string") item.heading = normalizeMathNotation(item.heading);
        if (typeof item.body === "string") item.body = normalizeMathNotation(item.body);
        if (typeof item.heading === "string" && typeof item.body === "string") {
          item.body = boldExistingTerm(item.heading, item.body, keyTerms).slice(0, 2500);
        }
        return item;
      })
    : row.sections;
  row.sections = sections;
  const firstBody = Array.isArray(sections)
    ? (sections
        .map((section) =>
          section && typeof section === "object"
            ? String((section as { body?: unknown }).body ?? "")
            : "",
        )
        .find((body) => body.trim().length >= 20) ?? "")
    : "";
  const overview = typeof row.overview === "string" ? row.overview.trim() : "";
  if (overview.length < 20 && firstBody) row.overview = overviewFromBody(firstBody);
  const objective = typeof row.objective === "string" ? row.objective.trim() : "";
  const summary = Array.isArray(row.summary)
    ? row.summary.filter((item) => typeof item === "string" && item.trim().length >= 2)
    : [];
  if (summary.length < 2) {
    const fromOverview = typeof row.overview === "string" ? row.overview.trim().slice(0, 160) : "";
    if (fromOverview.length >= 2 && objective.length >= 2) row.summary = [fromOverview, objective];
  }
  const focus = Array.isArray(row.nextFocus)
    ? row.nextFocus.filter((item) => typeof item === "string" && item.trim().length >= 2)
    : [];
  if (!focus.length && objective.length >= 2) {
    row.nextFocus = [objective.slice(0, 180)];
  }
  const info = row.infoCheck;
  const infoOk =
    info &&
    typeof info === "object" &&
    typeof (info as { prompt?: unknown }).prompt === "string" &&
    (info as { prompt: string }).prompt.trim().length >= 8 &&
    typeof (info as { answer?: unknown }).answer === "string" &&
    (info as { answer: string }).answer.trim().length >= 4;
  if (!infoOk && Array.isArray(sections)) {
    for (const section of sections) {
      const check =
        section && typeof section === "object"
          ? (section as { check?: { prompt?: string; options?: string[]; answerIndex?: number } }).check
          : undefined;
      if (!check?.prompt || check.prompt.trim().length < 8 || !Array.isArray(check.options)) continue;
      const answer = check.options[check.answerIndex ?? 0] ?? check.options[0];
      if (typeof answer !== "string" || answer.trim().length < 4) continue;
      row.infoCheck = {
        prompt: check.prompt.trim().slice(0, 240),
        answer: answer.trim().slice(0, 240),
      };
      break;
    }
  }
  return row;
}

/** Şema geçerse şablon başlıklarını ayıkla. Üretim kapısı bundan sonra bakar. */
export function prepareLessonDraft(raw: unknown, keyTerms: string[] = []): LessonV2 | null {
  try {
    const { body, reviews } = splitReviews(coerceLessonCosmetics(raw, keyTerms));
    const parsed = lessonV2Schema.safeParse(body).data;
    if (!parsed) return null;
    const withReviews: LessonV2 = {
      ...parsed,
      sections: parsed.sections.map((section, index) => {
        const review = looseReview(reviews[index]);
        if (!section.check || !review) return section;
        return { ...section, check: { ...section.check, review } };
      }),
    };
    return sanitizeReviewVariants(dropScaffoldSections(withReviews));
  } catch {
    const parsed = lessonV2Schema.safeParse(raw).data;
    return parsed ? sanitizeReviewVariants(dropScaffoldSections(parsed)) : null;
  }
}

/**
 * Geçersiz tekrar varyantını saklama. Yeni şık veya orijinal cümle,
 * dersin kendisini düşürmeden atılır.
 */
export function sanitizeReviewVariants(lesson: LessonV2): LessonV2 {
  return {
    ...lesson,
    sections: lesson.sections.map((section) => {
      const check = section.check;
      if (!check?.review) return section;
      if (acceptReviewVariant(check)) return section;
      return {
        ...section,
        check: {
          type: check.type,
          prompt: check.prompt,
          options: check.options,
          answerIndex: check.answerIndex,
          explanation: check.explanation,
        },
      };
    }),
  };
}

export function dropScaffoldSections<T extends { sections: { heading: string }[] }>(
  lesson: T,
): T {
  const concepts = lesson.sections.filter((s) => !isScaffoldHeading(s.heading));
  if (concepts.length === lesson.sections.length) return lesson;
  if (concepts.length < 2) return lesson;
  return { ...lesson, sections: concepts };
}

/** Deterministic lesson pedagogy checks (structure → pedagogy). */
export function validateLessonPedagogy(
  raw: unknown,
  options: { minSections?: number } = {},
): string[] {
  const parsed = lessonV2Schema.safeParse(raw);
  if (!parsed.success) {
    return ["Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü)."];
  }
  const lesson = parsed.data;
  const issues: string[] = [];
  if (lesson.overview && wallOfText(lesson.overview)) {
    issues.push("Genel bakış çok uzun; kısa tut.");
  }
  // İstenen alt sınır ikidir; kaynak omurgası daha uzunsa o kadar.
  // Tek başına bölüm sayısı dersi düşürmez — yayım kapısı bu cümleyi eler.
  const minSections = options.minSections ?? 2;
  if (lesson.sections.length < minSections) {
    issues.push(
      `Ders en az ${minSections} bölüm istiyor; konunun kavramlarını ayır.`,
    );
  }
  // Başlık, o bölümde ne öğretildiğini söylemeli; şablonun adını değil.
  const scaffold = lesson.sections.filter((s) => isScaffoldHeading(s.heading));
  if (scaffold.length) {
    issues.push(
      `Bölüm başlığı şablon adı: ${scaffold.map((s) => s.heading).join(", ")} — konuyu adlandır.`,
    );
  }

  // "X konusunu öğren." bir hedef değil, başlığın kopyası.
  const titleFolded = foldTr(lesson.title);
  const objectiveFolded = foldTr(lesson.objective ?? "");
  if (lesson.objective && objectiveFolded.includes(titleFolded)) {
    // Başlık çıkınca geriye kalan: gerçek bir hedef mi, yoksa "…konusunu
    // öğren" gibi kalıp mı?
    const rest = objectiveFolded.replace(titleFolded, "").trim();
    const stock = /^(konusunu|konusu|konuyu|yi|yu)?\s*(ogren|anla|kavra|incele|calis)/.test(
      rest,
    );
    if (stock || rest.replace(/[^a-z]/g, "").length < 12) {
      issues.push("Öğrenme hedefi başlığı tekrarlıyor; ne yapabilir olacağını yaz.");
    }
  }
  // İçi boş genel bakışın işareti açılış cümlesi değil, EDİLGEN GELECEK:
  // "açıklanacak", "pekiştirilecektir" dersi tarif eder, konuyu anlatmaz.
  // Önceki hâli "bu derste" ile başlayan her şeyi reddediyordu; oysa
  // "Bu derste aşı takvimini yaşa göre okumayı öğreneceksin" iyi bir
  // genel bakış ve o da eleniyordu.
  if (
    lesson.overview &&
    /(aciklanacak|anlatilacak|ele alinacak|pekistirilecek|incelenecek|islenecek)/.test(
      foldTr(lesson.overview),
    )
  ) {
    issues.push("Genel bakış dersi tarif ediyor; konunun özünü bir cümlede ver.");
  }

  // Tek kontrol dersin sonunda kalıyordu; okunan yerde yoklanmalı.
  if (lesson.sections.length >= 4) {
    const checks = lesson.sections.filter((s) => s.check).length;
    if (checks < 2) {
      issues.push("En az iki bölümün kendi kontrolü olmalı.");
    }
  }

  // Anahtar terim işaretlenmemiş ders, sınav öncesi taranamıyor. Kural
  // set bazında: her bölümde terim aramak yerine dersin genelinde en az
  // birkaç tanesi işaretli olsun.
  const boldTerms = lesson.sections.reduce(
    (sum, s) => sum + (s.body.match(/\*\*[^*\n]{2,60}\*\*/g)?.length ?? 0),
    0,
  );
  if (boldTerms < 2) {
    issues.push(
      "Anahtar terimler işaretlenmemiş; sınavda çıkacak terimleri **iki yıldız** arasına al.",
    );
  }

  // Çizim isteğe bağlı ama varsa okunabilir olmalı: etiketsiz bir şema
  // öğrenciye hangi parçanın ne olduğunu söylemiyor.
  for (const section of lesson.sections) {
    if (!section.diagram) continue;
    for (const issue of diagramIssues(section.diagram)) {
      issues.push(`${section.heading}: ${issue}`);
    }
  }

  const mathTexts = [
    lesson.overview ?? "",
    ...lesson.sections.map((s) => s.body),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
  ];
  if (mathTexts.some(brokenSuperscript)) {
    issues.push(
      "Üs bölünmüş (ör. 2³+⁴): üssün tamamını üst simgeyle yaz ya da sonucu hesapla.",
    );
  }

  for (const section of lesson.sections) {
    if (wallOfText(section.body)) {
      issues.push(`Bölüm duvar metin: ${section.heading}`);
    }
    // Kontrolün bütünlüğü (dolgu şık, cevap indeksi, tekrar) artık
    // blockingLessonIssues'ta; oradan aşağıda ekleniyor.
  }
  if (
    lesson.commonMistake &&
    lesson.commonMistake.claim === lesson.commonMistake.correction
  ) {
    issues.push("Yaygın hata ile düzeltme aynı olamaz.");
  }
  return [...issues, ...blockingLessonIssues(lesson)];
}

function isSectionCountIssue(issue: string): boolean {
  const folded = foldTr(issue);
  return /en az \d+/.test(folded) && /bolum/.test(folded);
}

function solutionIsJustified(solution: string): boolean {
  const folded = foldTr(solution);
  if (folded.length < 24) return false;
  return /cunku|bu yuzden|dolayisiyla|yani|adim|once|sonra/.test(folded);
}

function sectionCheckTeaches(check: SectionCheck): boolean {
  const explanation = foldTr(check.explanation);
  if (explanation.length < 12) return false;
  if (check.type === "trueFalse") {
    return explanation !== foldTr(check.prompt);
  }
  if (check.answerIndex < 0 || check.answerIndex >= check.options.length) return false;
  const correctTokens = new Set(
    foldTr(check.options[check.answerIndex] ?? "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return check.options.some((option, index) => {
    if (index === check.answerIndex) return false;
    return foldTr(option)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !correctTokens.has(token))
      .some((token) => explanation.includes(token));
  });
}

/**
 * Ders üretim kapısı. İstenen hedef en az iki kavram bölümüdür; kaynak
 * daha uzunsa o kadar. Bölüm sayısı tek başına reddetmez.
 */
export function validateLessonV2(
  raw: unknown,
  options: { minSections?: number } = {},
): string[] {
  const prepared = prepareLessonDraft(raw) ?? raw;
  const issues = validateLessonPedagogy(prepared, options);
  const lesson = lessonV2Schema.safeParse(prepared).data;
  if (!lesson) return issues;
  const floor = options.minSections ?? 2;
  if (lesson.sections.length < floor && !issues.some((issue) => issue.includes("en az"))) {
    issues.push(`Ders en az ${floor} kavram bölümü istiyor.`);
  }
  if ((lesson.overview ?? "").trim().length > 400) {
    issues.push("Genel bakış 400 karakteri aşıyor; konunun özünü kısa yaz.");
  }
  if (lesson.example && lesson.example.solution.trim() === lesson.example.prompt.trim()) {
    issues.push("Çözüm, sorunun tekrarı olamaz; adım ve gerekçe yaz.");
  } else if (lesson.example && !solutionIsJustified(lesson.example.solution)) {
    issues.push("Çözüm adım adım ve gerekçeli olmalı; yalnızca sonucu yazma.");
  }
  if (
    lesson.infoCheck &&
    foldTr(lesson.infoCheck.answer) === foldTr(lesson.infoCheck.prompt)
  ) {
    issues.push("Bilgi kontrolünün yanıtı sorunun tekrarı olamaz.");
  }
  for (const section of lesson.sections) {
    if (!/\*\*[^*\n]{2,60}\*\*/.test(section.body)) {
      issues.push(
        `Anahtar terim koyu değil: ${section.heading}. Sınav terimini **iki yıldız** arasına al.`,
      );
    }
    if (!section.check) {
      issues.push(
        `Bölümün kontrolü yok: ${section.heading}. DOĞRU MU YANLIŞ veya HIZLI SINAV ekle.`,
      );
      continue;
    }
    if (!sectionCheckTeaches(section.check)) {
      issues.push(
        `Kontrol açıklaması yanlış seçeneği çürütmüyor: ${section.heading}.`,
      );
    }
  }
  return issues;
}

function sectionCheckPublishable(check: SectionCheck): boolean {
  if (!sectionCheckTeaches(check)) return false;
  if (check.answerIndex < 0 || check.answerIndex >= check.options.length) return false;
  const normalized = check.options.map((option) => option.trim().toLocaleLowerCase("tr"));
  if (new Set(normalized).size !== normalized.length) return false;
  if (normalized.some((option) => option === "hiçbiri" || option === "hepsi")) return false;
  if (check.type === "trueFalse" && check.options.length !== 2) return false;
  return true;
}

/**
 * Öğretmeyen ya da şıkkı bozuk kontrol çıkarılır. Ders kalır.
 * Kalan kontrol sayısı eşiğin altındaysa `lessonPublishIssues` reddeder.
 */
export function publishLessonDraft(
  raw: unknown,
  options: { keyTerms?: string[] } = {},
): LessonV2 | null {
  const prepared = prepareLessonDraft(raw, options.keyTerms ?? []);
  if (!prepared) return null;
  const sections = prepared.sections.map((section) => {
    if (!section.check || sectionCheckPublishable(section.check)) return section;
    const rest = { ...section };
    delete rest.check;
    return rest;
  });
  // Zayıf kontroller düşer. Hepsi düşerse birini geri koy: sıfır kontrol
  // dersi boşaltır, tek kontrol dersi düşürmez.
  if (sections.some((section) => section.check)) return { ...prepared, sections };
  const fallback = prepared.sections.findIndex((section) => section.check);
  if (fallback < 0) return { ...prepared, sections };
  const restored = sections.slice();
  restored[fallback] = prepared.sections[fallback];
  return { ...prepared, sections: restored };
}

/**
 * Yayına gidecek dersin kapısı. Tek bir zayıf kontrol dersi düşürmez;
 * ikincisi zorunlu değildir, en az bir kontrol kalır.
 * LaTeX düz yazıma çevrilir, çözümü tek cümle olan örnek dersi düşürmez.
 * Şema, bölünmüş üs ve doldurulamayan zorunlu alan hâlâ düşürür.
 */
function publishIssueBlocks(issue: string): boolean {
  const folded = foldTr(issue);
  if (/us bolun/.test(folded)) return true;
  if (/secenek disinda|secenekleri tekrar|dolgu sik|iki secenekli olmali/.test(folded)) return true;
  if (/cekirdegi yok/.test(folded)) return true;
  if (/kontrol sorusu/.test(folded)) return true;
  return false;
}

function formatShapeGaps(gaps: LessonShapeGap[], coreOnly: boolean): string {
  const picked = coreOnly ? gaps.filter((gap) => gap.core) : gaps;
  return picked.map((gap) => `${gap.field} (${gap.problem})`).join("; ");
}

export function lessonPublishIssues(
  raw: unknown,
  options: { minSections?: number; keyTerms?: string[] } = {},
): string[] {
  const published = publishLessonDraft(raw, { keyTerms: options.keyTerms });
  if (!published) {
    const gaps = describeLessonShapeGaps(raw);
    console.error("lesson_schema_gaps", {
      missing: gaps.map((gap) => `${gap.field}: ${gap.problem}`),
    });
    const core = formatShapeGaps(gaps, true);
    if (core) return [`Ders v2 çekirdeği yok: ${core}.`];
    const all = formatShapeGaps(gaps, false);
    return [`Ders v2 çekirdeği yok: ${all || "bölüm metni ve yanıtlı soru yok"}.`];
  }
  const issues = validateLessonV2(published, options).filter(
    (issue) =>
      !issue.includes("kontrolü yok") &&
      !issue.includes("çürütmüyor") &&
      !issue.includes("Anahtar terim koyu değil") &&
      !issue.includes("Anahtar terimler işaretlenmemiş") &&
      !issue.includes("adım adım ve gerekçeli") &&
      !issue.includes("Ham LaTeX") &&
      !isSectionCountIssue(issue),
  );
  const teaching =
    published.sections.filter((section) => section.check).length +
    (published.infoCheck?.prompt && published.infoCheck.answer ? 1 : 0);
  if (teaching < 1) {
    issues.push("En az 1 kontrol sorusu ve yanıtı kalmalı; öğretmeyenler çıkarıldı.");
  }
  return issues.filter(publishIssueBlocks);
}

/** Doğrulayıcı kısa tekrarı görmesin. Eksik veya bozuk tekrar dersi reddetmesin. */
export function lessonDraftForVerifier(draft: string, keyTerms: string[] = []): string {
  try {
    const parsed = parseModelJson(draft);
    if (!parsed || typeof parsed !== "object") return draft;
    const coerced = coerceLessonCosmetics(parsed, keyTerms) as { sections?: unknown };
    if (!coerced || typeof coerced !== "object" || !Array.isArray(coerced.sections)) return draft;
    for (const section of coerced.sections) {
      if (!section || typeof section !== "object") continue;
      const check = (section as { check?: { review?: unknown } }).check;
      if (check && typeof check === "object") delete check.review;
    }
    return JSON.stringify(coerced);
  } catch {
    return draft;
  }
}

/**
 * Kısa tekrar, ders üretiminin içinde yazılır. Kapıda soru başına
 * ayrı bir model çağrısı yok.
 *
 * Yalnızca kısa bir kök cümle. Bu cümle doğrulayıcının formatına
 * girmez: #81'de `"review"?:` şema metnine konunca denetçi eksik ya da
 * farklı tekrar yüzünden dersin tamamını reddetti. Kural yalnız üretim
 * isteminde durur; denetçiye giden taslaktan alan silinir.
 *
 * Şıkları ikinci kez yazdırmak çıktıyı şişiriyordu. Sıra bizde karışır.
 * Yazılamazsa alan boş kalır, ders yine tamamlanır.
 */
export const REVIEW_VARIANT_RULE =
  "check.review isteğe bağlıdır ve yalnızca kısa bir prompt'tur (en fazla 140 karakter). " +
  "Aynı kavramı başka sözcüklerle sor; orijinal cümleyi, yeni sayı, yeni şık veya formül yazma. " +
  "Şıkları review içine kopyalama. Yazamazsan review alanını boş bırak; bu dersi geçersiz yapmaz.";

/** İki rotanın ders şeması aynı metin. Diyagram eki rota ekler. */
export const LESSON_V2_SCHEMA_HINT =
  'JSON: {"title":string,"objective":string,"overview":string,' +
  '"sections":[{"heading":string,"body":string,"check":{"type":"mcq"|"trueFalse","prompt":string,"options":string[],"answerIndex":number,"explanation":string},"note":{"title":string,"body":string},"cards":[{"title":string,"body":string}]}],' +
  '"example":{"prompt":string,"solution":string},"commonMistake":{"claim":string,"correction":string},' +
  '"infoCheck":{"prompt":string,"answer":string},"summary":string[],"nextFocus":string[]}. ' +
  "Kaynak kaç kavram veriyorsa o kadar bölüm; en az bir kavram bölümü ve en az bir yanıtlı check. Yeni bölüm uydurma. " +
  "Anahtarlar İngilizce: objective, sections, example, commonMistake, infoCheck. Türkçe anahtar kullanma. " +
  "example, commonMistake, objective veya infoCheck yoksa alanı yazma; uydurma. " +
  "trueFalse ekranda DOĞRU MU YANLIŞ, mcq ekranda HIZLI SINAV. " +
  "explanation yanlış seçeneğin neden çürük olduğunu yazsın. " +
  "cards isteğe bağlı: kardeş kavram kümesi varsa 2-6 kart; yoksa cards yazma, uydurma kart ekleme. " +
  "overview giriş metnidir; ayrı bir Giriş bölümü açma. " +
  "Kaynak sayfada yazmayan formül veya teorem yazma.";

/**
 * Yayına asla çıkmaması gereken kusurlar.
 *
 * `validateLessonPedagogy` her şeyi topluyor ve taslağı yeniden yazdırmak
 * için doğru araç. Ama hiçbir taslak geçmezse elimizdeki en iyi taslakla
 * devam ediyoruz (#34) — yoksa öğrencinin okuyacak bir şeyi kalmıyor. O
 * yedek canlıda şunu geçirdi:
 *
 *   - "Hepsi" şıkkı (dolgu, elemesi bedava)
 *   - soru PI soruyor, şıklar LI: cevaplanamaz
 *   - ders metninde ham LaTeX: \( C_u = \frac{D_{60}}{D_{10}} \)
 *
 * Başlığın adı hoş olmaması ile sorunun cevaplanamaz olması aynı şey
 * değil. Birincisi kusurlu ders, ikincisi yanlış ders. Yedek yalnızca
 * birincisini geçirebilir.
 */
export function blockingLessonIssues(raw: unknown): string[] {
  const parsed = lessonV2Schema.safeParse(raw);
  if (!parsed.success) return ["Ders v2 şemasını karşılamıyor."];
  const lesson = parsed.data;
  const issues: string[] = [];

  // Ham LaTeX ekranda olduğu gibi görünüyor; podcast doğrulayıcısı bunu
  // baştan beri reddediyordu, ders doğrulayıcısında yoktu.
  const texts = [
    lesson.overview,
    ...lesson.sections.map((s) => s.body),
    lesson.example?.prompt,
    lesson.example?.solution,
    lesson.commonMistake?.correction,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  if (texts.some((t) => /\\\(|\\\[|\\frac|\\geq|\\leq|\\cdot|\$\$/.test(t))) {
    issues.push("Ham LaTeX var; formülleri konuşulabilir Unicode ile yaz.");
  }
  if (texts.some(brokenSuperscript)) {
    issues.push("Üs bölünmüş; üssün tamamını üst simgeyle yaz.");
  }

  for (const section of lesson.sections) {
    const check = section.check;
    if (!check) continue;
    const label = section.heading;
    if (check.answerIndex >= check.options.length || check.answerIndex < 0) {
      issues.push(`Kontrol cevabı seçenek dışında: ${label}`);
    }
    const normalized = check.options.map((o) => o.trim().toLocaleLowerCase("tr"));
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`Kontrol seçenekleri tekrar ediyor: ${label}`);
    }
    if (normalized.some((o) => o === "hiçbiri" || o === "hepsi")) {
      issues.push(`Dolgu şık kullanılmış: ${label}`);
    }
    if (check.type === "trueFalse" && check.options.length !== 2) {
      issues.push(`Doğru/yanlış kontrolü iki seçenekli olmalı: ${label}`);
    }
  }
  return issues;
}

/**
 * Açıklama yanlış şıkkı çürütüyor mu?
 *
 * Üretilmiş beş quiz sorusuna bakınca beşinin de açıklaması yalnızca
 * doğruyu tekrarlıyordu: "Sinus(y)=-1 sağlayan açı 270°'dir." Öğrenci
 * neden 90° değil öğrenmiyor. Referans ürünün açıklaması her çeldiricinin
 * gerçekte ne olduğunu söylüyor: "V_w suyun, V_a havanın hacmidir."
 *
 * Kural aynı zamanda bir doğruluk ağı: aynı beşlide "90° ve 270°'de
 * tanımsız olan fonksiyon" sorusunun şıkları Tan/Sin/Cos/Sec idi ve
 * cos = 0 olduğu için Sec de tanımsız — soru iki doğrulu ama tek
 * cevaplı işaretlenmişti. "Sec neden yanlış?" yazmak zorunda olan bir
 * açıklama bunu yazamazdı.
 */
function explanationRefutesADistractor(q: QuizQuestion): boolean {
  const explanation = foldTr(q.explanation ?? "");
  if (!explanation.trim()) return false;
  const correctTokens = new Set(
    q.correct.flatMap((c) => foldTr(c).split(/[^a-z0-9]+/).filter(Boolean)),
  );
  for (const option of q.options) {
    if (q.correct.includes(option)) continue;
    // Yanlış şıkkı ayırt eden parça: doğru şıkta geçmeyen bir kelime
    // ya da sayı. "270" doğru cevapta da geçiyorsa ayırt etmiyor.
    const distinctive = foldTr(option)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !correctTokens.has(t));
    if (distinctive.some((t) => explanation.includes(t))) return true;
  }
  return false;
}

/** Quiz pedagogy beyond basic schema parse. */
export function validateQuizPedagogy(
  questions: QuizQuestion[],
  options?: {
    requireObjective?: boolean;
    requireMisconceptionTag?: boolean;
    requireDistractorRefutation?: boolean;
  },
): string[] {
  const issues: string[] = [];
  if (!questions.length) return ["Quiz sorusu yok."];

  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const label = `Soru ${i + 1}`;
    if (q.text.trim().length < 8) {
      issues.push(`${label}: soru metni çok kısa / belirsiz.`);
    }
    if (!q.explanation || q.explanation.trim().length < 8) {
      issues.push(`${label}: explanation zorunlu ve net olmalı.`);
    }
    if (q.multi && q.correct.length < 2) {
      issues.push(`${label}: multi=true iken en az iki bağımsız doğru gerekli.`);
    }
    if (!q.multi && q.correct.length !== 1) {
      issues.push(`${label}: tek doğru soruda tam bir correct olmalı.`);
    }
    const normalized = q.options.map(normalizeOption);
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`${label}: eşdeğer / tekrar şıklar var.`);
    }
    for (const option of q.options) {
      if (META_OPTIONS.test(option.trim())) {
        issues.push(`${label}: hepsi/hiçbiri tarzı şık yasak.`);
      }
    }
    for (const correct of q.correct) {
      if (!q.options.includes(correct)) {
        issues.push(`${label}: correct options içinde değil.`);
      }
    }
    if (
      options?.requireMisconceptionTag &&
      (q.misconceptionTag?.trim().length ?? 0) < 2
    ) {
      issues.push(`${label}: misconceptionTag zorunlu.`);
    }
    if (options?.requireDistractorRefutation && !explanationRefutesADistractor(q)) {
      issues.push(`${label}: açıklama bir çeldiriciyi çürütmüyor.`);
    }
    const obj = (q as QuizQuestion & { learningObjective?: string }).learningObjective;
    // Prefer objectives, but don't fail the whole set if one item omits it —
    // prompt + quality gate still push for them.
    if (options?.requireObjective && questions.length && i === 0 && (!obj || obj.trim().length < 4)) {
      const missingAll = questions.every(
        (item) => !(item as QuizQuestion & { learningObjective?: string }).learningObjective?.trim(),
      );
      if (missingAll) {
        issues.push("En az bir soruda learningObjective zorunlu.");
      }
    }
  }

  // Soru bazında değil, set bazında: tek bir sorunun açıklaması kısa
  // kalabilir, ama BEŞİNİN BEŞİ de yalnızca doğruyu tekrarlıyorsa
  // öğrenci hiçbir yanlışının nedenini öğrenmiyor. Set kuralı olması
  // ayrıca üretimi tıkamıyor — bugün bunu üç kez pahalıya öğrendik.
  const multiOption = questions.filter((q) => q.options.length >= 3);
  if (!options?.requireDistractorRefutation && multiOption.length >= 2) {
    const refuting = multiOption.filter(explanationRefutesADistractor).length;
    if (refuting * 2 < multiOption.length) {
      issues.push(
        "Açıklamalar yalnızca doğruyu tekrarlıyor; en az yarısı bir yanlış şıkkın gerçekte ne olduğunu söylemeli.",
      );
    }
  }
  return issues;
}

function trueFalseExplanationRefutes(item: {
  text: string;
  correct: boolean;
  explanation: string;
  correctedStatement?: string;
}): boolean {
  const explanation = foldTr(item.explanation);
  const claim = foldTr(item.text);
  if (!explanation || explanation === claim) return false;
  if (item.correct) return explanation.length >= 12;
  const claimTokens = new Set(
    claim.split(/[^a-z0-9]+/).filter((token) => token.length >= 3),
  );
  const distinctive = foldTr(item.correctedStatement ?? "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !claimTokens.has(token));
  if (distinctive.some((token) => explanation.includes(token))) return true;
  return explanation.length >= 24 && explanation !== claim;
}

export function validateTrueFalsePedagogy(
  items: {
    text: string;
    correct: boolean;
    explanation: string;
    correctedStatement?: string;
    misconceptionTag?: string;
  }[],
  options?: { requireMisconceptionTag?: boolean },
): string[] {
  const issues: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const label = `Madde ${i + 1}`;
    if (VAGUE_TF.test(item.text) && item.text.split(/\s+/).length < 8) {
      issues.push(`${label}: belirsiz genelleme; somut iddia yaz.`);
    }
    if (!item.correct) {
      if (!item.correctedStatement?.trim()) {
        issues.push(`${label}: yanlış iddianın doğru hali eksik.`);
      } else if (item.correctedStatement.trim() === item.text.trim()) {
        issues.push(`${label}: correctedStatement iddiayla aynı.`);
      }
    }
    if (item.explanation.trim().length < 12) {
      issues.push(`${label}: explanation yetersiz.`);
    }
    if (options?.requireMisconceptionTag) {
      if ((item.misconceptionTag?.trim().length ?? 0) < 2) {
        issues.push(`${label}: misconceptionTag zorunlu.`);
      }
      if (!trueFalseExplanationRefutes(item)) {
        issues.push(`${label}: explanation iddiayı çürütmüyor.`);
      }
    }
  }
  return issues;
}

export function validateFlashcardPedagogy(
  cards: { front: string; back: string; difficulty?: string }[],
): string[] {
  const issues: string[] = [];
  if (cards.length < 4) return ["En az 4 kart gerekli."];

  let hardFirstOk = true;
  let sawNonHard = false;
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const label = `Kart ${i + 1}`;
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back) {
      issues.push(`${label}: ön/arka boş olamaz.`);
      continue;
    }
    if (front.toLocaleLowerCase("tr-TR").includes(back.toLocaleLowerCase("tr-TR")) && back.length > 3) {
      issues.push(`${label}: ön yüz cevabı sızdırıyor.`);
    }
    if (front === back) {
      issues.push(`${label}: ön ve arka aynı.`);
    }
    if (/[=:]\s*\S+/.test(front) && back.length < 40) {
      // "sin 30° = ?" is ok; "sin 30° = 1/2" on front leaks.
      const afterEq = front.split(/=/)[1]?.trim();
      if (afterEq && afterEq === back) {
        issues.push(`${label}: ön yüzde cevap var.`);
      }
    }
    if (card.difficulty === "hard" && sawNonHard) hardFirstOk = false;
    if (card.difficulty && card.difficulty !== "hard") sawNonHard = true;
  }
  if (!hardFirstOk) {
    issues.push("Zor kartlar (hard) listenin başına gelmeli.");
  }
  return issues;
}

/**
 * Podcast bölüm adı, dinleyicinin duyduğu tek gezinme işareti.
 *
 * Buradaki kontrol eskiden evre adlarını ARIYORDU; model de en kolay yolu
 * seçip bölümlere "TANIM / NEDEN / ÖRNEK / YAYGIN HATA / ÖZET" adını verdi.
 * Zemin podcast'inde dinleyici beş başlıktan hiçbirinde konunun adını
 * duymuyordu. Evre sırası dursun, adı görünmesin: başlık kavramı söylemeli.
 */
export function validatePodcastPedagogy(
  input: { title?: string; chapters: PodcastChapter[] | { title: string; lines: { text: string }[] }[] },
): string[] {
  const issues: string[] = [];
  const chapters = input.chapters ?? [];
  if (chapters.length < 4) {
    issues.push("Podcast en az 4 bölüm olmalı (tanım → neden → örnek → hata → özet akışı).");
  }
  const scaffold = chapters.filter((c) => isScaffoldHeading(c.title ?? ""));
  if (scaffold.length) {
    issues.push(
      `Bölüm başlığı şablon adı: ${scaffold.map((c) => c.title).join(", ")} — o bölümde konuşulan kavramı adlandır.`,
    );
  }
  const advice: string[] = [];
  for (const chapter of chapters) {
    if (!chapter.lines?.length) {
      issues.push(`Boş bölüm: ${chapter.title || "?"}`);
      continue;
    }
    for (const line of chapter.lines) {
      if (/\^|\\frac|\$\$/.test(line.text)) {
        issues.push("Formül konuşulabilir Unicode olmalı; LaTeX yok.");
      }
      // Sesli okunduğunda "2 üssü 3 artı 4" duyulur; kastedilen 2⁽³⁺⁴⁾ ise
      // öğrenci yanlış formülü duyar.
      if (brokenSuperscript(line.text)) {
        issues.push("Üs bölünmüş; üssün tamamı üst simge olmalı ya da hesaplanmalı.");
      }
      if (emptyMistake(line.text)) advice.push(line.text);
    }
  }
  // Tek bir öğüt cümlesi podcast'i bozmuyor; sorun bölümün TAMAMININ öğüde
  // dönmesiydi (zemin podcast'inde üç maddenin üçü de böyleydi). Her satırı
  // ayrı ayrı reddetmek üretimi tümden düşürdü: pediatri podcast'i üst üste
  // iki denemede "oluşturulamadı" verdi, çünkü tek cümlenin takılması bütün
  // taslağı çöpe atıyordu.
  if (advice.length >= 2) {
    issues.push(
      `Yaygın hata değil, öğüt: ${advice.map((t) => `"${t}"`).join(" ")} — öğrencinin gerçekten yaptığı yanlış adımı söyle.`,
    );
  }
  return issues;
}

type PodcastChapterLike = {
  title?: string;
  lines?: { text?: string; speaker?: "ada" | "kerem" }[];
};

/**
 * Şablon adlı bölüm ve öğüt satırı podcast'in tamamını düşürmesin.
 * Dört kavram bölümü kalıyorsa onlar yayınlanır. Kalmıyorsa taslak
 * olduğu gibi döner ve doğrulayıcı reddeder.
 */
export function publishablePodcast<T extends { chapters?: PodcastChapterLike[] }>(podcast: T): T {
  const chapters = (podcast.chapters ?? [])
    .map((chapter) => ({
      ...chapter,
      lines: (chapter.lines ?? []).filter((line) => !emptyMistake(line.text ?? "")),
    }))
    .filter(
      (chapter) => (chapter.lines?.length ?? 0) > 0 && !isScaffoldHeading(chapter.title ?? ""),
    );
  if (chapters.length < 4) return podcast;
  return { ...podcast, chapters };
}

/** Denetçiye giden podcast taslağı, tek bir şablon bölüm yüzünden düşmesin. */
export function podcastDraftForVerifier(draft: string): string {
  try {
    const parsed = JSON.parse(draft) as { chapters?: PodcastChapterLike[] };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.chapters)) return draft;
    return JSON.stringify(publishablePodcast(parsed));
  } catch {
    return draft;
  }
}

/**
 * "Yaygın hata" diye sunulan ama hata olmayan cümle.
 *
 * Zemin podcast'inde üç maddenin üçü de böyleydi: "Dane boyu dağılımını
 * anlamadan zemin sınıflandırması yapmak yanlıştır." Bu bir hata değil,
 * "dikkatli ol" öğüdü — dinleyici neyi yanlış yaptığını öğrenmiyor.
 * Gerçek hata somut olur: hangi değeri, hangi yerine koyuyor.
 */
export function emptyMistake(text: string): boolean {
  const folded = foldTr(text);
  const advice =
    /(anlamadan|bilmeden|dikkate almadan|goz ardi et|onemsemem|hesaba katmadan)/.test(
      folded,
    );
  const verdict = /(yanlis|hatali|dogru degil|eksik olur|sorun yaratir)/.test(folded);
  // Somut bir dayanak (sayı ya da sembol) varsa öğüt değil, gerçek hatadır.
  const concrete = /[0-9]|[=<>±×÷√]/.test(text);
  return advice && verdict && !concrete;
}

export function validateOralPedagogy(
  questions: {
    prompt: string;
    learningObjective?: string;
    rubricCriteria?: string[];
    expectedPoints?: string[];
  }[],
): string[] {
  const issues: string[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const label = `Sözlü ${i + 1}`;
    if (q.prompt.trim().length < 8) issues.push(`${label}: soru kısa.`);
    if (!q.rubricCriteria?.length) {
      issues.push(`${label}: rubricCriteria zorunlu.`);
    }
    if (!q.expectedPoints?.length) {
      issues.push(`${label}: expectedPoints zorunlu.`);
    }
  }
  return issues;
}

/**
 * Flashcard completion under v2: finishing the deck is participation,
 * not exam mastery. Known marks are recorded separately for Stage 6.
 */
export function scoreFlashcardsV2(
  cardCount: number,
  answers: Record<string, unknown>,
): { score: number; total: number; knownCount: number; masteryClaim: false } {
  let knownCount = 0;
  for (let i = 0; i < cardCount; i += 1) {
    if (answers[String(i)] === true || answers[String(i)] === "true") knownCount += 1;
  }
  return {
    score: cardCount > 0 ? 1 : 0,
    total: 1,
    knownCount,
    masteryClaim: false,
  };
}

export type LessonReviewCard = { front: string; back: string };

/**
 * Dersin kısa tekrarında kaçırılan soru, aralıklı tekrara varyantıyla gider.
 * Soru metni istemciden değil, saklı dersten kurulur.
 */
export function lessonMissDrafts(input: {
  lesson: Pick<LessonV2, "sections">;
  missedSectionIndexes: number[];
  topicLabel?: string | null;
  language?: MaterialLanguage;
}): MisconceptionDraft[] {
  const seen = new Set<number>();
  const out: MisconceptionDraft[] = [];
  for (const index of input.missedSectionIndexes) {
    if (!Number.isInteger(index) || seen.has(index)) continue;
    seen.add(index);
    const section = input.lesson.sections[index];
    const check = section?.check;
    if (!check) continue;
    const variant = reviewQuestionFor(check, input.language ?? "tr");
    const correct = variant.options[variant.answerIndex]?.trim();
    if (!correct || !variant.prompt.trim()) continue;
    out.push({
      claim: section.heading,
      corrected: `${correct}. ${check.explanation}`.slice(0, 400),
      wrongType: "lesson_check_miss",
      sourceKind: "lesson_review",
      topicLabel: input.topicLabel ?? null,
      questionPreview: variant.prompt.slice(0, 300),
    });
  }
  return out.slice(0, 8);
}

/** Aralıklı tekrar destesinin sonuna eklenecek kartlar. Aynı yüz iki kez girmez. */
export function cardsFromLessonReviews(
  rows: {
    question_preview?: string | null;
    questionPreview?: string | null;
    corrected?: string | null;
    claim?: string | null;
    source_kind?: string | null;
    sourceKind?: string | null;
  }[],
): LessonReviewCard[] {
  const cards: LessonReviewCard[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const kind = row.sourceKind ?? row.source_kind;
    if (kind && kind !== "lesson_review") continue;
    const front = (row.questionPreview ?? row.question_preview ?? "").trim();
    const back = (row.corrected ?? row.claim ?? "").trim();
    if (front.length < 8 || back.length < 2) continue;
    const key = front.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ front: front.slice(0, 280), back: back.slice(0, 400) });
  }
  return cards.slice(0, 8);
}

/**
 * Üretilmiş kartların indeksi bozulmasın diye tekrar kartları sona eklenir.
 * Başa koymak, kayıtlı cevabın başka karta yazılmasına yol açardı.
 */
export function appendLessonReviewCards<T extends { front: string }>(
  cards: T[],
  extra: LessonReviewCard[],
): Array<T | (LessonReviewCard & { difficulty: "hard" })> {
  const seen = new Set(cards.map((card) => card.front.trim().toLocaleLowerCase("tr")));
  const tail = extra
    .filter((card) => !seen.has(card.front.trim().toLocaleLowerCase("tr")))
    .map((card) => ({ ...card, difficulty: "hard" as const }));
  return [...cards, ...tail];
}

/** Collect misconception hooks from a completed attempt (cheap Stage 6 prep). */
export function extractMisconceptions(input: {
  kind: PlanNodeKind;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel?: string | null;
  language?: MaterialLanguage;
}): MisconceptionDraft[] {
  const data = (input.payload ?? {}) as Record<string, unknown>;
  const out: MisconceptionDraft[] = [];
  const topicLabel = input.topicLabel ?? null;

  if (data.type === "true_false") {
    const items =
      (data.items as {
        text: string;
        correct: boolean;
        correctedStatement?: string;
        misconceptionTag?: string;
        explanation?: string;
      }[]) ?? [];
    items.forEach((item, index) => {
      const value = input.answers[String(index)];
      const ok = value === item.correct || value === String(item.correct);
      if (ok) return;
      out.push({
        claim: item.text,
        corrected: item.correctedStatement ?? item.explanation ?? null,
        wrongType: item.misconceptionTag?.trim() || "true_false_miss",
        sourceKind: "true_false",
        topicLabel,
        questionPreview: item.text.slice(0, 160),
      });
    });
  }

  if (data.type === "quiz") {
    const questions =
      (data.questions as (QuizQuestion & { misconceptionTag?: string; learningObjective?: string })[]) ??
      [];
    questions.forEach((question, index) => {
      const raw = input.answers[String(index)];
      const selected = Array.isArray(raw)
        ? raw.map(String)
        : raw == null || raw === ""
          ? []
          : [String(raw)];
      const a = [...selected].sort().join("|");
      const b = [...question.correct].sort().join("|");
      if (a === b) return;
      out.push({
        claim: selected.join(", ") || "(boş)",
        corrected: question.correct.join(", "),
        wrongType: question.misconceptionTag?.trim() || "quiz_miss",
        sourceKind: input.kind,
        topicLabel,
        questionPreview: question.text.slice(0, 160),
      });
    });
  }

  if (data.type === "lesson") {
    const lesson = lessonV2Schema.safeParse(data.lesson).data;
    if (lesson) {
      const raw = input.answers.lessonMisses;
      const indexes = Array.isArray(raw)
        ? raw.filter((value): value is number => typeof value === "number" && Number.isInteger(value))
        : [];
      out.push(
        ...lessonMissDrafts({
          lesson,
          missedSectionIndexes: indexes,
          topicLabel,
          language: input.language,
        }),
      );
    }
  }

  return out.slice(0, 20);
}

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
        "EN AZ 3 kavram bölümü. HER bölümde check zorunlu: type trueFalse ekranda " +
        "DOĞRU MU YANLIŞ, type mcq ekranda HIZLI SINAV. explanation (AÇIKLAMA) yanlış " +
        "seçeneğin neden çürük olduğunu yazsın; yalnızca doğruyu tekrarlama. " +
        "overview 400 karakteri aşmasın. example.solution adım adım ve gerekçeli. " +
        "nextFocus en az bir sonraki çalışma. Kaynakta olmayan formül veya teorem yazma; " +
        "emin değilsen materyalde geçtiği hâliyle söyle."
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
  prompt: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(160)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
});

export const sectionCheckSchema = z.object({
  type: z.enum(["mcq", "trueFalse"]),
  prompt: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(160)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(8).max(400),
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

export const lessonV2Schema = z.object({
  title: z.string().min(2).max(120),
  objective: z.string().min(12).max(240),
  overview: z.string().min(20).max(600),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2),
        // Anahtar terimler **iki yıldız** arasında gelir; ekranda koyu
        // görünür. Sınava iki gün kala dersi yeniden okuyan öğrenci neye
        // bakacağını düz paragraftan çıkaramıyordu.
        body: z.string().min(20).max(900),
        check: sectionCheckSchema.optional(),
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
    // Alt sınır ikide: şablon adlı bölüm ayıklanınca (dropScaffoldSections)
    // geriye iki kavram bölümü kalabiliyor ve bu nesne hem sunucuda hem
    // tarayıcıda yeniden bu şemadan geçiyor. Üçte kalsaydı ayıklanmış ders
    // ekranda hiç çizilmezdi. Modelden üç bölüm istemeyi şema değil
    // validateLessonPedagogy sürdürüyor.
    .min(2)
    .max(6),
  example: z.object({
    prompt: z.string().min(8),
    solution: z.string().min(8),
  }),
  commonMistake: z.object({
    claim: z.string().min(8),
    correction: z.string().min(8),
  }),
  infoCheck: z.object({
    prompt: z.string().min(8),
    answer: z.string().min(4),
  }),
  summary: z.array(z.string().min(2)).min(2).max(6),
  nextFocus: z.array(z.string().min(2)).min(1).max(4),
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
/** Şema geçerse şablon başlıklarını ayıkla. Üretim kapısı bundan sonra bakar. */
export function prepareLessonDraft(raw: unknown): LessonV2 | null {
  const parsed = lessonV2Schema.safeParse(raw).data;
  if (!parsed) return null;
  return sanitizeReviewVariants(dropScaffoldSections(parsed));
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
  if (wallOfText(lesson.overview)) {
    issues.push("Genel bakış çok uzun; kısa tut.");
  }
  // Şema ikiye iniyor ama modelden istenen hâlâ üç: iki bölüm yalnızca
  // ayıklama sonrası kabul edilebilir bir kalıntı, taslak hedefi değil.
  //
  // Alt sınır dışarıdan verilebiliyor: kaynaktan gelen bölüm omurgası iki
  // başlıksa prompt iki bölüm istiyor, burada üç dayatmak her taslağı
  // reddediyordu ve ders hiç üretilmiyordu.
  const minSections = options.minSections ?? 3;
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
  const objectiveFolded = foldTr(lesson.objective);
  if (objectiveFolded.includes(titleFolded)) {
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
    lesson.overview,
    ...lesson.sections.map((s) => s.body),
    lesson.example.prompt,
    lesson.example.solution,
    lesson.commonMistake.correction,
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
  if (lesson.commonMistake.claim === lesson.commonMistake.correction) {
    issues.push("Yaygın hata ile düzeltme aynı olamaz.");
  }
  if (!lesson.objective.trim()) {
    issues.push("Öğrenme hedefi zorunlu.");
  }
  return [...issues, ...blockingLessonIssues(lesson)];
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
 * Ders üretim kapısı. `validateLessonPedagogy` ayıklanmış iki bölümlük
 * kalıntıyı da ölçer; burası yayına gidecek dersi ölçer ve atlanamaz:
 * hedef, en az üç kavram bölümü, her bölümde kontrol + açıklama, örnek,
 * yaygın hata, nextFocus.
 */
export function validateLessonV2(
  raw: unknown,
  options: { minSections?: number } = {},
): string[] {
  const prepared = prepareLessonDraft(raw) ?? raw;
  const issues = validateLessonPedagogy(prepared, options);
  const lesson = lessonV2Schema.safeParse(prepared).data;
  if (!lesson) return issues;
  const floor = Math.max(3, options.minSections ?? 3);
  if (lesson.sections.length < floor && !issues.some((issue) => issue.includes("en az"))) {
    issues.push(`Ders en az ${floor} kavram bölümü istiyor.`);
  }
  if (lesson.overview.trim().length > 400) {
    issues.push("Genel bakış 400 karakteri aşıyor; konunun özünü kısa yaz.");
  }
  if (lesson.example.solution.trim() === lesson.example.prompt.trim()) {
    issues.push("Çözüm, sorunun tekrarı olamaz; adım ve gerekçe yaz.");
  } else if (!solutionIsJustified(lesson.example.solution)) {
    issues.push("Çözüm adım adım ve gerekçeli olmalı; yalnızca sonucu yazma.");
  }
  if (foldTr(lesson.infoCheck.answer) === foldTr(lesson.infoCheck.prompt)) {
    issues.push("Bilgi kontrolünün yanıtı sorunun tekrarı olamaz.");
  }
  if (!lesson.nextFocus.some((item) => item.trim().length >= 2)) {
    issues.push("nextFocus zorunlu.");
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

/**
 * Kısa tekrar, ders üretiminin içinde yazılır. Kapıda soru başına
 * ayrı bir model çağrısı yok.
 */
export const REVIEW_VARIANT_RULE =
  "Her check.review aynı kavramı farklı bir cümleyle sorar; orijinal cümleyi kopyalama. " +
  "review.options orijinal şıkların aynı yazımıdır, sıra karışıktır. " +
  "Yeni şık, sayı veya formül yok. Doğru/yanlışta iddianın doğruluk değeri değişmez.";

/** İki rotanın ders şeması aynı metin. Diyagram eki rota ekler. */
export const LESSON_V2_SCHEMA_HINT =
  'JSON: {"title":string,"objective":string,"overview":string,' +
  '"sections":[{"heading":string,"body":string,"check":{"type":"mcq"|"trueFalse","prompt":string,"options":string[],"answerIndex":number,"explanation":string,"review":{"prompt":string,"options":string[],"answerIndex":number}},"note":{"title":string,"body":string},"cards":[{"title":string,"body":string}]}],' +
  '"example":{"prompt":string,"solution":string},"commonMistake":{"claim":string,"correction":string},' +
  '"infoCheck":{"prompt":string,"answer":string},"summary":string[],"nextFocus":string[]}. ' +
  "En az 3 kavram bölümü. Her bölümde check zorunlu: trueFalse ekranda DOĞRU MU YANLIŞ, mcq ekranda HIZLI SINAV. " +
  "explanation yanlış seçeneğin neden çürük olduğunu yazsın. " +
  `${REVIEW_VARIANT_RULE} ` +
  "example.solution adım adım ve gerekçeli. nextFocus en az bir sonraki çalışma. " +
  "cards isteğe bağlı: kardeş kavram kümesi varsa 2-6 kart; yoksa cards yazma, uydurma kart ekleme. " +
  "Kaynakta olmayan formül veya teorem yazma.";

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
    lesson.example.prompt,
    lesson.example.solution,
    lesson.commonMistake.correction,
  ];
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

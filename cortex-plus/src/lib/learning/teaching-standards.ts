/**
 * Stage 5 — shared teaching-standard contract for pdf_learning_v2.
 * Schemas, prompt constraints, and deterministic pedagogy validators.
 * Legacy paths stay untouched when the flag is OFF.
 */

import { z } from "zod";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { foldTr } from "@/lib/documents/page-analysis";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import type { PodcastChapter } from "@/lib/learning/podcast-script";

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
        "öğrenci isterse çözümü göster. Her soruda learningObjective yaz."
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
        "Sonucun doğru çıkması ara adımı doğrulamaz — yanlış bir ara adımla doğru sonuca varma."
      );
    case "quiz":
      return (
        "Her soruda net learningObjective. Yeterli bilgi ver. correct seçenekleri options içinde birebir. " +
        "Çeldiriciler gerçek yanılgılardan gelsin (misconceptionTag). Açıklama doğru kümesiyle uyumlu. " +
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
        "explanation nedeni anlatsın. misconceptionTag ile yanılgı etiketle (Stage 6 için)."
      );
    case "podcast":
      return (
        "Konu+hedefe bağlı. Kaynak noktalarını önceden seç. Bölüm sırası: Tanım → Neden → Örnek → " +
        "Yaygın hata → Özet. Formüller konuşulabilir Unicode. Kaynak dışı iddia yok. " +
        "Her bölüm başlığı ve satırlar TTS öncesi doğrulanabilir kısa cümleler."
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
export const sectionCheckSchema = z.object({
  type: z.enum(["mcq", "trueFalse"]),
  prompt: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(160)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(8).max(400),
});

export type SectionCheck = z.infer<typeof sectionCheckSchema>;

export const lessonV2Schema = z.object({
  title: z.string().min(2).max(120),
  objective: z.string().min(12).max(240),
  overview: z.string().min(20).max(600),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2),
        body: z.string().min(20).max(900),
        check: sectionCheckSchema.optional(),
      }),
    )
    .min(3)
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
  return SCAFFOLD_HEADINGS.includes(
    foldTr(heading).replace(/[^a-z ]/g, "").trim(),
  );
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

/** Deterministic lesson pedagogy checks (structure → pedagogy). */
export function validateLessonPedagogy(raw: unknown): string[] {
  const parsed = lessonV2Schema.safeParse(raw);
  if (!parsed.success) {
    return ["Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü)."];
  }
  const lesson = parsed.data;
  const issues: string[] = [];
  if (wallOfText(lesson.overview)) {
    issues.push("Genel bakış çok uzun; kısa tut.");
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
    const check = section.check;
    if (!check) continue;
    if (check.answerIndex >= check.options.length) {
      issues.push(`Kontrol cevabı seçenek dışında: ${section.heading}`);
    }
    const normalized = check.options.map((o) => o.trim().toLocaleLowerCase("tr"));
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`Kontrol seçenekleri tekrar ediyor: ${section.heading}`);
    }
    if (check.type === "trueFalse" && check.options.length !== 2) {
      issues.push(`Doğru/yanlış kontrolü iki seçenekli olmalı: ${section.heading}`);
    }
    // Çeldirici, doğru cevabın kopyası ya da "hiçbiri" türü dolgu olmamalı.
    if (normalized.some((o) => o === "hiçbiri" || o === "hepsi")) {
      issues.push(`Dolgu şık kullanılmış: ${section.heading}`);
    }
  }
  if (lesson.commonMistake.claim === lesson.commonMistake.correction) {
    issues.push("Yaygın hata ile düzeltme aynı olamaz.");
  }
  if (!lesson.objective.trim()) {
    issues.push("Öğrenme hedefi zorunlu.");
  }
  return issues;
}

/**
 * Açıklama yanlış şıkkı çürütüyor mu?
 *
 * Üretilmiş beş quiz sorusuna bakınca beşinin de açıklaması yalnızca
 * doğruyu tekrarlıyordu: "Sinus(y)=-1 sağlayan açı 270°'dir." Öğrenci
 * neden 90° değil öğrenmiyor. Astra'nın açıklaması her çeldiricinin
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
  options?: { requireObjective?: boolean },
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
  if (multiOption.length >= 2) {
    const refuting = multiOption.filter(explanationRefutesADistractor).length;
    if (refuting * 2 < multiOption.length) {
      issues.push(
        "Açıklamalar yalnızca doğruyu tekrarlıyor; en az yarısı bir yanlış şıkkın gerçekte ne olduğunu söylemeli.",
      );
    }
  }
  return issues;
}

export function validateTrueFalsePedagogy(
  items: {
    text: string;
    correct: boolean;
    explanation: string;
    correctedStatement?: string;
  }[],
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

/** Collect misconception hooks from a completed attempt (cheap Stage 6 prep). */
export function extractMisconceptions(input: {
  kind: PlanNodeKind;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel?: string | null;
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

  return out.slice(0, 20);
}

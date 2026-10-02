import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { normalizeQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { exponentKeyWrong } from "@/lib/learning/exponent-key";
import { mathKeyWrong, mathOptionsAmbiguous } from "@/lib/learning/math-key";
import { sourceText, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";

/**
 * Öğretmen test motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik yeni
 * motora). Ders motorunun aynası: temiz çekirdek sayfalar → tek öğretmen
 * istemi → soruları bağımsız çözen model denetimi → sorunlu soruyu modelin
 * düzeltmesi. Kod soru metnine hiçbir şey eklemez; yalnız denetler ve
 * denetimden geçmeyen soruyu göstermez.
 *
 * Eski yol (exam-quiz-generate.ts) taslağın üstünde metni değiştiren
 * onarımlar (repairTurkishSurface, repairQuizPedagogy) ve birkaç katman
 * kelime örtüşmeli doğrulayıcı çalıştırıyordu.
 */

export type TeacherQuizInput = {
  topicLabel: string;
  prepTitle: string;
  /** Temiz kaynak sayfaları; belgesiz hazırlıkta boş. */
  pages: { page: number; text: string }[];
  mode?: TeacherLessonMode;
  /** Öğrenciye gidecek soru sayısı. */
  count: number;
  /** "gaps": tuzak / zayıf nokta soruları. */
  focus?: "practice" | "gaps";
  /** Aşinalık ve ruh hali satırı. */
  learnerLine?: string;
  runningHeaders?: string[];
};

const SCHEMA = `{
  "questions": [
    {
      "text": "soru kökü; cevabı içinde vermez",
      "options": ["…","…","…","…"],
      "correct": "doğru şıkkın metni, options içinden aynen",
      "multi": false,
      "explanation": "doğru cevabın nedeni + her çeldiricinin gerçekte ne olduğu, 1-3 cümle",
      "optionWhy": ["şık 1 için tek cümle", "şık 2", "şık 3", "şık 4"],
      "misconceptionTag": "bu sorunun yakaladığı yanılgının adı",
      "learningObjective": "bu soru neyi ölçüyor, tek cümle",
      "steps": ["yalnız hesap sorusunda 2-5 kısa adım; son adım doğru şıkka varır"]
    }
  ]
}`;

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her soru, her şık ve her gerekçe yalnızca KAYNAK metnindeki bilgiye dayanır. Kaynakta yoksa " +
  "sorma; genel kültürden ekleme. Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz. Kaynakta " +
  "açıkça bozuk bir cümle varsa (olumsuzluk eki düşmüş, kendi örnekleriyle çelişiyor) kaynağın kendi açıklama ve " +
  "örneklerinden anlaşılan anlamı kullan; bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Soruları sınav müfredatındaki yerleşik, ders kitaplarında " +
  "tartışmasız bilgiden yaz. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı sorma; güncel olarak " +
  "değişebilecek bilgiyi sorma. Aşağıda 'kaynak' denen her yer bu testte konunun yerleşik bilgisi anlamına gelir.\n\n";

const DESIGN =
  "SORU TASARIMI:\n" +
  "- Sınavdaki gibi, düşündüren sorular yaz; ezber cümlesini kopyalayıp boşluk açma.\n" +
  "- Türleri karıştır: bir durumdan (olaydan) kavramı buldurma; birbirine karıştırılan iki kardeş kavramı ayırt " +
  "ettirme; bir özelliğin hangi kavrama ait olduğunu sorma; kaynakta sayı ya da bağıntı varsa hesap.\n" +
  "- Her soru tek kavramı ölçer. Kolaydan zora sırala.\n" +
  "- 4 şık. Tek doğru şık (multi false). Çeldiriciler aynı ailedeki kardeş terimler ya da öğrencinin gerçekten " +
  "yaptığı hata; şıklar aynı türden ve benzer uzunlukta. 'Hepsi', 'hiçbiri', 'yukarıdakilerin' şıkkı yok.\n" +
  "- Kök cevabı vermez; doğru şıkkın kelimeleri kökte geçmez. Sayma sorusu ('kaç tür vardır') yok. Olumsuz kök " +
  "('hangisi değildir') en fazla bir soruda ve olumsuz ek **koyu** yazılır.\n" +
  "- explanation doğrunun nedenini söyler VE her çeldiricinin gerçekte ne olduğunu söyler. optionWhy her şık için bir " +
  "cümle, options ile aynı sırada. Hesap sorusunda steps: her adım tek işlem, kendi içinde doğru.\n" +
  "- Yazmadan önce her soruyu kendin çöz: tek doğru cevap var mı, anahtar doğru mu, diğer şıkların her biri kesin " +
  "yanlış mı?\n\n" +
  "YAZMA: 'Kaynak:', sayfa numarası, 'metne göre', 'belgede', 'PDF'.\n\n";

const GAPS_FOCUS =
  "BU TEST TUZAK SORULARI: her soru, kaynağın uyardığı ya da öğrencinin sık karıştırdığı bir ayrımı yoklar " +
  "(yakın iki kavram, istisna, koşul). misconceptionTag o tuzağın adıdır.\n\n";

function system(mode: TeacherLessonMode, focus: TeacherQuizInput["focus"]): string {
  const intro =
    mode === "topic"
      ? "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ama belge yüklemedi. Bu konudan, sınavdaki " +
        "gibi kısa bir test hazırlıyorsun.\n\n"
      : "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ve sana kendi ders belgesini verdi. Bu " +
        "belgeden, sınavdaki gibi kısa bir test hazırlıyorsun.\n\n";
  return (
    intro +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    DESIGN +
    (focus === "gaps" ? GAPS_FOCUS : "") +
    `${CONTENT_STYLE}\n\nYalnızca bu şemada JSON döndür:\n${SCHEMA}`
  );
}

export function quizSystem(mode: TeacherLessonMode = "document", focus: TeacherQuizInput["focus"] = "practice"): string {
  return system(mode, focus);
}

export function quizUserPrompt(input: TeacherQuizInput, ask = input.count): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    `SORU SAYISI: ${ask}`,
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.mode === "topic" ? "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle yaz)" : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const VERIFY_DOCUMENT =
  "Sen titiz bir sınav sorusu denetçisisin. Testi yazıldığı KAYNAK ile karşılaştırıyorsun. HER SORUYU ÖNCE KENDİN " +
  "ÇÖZ (anahtara bakmadan), sonra anahtarla karşılaştır. Şunları bul:\n" +
  "A) Anahtar yanlış: senin çözümün farklı bir şık.\n" +
  "B) Birden fazla savunulabilir doğru şık ya da hiç doğru şık yok; kök belirsiz.\n" +
  "C) Kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi (kök, şık ya da gerekçede).\n" +
  "D) explanation, optionWhy ya da steps'te yanlış bilgi; optionWhy satırının yanlış şıkka ait olması.\n" +
  "E) Kökün cevabı vermesi.\n" +
  "F) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "Kaynakta açıkça bozuk bir cümlenin kaynağın kendi örnekleriyle tutarlı anlamıyla kullanılması sorun değildir.\n" +
  "A-F 'high'. Şunlar 'low': kolay soru, uzun gerekçe.\n";

const VERIFY_TOPIC =
  "Sen titiz bir sınav sorusu denetçisisin. Belgesi olmayan bir testi doğruluk açısından denetliyorsun. HER SORUYU ÖNCE " +
  "KENDİN ÇÖZ (anahtara bakmadan), sonra anahtarla karşılaştır. Şunları bul:\n" +
  "A) Anahtar yanlış: senin çözümün farklı bir şık.\n" +
  "B) Birden fazla savunulabilir doğru şık ya da hiç doğru şık yok; kök belirsiz.\n" +
  "C) Yanlış ya da tartışmalı bilgi; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n" +
  "D) explanation, optionWhy ya da steps'te yanlış bilgi ya da hesap hatası; optionWhy satırının yanlış şıkka ait olması.\n" +
  "E) Kökün cevabı vermesi.\n" +
  "F) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "A-F 'high'. Şunlar 'low': kolay soru, uzun gerekçe.\n";

const VERIFY_JSON =
  'JSON döndür: {"issues":[{"question":0,"severity":"high","problem":"…","fix":"…"}]} — question, 0\'dan başlayan ' +
  "soru sırasıdır. Sorun yoksa issues boş dizi.";

export function quizVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (mode === "topic" ? VERIFY_TOPIC : VERIFY_DOCUMENT) + VERIFY_JSON;
}

export function quizVerifyUserPrompt(questions: QuizQuestion[], input: TeacherQuizInput): string {
  const head =
    input.mode === "topic"
      ? `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz test.)`
      : `KAYNAK:\n${sourceText(input.pages)}`;
  return `${head}\n\nTEST (JSON):\n${JSON.stringify({ questions: questions.map(publicShape) })}`;
}

export function quizFixSystem(mode: TeacherLessonMode = "document", focus: TeacherQuizInput["focus"] = "practice"): string {
  return (
    "Sen aynı testi yazan öğretmensin. Denetçinin sorun bulduğu soruları düzelt: anahtarı düzelt, tek doğru şık kalacak " +
    "biçimde şıkları değiştir, kaynakta dayanağı olmayan bilgiyi çıkar, gerekçeyi düzelt. Bir soru düzeltilemiyorsa aynı " +
    "kavramı ölçen yeni bir soru yaz. Önerilen düzeltme ('→' sonrası) varsa uygula. Yalnız verilen soruları, aynı " +
    "sayıda ve aynı sırayla döndür. Kurallar ve şema aynı:\n\n" +
    system(mode, focus)
  );
}

export function quizFixUserPrompt(
  failing: { question: QuizQuestion; problems: string[] }[],
  input: TeacherQuizInput,
): string {
  return [
    quizUserPrompt(input, failing.length),
    `DÜZELTİLECEK SORULAR (JSON):\n${JSON.stringify({ questions: failing.map((item) => publicShape(item.question)) })}`,
    `SORUNLAR:\n${failing
      .map((item, index) => `Soru ${index}: ${item.problems.map((problem) => problem).join(" | ")}`)
      .join("\n")}`,
    "Düzeltilmiş soruları aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

function publicShape(question: QuizQuestion) {
  return {
    text: question.text,
    options: question.options,
    correct: question.multi ? question.correct : question.correct[0],
    multi: question.multi,
    explanation: question.explanation,
    optionWhy: question.optionWhy,
    misconceptionTag: question.misconceptionTag,
    learningObjective: question.learningObjective,
    ...(question.steps?.length ? { steps: question.steps } : {}),
  };
}

/** Model çıktısını soru tipine oturtur. Metne bir şey eklemez; yalnız boşluk kırpar. */
export function parseTeacherQuiz(raw: unknown): QuizQuestion[] | null {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const questions = list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.text !== "string" || !Array.isArray(row.options)) return [];
    const normalized = normalizeQuizQuestion({
      text: row.text,
      options: row.options.map((option) => String(option)),
      correct: (row.correct ?? "") as string | string[],
      multi: row.multi === true,
      explanation: typeof row.explanation === "string" ? row.explanation : undefined,
      learningObjective: typeof row.learningObjective === "string" ? row.learningObjective : undefined,
      misconceptionTag: typeof row.misconceptionTag === "string" ? row.misconceptionTag : undefined,
      optionWhy: Array.isArray(row.optionWhy) ? row.optionWhy.map((line) => String(line)) : undefined,
      steps: Array.isArray(row.steps) ? row.steps.map((line) => String(line)) : undefined,
    });
    return normalized ? [normalized] : [];
  });
  return questions.length ? questions : null;
}

export type QuizIssue = { question: number; severity: "high" | "low"; problem: string; fix?: string };

export function parseQuizIssues(raw: unknown): QuizIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    const question = typeof row.question === "number" ? row.question : Number(row.question);
    if (!problem || !Number.isInteger(question) || question < 0) return [];
    return [
      {
        question,
        severity: row.severity === "low" ? ("low" as const) : ("high" as const),
        problem: problem.slice(0, 400),
        fix: typeof row.fix === "string" ? row.fix.slice(0, 400) : undefined,
      },
    ];
  });
}

const BANNED_OPTION = /^(hepsi|hiçbiri|yukarıdaki|tümü|hiç biri)/i;
// \b Türkçe harfi tanımıyor ("kaç" ç ile biter); boşlukla sınırla.
const COUNTING = /(?:^|\s)kaç\s+(?:\S+\s+){0,2}(tür|çeşit|başlık|madde|unsur|aşama|basamak)/i;

/**
 * Yapı denetimi (saf). Sorunu düzeltmez; soruyu düzeltme turuna yollar.
 * Hesap anahtarı denetimi (exponentKeyWrong, mathKeyWrong) metne dokunmaz,
 * yalnız anahtarın hesapla çeliştiğini söyler.
 */
export function quizStructureIssues(question: QuizQuestion): string[] {
  const issues: string[] = [];
  if (question.options.length !== 4) issues.push(`Şık sayısı ${question.options.length}; 4 olmalı.`);
  if (question.multi || question.correct.length !== 1) issues.push("Tek doğru şık olmalı (multi false).");
  if (!question.explanation?.trim()) issues.push("explanation yok.");
  if ((question.optionWhy?.length ?? 0) !== question.options.length) {
    issues.push("optionWhy her şık için bir cümle olmalı, şık sayısı kadar ve aynı sırada.");
  }
  if (question.options.some((option) => BANNED_OPTION.test(option.trim()))) {
    issues.push("'Hepsi / hiçbiri / yukarıdakiler' şıkkı kullanılmış.");
  }
  if (COUNTING.test(question.text)) issues.push("Sayma sorusu ('kaç tür'); kavramı ölçen soru yaz.");
  const answer = question.correct[0] ?? "";
  if (answer.length >= 6 && question.text.toLocaleLowerCase("tr").includes(answer.toLocaleLowerCase("tr"))) {
    issues.push("Kök doğru şıkkı içeriyor; cevabı veriyor.");
  }
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede/i.test(question.text)) {
    issues.push("Kökte kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  const keyed = {
    type: "mcq",
    prompt: question.text,
    options: question.options,
    answerIndex: question.options.indexOf(answer),
  };
  if (exponentKeyWrong(keyed) === true || mathKeyWrong(keyed) === true) {
    issues.push("Cevap anahtarı hesapla çelişiyor.");
  } else if (mathOptionsAmbiguous(keyed)) {
    issues.push("Birden fazla şık aynı değere çıkıyor.");
  }
  return issues;
}

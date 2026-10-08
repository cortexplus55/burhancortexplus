import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { sourceText, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { issuesByItem, teacherItemLoop, type Reviewed } from "@/lib/learning/teacher-item-loop";

/**
 * Öğretmen motoru: doğru/yanlış önermeleri ve sözlü deneme soruları
 * (2 Ekim 2026, ürün sahibinin kararı: tüm içerik yeni motora). Taslak →
 * her öğeyi belgeyle eşleyen model denetimi → sorunlu öğenin düzeltilmesi.
 * Kod öğe metnine dokunmaz. Eski sözlü yol (publishOralQuestions) metni
 * onarıyor ve beklenen nokta yoksa kaynaktan cümle yapıştırıyordu.
 */

export type PracticeSource = {
  topicLabel: string;
  prepTitle: string;
  mode?: TeacherLessonMode;
  /** Temiz çekirdek sayfalar ya da hazır kaynak bloğu (sözlüde birden çok konu). */
  pages: { page: number; text: string }[];
  sourceBlock?: string;
  learnerLine?: string;
  /** Müfredat ağırlığı / kapsam satırı. */
  brief?: string;
};

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her öğe yalnızca KAYNAK'taki bilgiye dayanır; kaynakta yoksa yazma, genel kültürden ekleme. " +
  "Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz; açıkça bozuk bir kaynak cümlesinin kaynağın " +
  "kendi örnekleriyle tutarlı anlamını kullan ve bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Sınav müfredatındaki yerleşik, tartışmasız bilgiden yaz; " +
  "emin olmadığın sayı, tarih, madde ya da kuralı yazma; güncel olarak değişebilecek bilgiyi yazma.\n\n";

function rule(mode: TeacherLessonMode): string {
  return mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT;
}

function sourceLines(input: PracticeSource): string {
  if (input.mode === "topic") return "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle yaz)";
  return `KAYNAK:\n${input.sourceBlock?.trim() || sourceText(input.pages)}`;
}

function userPrompt(input: PracticeSource, label: string, ask: number): string {
  return [
    input.prepTitle ? `SINAV: ${input.prepTitle}` : "",
    input.topicLabel ? `KONU: ${input.topicLabel}` : "",
    `${label}: ${ask}`,
    input.brief ? `KAPSAM: ${input.brief}` : "",
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    sourceLines(input),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function verifyHead(input: PracticeSource): string {
  return input.mode === "topic"
    ? `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz.)`
    : sourceLines(input);
}

const VERIFY_JSON =
  'JSON döndür: {"issues":[{"item":0,"severity":"high","problem":"…","fix":"…"}]} — item, 0\'dan başlayan sıradır. ' +
  "Sorun yoksa issues boş dizi.";

/* ───────────────────────── Doğru / yanlış ───────────────────────── */

export type TrueFalseItem = {
  text: string;
  correct: boolean;
  explanation: string;
  correctedStatement?: string;
  misconceptionTag?: string;
};

function tfSystem(mode: TeacherLessonMode): string {
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencinin sınavı için doğru/yanlış önermeleri yazıyorsun. " +
    (mode === "topic" ? "Belgesi yok.\n\n" : "Önermeler onun kendi ders belgesinden.\n\n") +
    rule(mode) +
    "ÖNERME TASARIMI:\n" +
    "- Her önerme tek, açık, doğruluğu kesin değerlendirilebilen bir cümle; soru değil, soru işareti yok.\n" +
    "- Yanlış önermeler öğrencinin GERÇEKTEN yaptığı hatayı taşır: iki kardeş kavramı yer değiştirmek, koşulu ya da " +
    "istisnayı düşürmek, sonucu tersine çevirmek. Bariz saçma önerme yok.\n" +
    "- Doğru ve yanlış önermeler yaklaşık yarı yarıya; her önerme farklı bir kavramı yoklar.\n" +
    "- 'Her zaman / asla / genelde' gibi belirsiz genelleme ve bağlamı eksik sayı yok.\n" +
    "- explanation: neden doğru ya da yanlış olduğunu söyler; yanlışsa iddiayı çürütür. Yanlış önermede " +
    "correctedStatement önermenin doğru hâlidir. misconceptionTag: yokladığı yanılgının kısa adı.\n\n" +
    "YAZMA: 'Kaynak:', sayfa numarası, 'metne göre', 'belgede'.\n\n" +
    `${CONTENT_STYLE}\n\n` +
    'Yalnızca bu şemada JSON döndür: {"items":[{"text":"…","correct":true,"explanation":"…","correctedStatement":"yalnız yanlışta","misconceptionTag":"…"}]}'
  );
}

export function trueFalseSystem(mode: TeacherLessonMode = "document"): string {
  return tfSystem(mode);
}

export function trueFalseVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (
    "Sen titiz bir sınav sorusu denetçisisin. Doğru/yanlış önermelerini " +
    (mode === "topic" ? "doğruluk açısından denetliyorsun (belge yok). " : "KAYNAK ile karşılaştırıyorsun. ") +
    "HER ÖNERMEYİ ÖNCE KENDİN DEĞERLENDİR (anahtara bakmadan), sonra anahtarla karşılaştır. Şunları bul:\n" +
    "A) Anahtar yanlış (doğru dediği önerme yanlış ya da tersi).\n" +
    "B) Önerme belirsiz: bağlama göre hem doğru hem yanlış okunabiliyor.\n" +
    (mode === "topic"
      ? "C) Yanlış ya da tartışmalı bilgi.\n"
      : "C) Kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi.\n") +
    "D) explanation ya da correctedStatement yanlış; yanlış önermede correctedStatement yok.\n" +
    "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
    "A-E 'high'. 'low': kolay önerme.\n" +
    VERIFY_JSON
  );
}

export function parseTrueFalse(raw: unknown): TrueFalseItem[] | null {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return null;
  const items = list.flatMap((entry): TrueFalseItem[] => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
    if (text.length < 8 || typeof row.correct !== "boolean" || !explanation) return [];
    const corrected = typeof row.correctedStatement === "string" ? row.correctedStatement.trim() : "";
    const tag = typeof row.misconceptionTag === "string" ? row.misconceptionTag.trim().slice(0, 80) : "";
    return [
      {
        text,
        correct: row.correct,
        explanation,
        ...(corrected ? { correctedStatement: corrected } : {}),
        ...(tag ? { misconceptionTag: tag } : {}),
      },
    ];
  });
  return items.length ? items : null;
}

/** Yapı denetimi (saf): soru biçimi, eksik düzeltme, eksik gerekçe, kaynak notu. */
export function trueFalseStructureIssues(item: TrueFalseItem): string[] {
  const issues: string[] = [];
  if (/[?？]/u.test(item.text)) issues.push("Soru değil, önerme yaz (soru işareti var).");
  if (item.explanation.length < 12) issues.push("explanation çok kısa.");
  if (!item.correct && (!item.correctedStatement || item.correctedStatement === item.text)) {
    issues.push("Yanlış önermenin doğru hâlini correctedStatement'a yaz.");
  }
  if (!item.misconceptionTag) issues.push("misconceptionTag yok.");
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede/i.test(item.text)) {
    issues.push("Önermede kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  return issues;
}

export async function teacherTrueFalseLoop(ask: AskJson, input: PracticeSource & { count: number }, started = Date.now()) {
  const mode = input.mode ?? "document";
  const loop = await teacherItemLoop<TrueFalseItem>({
    count: input.count,
    started,
    deadlineMs: 200_000,
    maxFixRounds: 2,
    draft: async () => parseTrueFalse(await ask(tfSystem(mode), userPrompt(input, "ÖNERME SAYISI", input.count + 2))),
    review: async (items) => {
      const structural = items.map(trueFalseStructureIssues);
      try {
        const factual = issuesByItem(
          await ask(trueFalseVerifySystem(mode), `${verifyHead(input)}\n\nÖNERMELER (JSON):\n${JSON.stringify({ items })}`),
          items.length,
        );
        return items.map((_, index) => [...structural[index], ...factual[index]]);
      } catch (error) {
        const note = `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}`;
        return items.map(() => [note]);
      }
    },
    fix: async (failing: Reviewed<TrueFalseItem>[]) =>
      parseTrueFalse(
        await ask(
          "Sen aynı önermeleri yazan öğretmensin. Denetçinin sorun bulduğu önermeleri düzelt; düzeltilemiyorsa aynı " +
            "kavramı yoklayan yeni önerme yaz. Önerilen düzeltme ('→' sonrası) varsa uygula. Yalnız verilen önermeleri, " +
            "aynı sayıda ve sırayla döndür. Kurallar ve şema aynı:\n\n" +
            tfSystem(mode),
          [
            userPrompt(input, "ÖNERME SAYISI", failing.length),
            `DÜZELTİLECEK ÖNERMELER (JSON):\n${JSON.stringify({ items: failing.map((row) => row.item) })}`,
            `SORUNLAR:\n${failing.map((row, index) => `Önerme ${index}: ${row.problems.join(" | ")}`).join("\n")}`,
          ].join("\n\n"),
        ),
      ),
  });
  const mixed = loop.items.some((item) => item.correct) && loop.items.some((item) => !item.correct);
  return { items: loop.items, rejected: loop.rejected, rounds: loop.rounds, mixed };
}

/* ───────────────────────── Sözlü deneme ───────────────────────── */

export type OralItem = {
  prompt: string;
  hint?: string;
  learningObjective?: string;
  rubricCriteria: string[];
  expectedPoints: string[];
  modelAnswer: string;
};

function oralSystem(mode: TeacherLessonMode): string {
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencine sözlü sınav yapıyorsun: soruyu soracak, cevabını dinleyip " +
    "puanlayacaksın. " +
    (mode === "topic" ? "Belgesi yok.\n\n" : "Sorular onun kendi ders belgesinden.\n\n") +
    rule(mode) +
    "SORU TASARIMI:\n" +
    "- Her soru tek, açık, kendi cümleleriyle cevaplanacak bir soru: açıkla, karşılaştır, bir durumu değerlendir, " +
    "kaynakta hesap varsa çöz. Tek kelimelik ezber sorusu ve sayma sorusu yok.\n" +
    "- expectedPoints: iyi bir cevabın içermesi gereken 2-5 kesin nokta (olgu ya da işlem sonucu); soruyu tekrar etmez; " +
    "puan etiketi ('2 puan', 'Tam') yazma.\n" +
    "- rubricCriteria: 2-4 ölçüt (ör. 'kavramı doğru tanımlar', 'iki kavramı ayıran ölçütü söyler').\n" +
    "- modelAnswer: 2-5 cümlelik örnek cevap; expectedPoints'in hepsini içerir; hesapta adımlar ve birimli sonuç.\n" +
    "- hint: kısa bir ipucu ya da boş; cevabı vermez. learningObjective: soru neyi ölçüyor.\n" +
    "- Sorunun varsaydığı ilişki kaynakta kurulmuş olmalı.\n\n" +
    "YAZMA: 'Kaynak:', sayfa numarası, 'metne göre', 'belgede'.\n\n" +
    `${CONTENT_STYLE}\n\n` +
    'Yalnızca bu şemada JSON döndür: {"questions":[{"prompt":"…","hint":"…","learningObjective":"…","rubricCriteria":["…"],"expectedPoints":["…"],"modelAnswer":"…"}]}'
  );
}

export function oralTeacherSystem(mode: TeacherLessonMode = "document"): string {
  return oralSystem(mode);
}

export function oralVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (
    "Sen titiz bir sözlü sınav denetçisisin. Soruları " +
    (mode === "topic" ? "doğruluk açısından denetliyorsun (belge yok). " : "KAYNAK ile karşılaştırıyorsun. ") +
    "Her soruyu önce kendin cevapla, sonra expectedPoints ve modelAnswer ile karşılaştır. Şunları bul:\n" +
    (mode === "topic"
      ? "A) expectedPoints ya da modelAnswer'da yanlış ya da tartışmalı bilgi.\n"
      : "A) expectedPoints ya da modelAnswer'da kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi.\n") +
    "B) Soru belirsiz ya da tek bir iyi cevabı yok; soru kaynakta kurulmamış bir ilişkiyi varsayıyor.\n" +
    "C) modelAnswer soruyu cevaplamıyor, expectedPoints'i içermiyor ya da hesabı yanlış.\n" +
    "D) expectedPoints soruyu tekrar ediyor ya da puan etiketi.\n" +
    "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
    "A-E 'high'. 'low': kolay soru.\n" +
    VERIFY_JSON
  );
}

export function parseOral(raw: unknown): OralItem[] | null {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const items = list.flatMap((entry): OralItem[] => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    const modelAnswer = typeof row.modelAnswer === "string" ? row.modelAnswer.trim() : "";
    const expectedPoints = strings(row.expectedPoints).slice(0, 6);
    if (prompt.length < 8 || !modelAnswer || !expectedPoints.length) return [];
    const hint = typeof row.hint === "string" ? row.hint.trim() : "";
    const objective = typeof row.learningObjective === "string" ? row.learningObjective.trim().slice(0, 200) : "";
    return [
      {
        prompt,
        ...(hint ? { hint } : {}),
        ...(objective ? { learningObjective: objective } : {}),
        rubricCriteria: strings(row.rubricCriteria).slice(0, 5),
        expectedPoints,
        modelAnswer,
      },
    ];
  });
  return items.length ? items : null;
}

const SCORE_LABEL = /^(tam|kısmen|kismen|yok)(\s+\d{1,2})?$|^\d{1,2}\s*puan$|^\d{1,2}\s*\/\s*\d{1,2}$/i;

/** Yapı denetimi (saf): puan etiketi, eksik ölçüt, kaynak notu. */
export function oralStructureIssues(item: OralItem): string[] {
  const issues: string[] = [];
  if (item.expectedPoints.some((point) => SCORE_LABEL.test(point))) issues.push("expectedPoints'te puan etiketi var.");
  if (!item.rubricCriteria.length) issues.push("rubricCriteria yok.");
  if (item.modelAnswer.length < 20) issues.push("modelAnswer çok kısa.");
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede/i.test(item.prompt)) {
    issues.push("Soruda kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  return issues;
}

export async function teacherOralLoop(ask: AskJson, input: PracticeSource & { count: number }, started = Date.now()) {
  const mode = input.mode ?? "document";
  return teacherItemLoop<OralItem>({
    count: input.count,
    started,
    deadlineMs: 200_000,
    maxFixRounds: 2,
    draft: async () => parseOral(await ask(oralSystem(mode), userPrompt(input, "SORU SAYISI", input.count + 1))),
    review: async (items) => {
      const structural = items.map(oralStructureIssues);
      try {
        const factual = issuesByItem(
          await ask(oralVerifySystem(mode), `${verifyHead(input)}\n\nSORULAR (JSON):\n${JSON.stringify({ questions: items })}`),
          items.length,
        );
        return items.map((_, index) => [...structural[index], ...factual[index]]);
      } catch (error) {
        const note = `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}`;
        return items.map(() => [note]);
      }
    },
    fix: async (failing: Reviewed<OralItem>[]) =>
      parseOral(
        await ask(
          "Sen aynı sözlü soruları yazan öğretmensin. Denetçinin sorun bulduğu soruları düzelt; düzeltilemiyorsa aynı " +
            "kavramı ölçen yeni soru yaz. Önerilen düzeltme ('→' sonrası) varsa uygula. Yalnız verilen soruları, aynı " +
            "sayıda ve sırayla döndür. Kurallar ve şema aynı:\n\n" +
            oralSystem(mode),
          [
            userPrompt(input, "SORU SAYISI", failing.length),
            `DÜZELTİLECEK SORULAR (JSON):\n${JSON.stringify({ questions: failing.map((row) => row.item) })}`,
            `SORUNLAR:\n${failing.map((row, index) => `Soru ${index}: ${row.problems.join(" | ")}`).join("\n")}`,
          ].join("\n\n"),
        ),
      ),
  });
}

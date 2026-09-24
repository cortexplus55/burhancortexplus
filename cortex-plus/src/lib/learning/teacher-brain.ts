/**
 * Öğretmen beyni — belge analizi, persona ve kaynağa bağlama.
 *
 * Üretim uçları bu dosyayı paylaşır. Analiz bir kez çıkarılır, saklanır
 * ve ders, sınav, podcast ve sohbete aynı özet gider. İkinci bir model
 * çağrısı yoktur: formül ve sayı denetimi metin karşılaştırır.
 */

import { z } from "zod";
import { foldTr } from "@/lib/documents/page-analysis";

export const ANALYSIS_CHUNK_CHARS = 4800;
export const MAX_ANALYSIS_CHUNKS = 3;
export const MIN_ANALYSIS_CHARS = 80;
/** Ücretsiz planda yayınlanan PDF sayfa tavanı. Tek kaynak entitlements. */
export const FREE_PDF_PAGE_CAP = 2;

export type AnalysisPage = { pageNumber: number; text: string };
export type MaterialLanguage = "tr" | "en";
export type TeachingIntent = "quiz" | "lesson" | "none";

const pageNumbers = z.array(z.number().int().positive()).max(40);

export const teacherAnalysisSchema = z.object({
  version: z.literal(1),
  language: z.enum(["tr", "en"]),
  summary: z.string().min(8).max(600),
  objectives: z
    .array(
      z.object({
        statement: z.string().min(8).max(240),
        pageNumbers,
      }),
    )
    .min(1)
    .max(12),
  examFocus: z.object({
    questionTypes: z.array(z.string().min(2).max(80)).max(8),
    keyFormulas: z
      .array(
        z.object({
          expression: z.string().min(1).max(200),
          meaning: z.string().min(2).max(220),
          pageNumbers,
        }),
      )
      .max(12),
    keyDefinitions: z
      .array(
        z.object({
          term: z.string().min(1).max(80),
          definition: z.string().min(4).max(280),
          pageNumbers,
        }),
      )
      .max(16),
  }),
  misconceptions: z
    .array(
      z.object({
        mistake: z.string().min(4).max(240),
        correction: z.string().min(4).max(280),
        pageNumbers,
      }),
    )
    .max(12),
  topics: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        emphasis: z.enum(["core", "support", "skim"]),
        prerequisites: z.array(z.string().min(2).max(120)).max(6),
        pageNumbers,
        strategy: z.object({
          examples: z.array(z.string().min(2).max(220)).max(4),
          analogies: z.array(z.string().min(2).max(220)).max(3),
          mnemonics: z.array(z.string().min(2).max(160)).max(3),
          workedExamplePlan: z.string().max(400),
          checkQuestions: z.array(z.string().min(4).max(220)).max(4),
        }),
      }),
    )
    .min(1)
    .max(16),
});

export type TeacherAnalysis = z.infer<typeof teacherAnalysisSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= 40) break;
  }
  return out;
}

function textList(value: unknown, maxItems: number, maxLen: number, minLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = clip(item, maxLen);
    if (text.length < minLen) continue;
    if (!out.some((have) => foldTr(have) === foldTr(text))) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function emphasisOf(value: unknown): "core" | "support" | "skim" {
  return value === "core" || value === "skim" || value === "support" ? value : "support";
}

function languageOf(value: unknown, fallback: MaterialLanguage): MaterialLanguage {
  return value === "en" || value === "tr" ? value : fallback;
}

/** Model çıktısını şemaya çeker. Uymayan taslak null — uydurma kayıt yok. */
export function parseTeacherAnalysis(
  raw: unknown,
  fallbackLanguage: MaterialLanguage = "tr",
): TeacherAnalysis | null {
  const row = asRecord(raw);
  if (!row) return null;
  const focus = asRecord(row.examFocus) ?? {};
  const topics = Array.isArray(row.topics) ? row.topics : [];
  const objectives = Array.isArray(row.objectives) ? row.objectives : [];

  const cleaned = {
    version: 1 as const,
    language: languageOf(row.language, fallbackLanguage),
    summary: clip(row.summary, 600),
    objectives: objectives
      .map((item) => {
        const rec = asRecord(item);
        if (!rec) return null;
        const statement = clip(rec.statement, 240);
        if (statement.length < 8) return null;
        return { statement, pageNumbers: nums(rec.pageNumbers) };
      })
      .filter((item): item is { statement: string; pageNumbers: number[] } => item !== null)
      .slice(0, 12),
    examFocus: {
      questionTypes: textList(focus.questionTypes, 8, 80, 2),
      keyFormulas: (Array.isArray(focus.keyFormulas) ? focus.keyFormulas : [])
        .map((item) => {
          const rec = asRecord(item);
          if (!rec) return null;
          const expression = clip(rec.expression, 200);
          const meaning = clip(rec.meaning, 220);
          if (expression.length < 1 || meaning.length < 2) return null;
          return { expression, meaning, pageNumbers: nums(rec.pageNumbers) };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 12),
      keyDefinitions: (Array.isArray(focus.keyDefinitions) ? focus.keyDefinitions : [])
        .map((item) => {
          const rec = asRecord(item);
          if (!rec) return null;
          const term = clip(rec.term, 80);
          const definition = clip(rec.definition, 280);
          if (term.length < 1 || definition.length < 4) return null;
          return { term, definition, pageNumbers: nums(rec.pageNumbers) };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 16),
    },
    misconceptions: (Array.isArray(row.misconceptions) ? row.misconceptions : [])
      .map((item) => {
        const rec = asRecord(item);
        if (!rec) return null;
        const mistake = clip(rec.mistake, 240);
        const correction = clip(rec.correction, 280);
        if (mistake.length < 4 || correction.length < 4) return null;
        return { mistake, correction, pageNumbers: nums(rec.pageNumbers) };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 12),
    topics: topics
      .map((item) => {
        const rec = asRecord(item);
        if (!rec) return null;
        const title = clip(rec.title, 120);
        if (title.length < 2) return null;
        const strategy = asRecord(rec.strategy) ?? {};
        return {
          title,
          emphasis: emphasisOf(rec.emphasis),
          prerequisites: textList(rec.prerequisites, 6, 120, 2),
          pageNumbers: nums(rec.pageNumbers),
          strategy: {
            examples: textList(strategy.examples, 4, 220, 2),
            analogies: textList(strategy.analogies, 3, 220, 2),
            mnemonics: textList(strategy.mnemonics, 3, 160, 2),
            workedExamplePlan: clip(strategy.workedExamplePlan, 400),
            checkQuestions: textList(strategy.checkQuestions, 4, 220, 4),
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 16),
  };

  const parsed = teacherAnalysisSchema.safeParse(cleaned);
  return parsed.success ? parsed.data : null;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = foldTr(key(item));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

const EMPHASIS_RANK = { skim: 0, support: 1, core: 2 } as const;

/** Parça analizlerini tek kayda indirir. İkinci model çağrısı yok. */
export function mergeTeacherAnalyses(parts: TeacherAnalysis[]): TeacherAnalysis | null {
  const usable = parts.filter((part) => part.topics.length && part.objectives.length);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];

  const language: MaterialLanguage =
    usable.filter((part) => part.language === "en").length > usable.length / 2 ? "en" : "tr";

  let summary = usable[0].summary;
  for (const part of usable.slice(1)) {
    if (summary.includes(part.summary)) continue;
    const next = `${summary} ${part.summary}`.trim();
    if (next.length <= 600) summary = next;
  }

  const topics = new Map<string, TeacherAnalysis["topics"][number]>();
  for (const part of usable) {
    for (const topic of part.topics) {
      const key = foldTr(topic.title);
      const have = topics.get(key);
      if (!have) {
        topics.set(key, topic);
        continue;
      }
      const emphasis =
        EMPHASIS_RANK[topic.emphasis] > EMPHASIS_RANK[have.emphasis]
          ? topic.emphasis
          : have.emphasis;
      topics.set(key, {
        ...have,
        emphasis,
        prerequisites: textList(
          [...have.prerequisites, ...topic.prerequisites],
          6,
          120,
          2,
        ),
        pageNumbers: nums([...have.pageNumbers, ...topic.pageNumbers]),
        strategy: {
          examples: textList([...have.strategy.examples, ...topic.strategy.examples], 4, 220, 2),
          analogies: textList(
            [...have.strategy.analogies, ...topic.strategy.analogies],
            3,
            220,
            2,
          ),
          mnemonics: textList(
            [...have.strategy.mnemonics, ...topic.strategy.mnemonics],
            3,
            160,
            2,
          ),
          workedExamplePlan:
            have.strategy.workedExamplePlan.length >= topic.strategy.workedExamplePlan.length
              ? have.strategy.workedExamplePlan
              : topic.strategy.workedExamplePlan,
          checkQuestions: textList(
            [...have.strategy.checkQuestions, ...topic.strategy.checkQuestions],
            4,
            220,
            4,
          ),
        },
      });
    }
  }

  return parseTeacherAnalysis(
    {
      language,
      summary,
      objectives: uniqueBy(
        usable.flatMap((part) => part.objectives),
        (item) => item.statement,
      ).slice(0, 12),
      examFocus: {
        questionTypes: textList(
          usable.flatMap((part) => part.examFocus.questionTypes),
          8,
          80,
          2,
        ),
        keyFormulas: uniqueBy(
          usable.flatMap((part) => part.examFocus.keyFormulas),
          (item) => item.expression,
        ).slice(0, 12),
        keyDefinitions: uniqueBy(
          usable.flatMap((part) => part.examFocus.keyDefinitions),
          (item) => item.term,
        ).slice(0, 16),
      },
      misconceptions: uniqueBy(
        usable.flatMap((part) => part.misconceptions),
        (item) => item.mistake,
      ).slice(0, 12),
      topics: [...topics.values()].slice(0, 16),
    },
    language,
  );
}

export function detectMaterialLanguage(text: string): MaterialLanguage {
  const sample = text.slice(0, 4000);
  const letters = sample.match(/\p{L}/gu) ?? [];
  if (letters.length < 40) return "tr";
  const trMarks = (sample.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length;
  const trWords = (foldTr(sample).match(/\b(ve|bir|bu|icin|olan|ile)\b/g) ?? []).length;
  if (trMarks >= 2 || trWords >= 4) return "tr";
  const enWords = (sample.match(/\b(the|and|of|to|with|for)\b/gi) ?? []).length;
  return enWords >= 4 ? "en" : "tr";
}

/**
 * Analize girecek sayfalar.
 *
 * Ücretsiz PDF tavanı 2 sayfadır. Word ve slayt bu tavana girmez; kota
 * onların işlemesinde yok. Tavanı bilmiyorsak depolanmış sayfalar durur.
 */
export function selectAnalysisPages(
  pages: AnalysisPage[],
  input: { mimeType?: string | null; tier?: "free" | "plus" | "sigma" | null },
): AnalysisPage[] {
  const usable = pages.filter((page) => page.text.trim().length > 0);
  const pdf = (input.mimeType ?? "").includes("pdf");
  if (pdf && input.tier === "free") return usable.slice(0, FREE_PDF_PAGE_CAP);
  return usable;
}

/** Uzun belgeyi en fazla üç parçaya böler. Her sayfa numarası bir parçada kalır. */
export function chunkPagesForAnalysis(pages: AnalysisPage[]): AnalysisPage[][] {
  const usable = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text.replace(/\s+/g, " ").trim().slice(0, 1400),
    }))
    .filter((page) => page.text.length > 0);
  if (!usable.length) return [];
  const total = usable.reduce((sum, page) => sum + page.text.length, 0);
  if (total < MIN_ANALYSIS_CHARS && usable.length === 1 && usable[0].text.length < MIN_ANALYSIS_CHARS) {
    return [];
  }

  const chunks: AnalysisPage[][] = [];
  let current: AnalysisPage[] = [];
  let chars = 0;
  for (const page of usable) {
    if (current.length && chars + page.text.length > ANALYSIS_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += page.text.length;
  }
  if (current.length) chunks.push(current);
  if (chunks.length <= MAX_ANALYSIS_CHUNKS) return chunks;

  const head = chunks.slice(0, MAX_ANALYSIS_CHUNKS - 1);
  const tail = chunks.slice(MAX_ANALYSIS_CHUNKS - 1).flat();
  const per = Math.max(180, Math.floor(ANALYSIS_CHUNK_CHARS / tail.length));
  head.push(tail.map((page) => ({ ...page, text: page.text.slice(0, per) })));
  return head;
}

/**
 * Analiz + konu haritası aynı krediden pay alır.
 * Parçalar haritayı aç bırakacaksa analiz hiç başlamaz.
 */
export function analysisCreditOk(available: number, actionCost: number, chunks: number): boolean {
  if (chunks < 1 || actionCost < 1 || !Number.isFinite(available)) return false;
  return available >= actionCost * (chunks + 1);
}

export function teacherAnalysisPrompt(input: {
  fileName: string;
  pages: AnalysisPage[];
  language: MaterialLanguage;
  part: number;
  parts: number;
}): { schemaHint: string; userPrompt: string } {
  const langLine =
    input.language === "en"
      ? "Write every student-facing string in English."
      : "Öğrenciye görünen her metin Türkçe olsun.";
  const body = input.pages
    .map((page) => `--- Sayfa ${page.pageNumber}\n${page.text}`)
    .join("\n");
  return {
    schemaHint:
      'JSON: {"language":"tr"|"en","summary":string,"objectives":[{"statement":string,"pageNumbers":number[]}],' +
      '"examFocus":{"questionTypes":string[],"keyFormulas":[{"expression":string,"meaning":string,"pageNumbers":number[]}],' +
      '"keyDefinitions":[{"term":string,"definition":string,"pageNumbers":number[]}]},' +
      '"misconceptions":[{"mistake":string,"correction":string,"pageNumbers":number[]}],' +
      '"topics":[{"title":string,"emphasis":"core"|"support"|"skim","prerequisites":string[],"pageNumbers":number[],' +
      '"strategy":{"examples":string[],"analogies":string[],"mnemonics":string[],"workedExamplePlan":string,"checkQuestions":string[]}}]}',
    userPrompt: `Belge: "${input.fileName}". Parça ${input.part}/${input.parts}.
Sen bu dersin profesörüsün. Yalnızca aşağıdaki sayfalarda yazanlara dayan.
Kaynakta olmayan formül, sayı, tanım veya alıntı yazma. Kısa belgede tek konu yeter.
emphasis: sınavda mutlaka bilinmesi gereken "core", destek "support", üstünden geçilecek "skim".
Benzetme ve ezber cümlesi ancak gerçek açıklamayı destekliyorsa. Kutu, formül kartı ve örnek adımı ayrı konu değildir.
${langLine}

${body}`,
  };
}

function sourceHasNumber(source: string, raw: string): boolean {
  const normalized = source.replace(/,/g, ".");
  const digits = raw.replace("%", "").replace(/\s/g, "").replace(",", ".");
  return normalized.includes(digits) || source.includes(raw.replace(/\s/g, ""));
}

/** Kaynakta geçmeyen yüzde ve denklem katsayısı. Küçük sıra sayıları sayılmaz. */
export function unsupportedQuantities(generated: string, source: string): string[] {
  if (!source.trim() || !generated.trim()) return [];
  const issues: string[] = [];
  for (const match of generated.match(/%\s*\d+(?:[.,]\d+)?/g) ?? []) {
    if (!sourceHasNumber(source, match)) issues.push(match.replace(/\s/g, ""));
  }
  for (const sentence of generated.split(/[\n.]+/)) {
    if (!/=/.test(sentence)) continue;
    for (const num of sentence.match(/\d+/g) ?? []) {
      if (Number(num) < 3) continue;
      if (!sourceHasNumber(source, num)) issues.push(num);
    }
  }
  return [...new Set(issues)].slice(0, 6);
}

/**
 * Analizde duran formülü kaynakta yoksa at.
 * Katsayısı 3 ve üstü olan ifade, o sayı belgede yoksa kalmaz.
 */
export function sanitizeAnalysisAgainstSource(
  analysis: TeacherAnalysis,
  source: string,
): { analysis: TeacherAnalysis; droppedFormulas: string[] } {
  if (!source.trim()) return { analysis, droppedFormulas: [] };
  const droppedFormulas: string[] = [];
  const keyFormulas = analysis.examFocus.keyFormulas.filter((formula) => {
    const gaps = unsupportedQuantities(formula.expression, source);
    if (!gaps.length) return true;
    droppedFormulas.push(formula.expression);
    return false;
  });
  const keyDefinitions = analysis.examFocus.keyDefinitions.filter((item) => {
    if (item.term.length < 3) return true;
    return foldTr(source).includes(foldTr(item.term));
  });
  const next = parseTeacherAnalysis(
    {
      ...analysis,
      examFocus: { ...analysis.examFocus, keyFormulas, keyDefinitions },
    },
    analysis.language,
  );
  return { analysis: next ?? analysis, droppedFormulas };
}

function matchTopic(
  analysis: TeacherAnalysis,
  topicTitle: string,
): TeacherAnalysis["topics"][number] | null {
  const want = foldTr(topicTitle);
  if (!want) return null;
  for (const topic of analysis.topics) {
    const have = foldTr(topic.title);
    if (want.includes(have) || have.includes(want)) return topic;
  }
  let best: TeacherAnalysis["topics"][number] | null = null;
  let bestScore = 0;
  const words = want.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  for (const topic of analysis.topics) {
    const have = foldTr(topic.title);
    const score = words.filter((word) => have.includes(word.slice(0, 5))).length;
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}

function clipBlock(text: string, max = 1500): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Konu haritasına giden kısa not. Başlık listesinin yerine geçmez. */
export function teacherBriefForTopicMap(analysis: TeacherAnalysis): string {
  const lines = analysis.topics.map((topic) => {
    const prereq = topic.prerequisites.length
      ? ` önce: ${topic.prerequisites.join(", ")}`
      : "";
    return `- ${topic.title} (${topic.emphasis}${prereq}) s.${topic.pageNumbers.join(",") || "?"}`;
  });
  const skim = analysis.topics.filter((topic) => topic.emphasis === "skim").map((topic) => topic.title);
  if (skim.length) lines.push(`Üstünden geç: ${skim.join(", ")}. Ayrı konu açma.`);
  return clipBlock(lines.join("\n"), 1200);
}

/** Ders, quiz, podcast ve sohbet için konu notu. */
export function teacherBriefForTopic(analysis: TeacherAnalysis, topicTitle: string): string {
  const topic = matchTopic(analysis, topicTitle);
  const lines: string[] = ["Öğretmen notu (yalnızca bu belgeden; kaynakta yoksa yazma):"];
  if (topic) {
    lines.push(`Konu: ${topic.title}. Vurgu: ${topic.emphasis}.`);
    if (topic.prerequisites.length) lines.push(`Önkoşul: ${topic.prerequisites.join(", ")}.`);
    if (topic.strategy.workedExamplePlan) lines.push(`Örnek planı: ${topic.strategy.workedExamplePlan}`);
    if (topic.strategy.examples.length) lines.push(`Örnekler: ${topic.strategy.examples.join(" | ")}`);
    if (topic.strategy.analogies.length) {
      lines.push(`Benzetme yalnızca destek: ${topic.strategy.analogies.join(" | ")}`);
    }
    if (topic.strategy.mnemonics.length) lines.push(`Ezber: ${topic.strategy.mnemonics.join(" | ")}`);
    if (topic.strategy.checkQuestions.length) {
      lines.push(`Kontrol soruları: ${topic.strategy.checkQuestions.join(" | ")}`);
    }
  }
  const pages = new Set(topic?.pageNumbers ?? []);
  const formulas = analysis.examFocus.keyFormulas.filter(
    (formula) => !pages.size || formula.pageNumbers.some((page) => pages.has(page)) || !formula.pageNumbers.length,
  );
  if (formulas.length) {
    lines.push(
      `Formüller: ${formulas
        .slice(0, 4)
        .map((formula) => `${formula.expression} (${formula.meaning})`)
        .join(" | ")}`,
    );
  }
  const mistakes = analysis.misconceptions.slice(0, 4);
  if (mistakes.length) {
    lines.push(
      `Sık hata: ${mistakes.map((item) => `${item.mistake} → ${item.correction}`).join(" | ")}`,
    );
  }
  const core = analysis.objectives.slice(0, 3).map((item) => item.statement);
  if (core.length) lines.push(`Hedef: ${core.join(" ")}`);
  return clipBlock(lines.join("\n"));
}

export function topicMapTeacherNote(brief: string | null | undefined): string {
  const text = brief?.trim();
  if (!text) return "";
  return (
    "\n\nÖğretmen notu yalnızca vurgu ve sıradır. Konu sayısını ve başlıkları belgenin bölümleri belirler. " +
    "Uyarı kutusu, formül kartı, kendini test ve çözümlü örnek adımı ayrı konu olmaz.\n" +
    text
  );
}

export function teacherPersona(language: MaterialLanguage = "tr"): string {
  if (language === "en") {
    return (
      "You are this course's professor, not a generic chatbot. " +
      "Diagnose what the student already understands, explain one step, then ask a short check question. " +
      "When they answer, judge it against the uploaded material: what is right, what is missing or wrong, and why. Then continue. " +
      "Guide. Write the full solution only if they explicitly ask. " +
      "Tie the point to how it appears on the exam. No filler and no applause."
    );
  }
  return (
    "Sen bu dersin profesörüsün; genel bir sohbet botu değilsin. " +
    "Önce öğrencinin seviyesini yokla, tek adım anlat, ardından kısa bir kontrol sorusu sor. " +
    "Öğrenci cevap verince yanıtı belgeye göre değerlendir: ne doğru, ne eksik ya da yanlış, neden. Sonra devam et. " +
    "Yönlendir. Tam çözümü ancak öğrenci açıkça isterse yaz. " +
    "Anlattığın noktayı sınavda nasıl çıktığına bağla. Dolgu, alkış ve motivasyon cümlesi yok."
  );
}

export function groundingRules(language: MaterialLanguage = "tr"): string {
  if (language === "en") {
    return (
      'Stay inside the uploaded material. If a formula, number, or claim is not in the document, say so in one sentence. ' +
      'Add general knowledge only in a sentence that starts with "Outside the material:". Never invent formulas, numbers, or citations.'
    );
  }
  return (
    'Yalnızca yüklenen materyale dayan. Formül, sayı veya iddia belgede yoksa bunu tek cümlede söyle. ' +
    'Genel bilgi vereceksen cümleye "Materyal dışı:" diye başla. Formül, sayı veya kaynak uydurma.'
  );
}

export function studentLanguageLine(language: MaterialLanguage): string {
  return language === "en"
    ? "Student-facing text is English."
    : "Öğrenciye görünen metin Türkçe.";
}

export function prepLanguage(raw: unknown): MaterialLanguage {
  if (!raw || typeof raw !== "object") return "tr";
  return (raw as { language?: unknown }).language === "en" ? "en" : "tr";
}

export function teachingIntent(message: string): TeachingIntent {
  const folded = foldTr(message);
  if (/(beni test et|test et|ne kadar iyi anlad|quiz me|test me)/.test(folded)) return "quiz";
  if (/(ozel ders|bana ders|beni egit|teach me|private lesson)/.test(folded)) return "lesson";
  return "none";
}

function intentLine(intent: TeachingIntent, language: MaterialLanguage): string {
  if (intent === "quiz") {
    return language === "en"
      ? "The student asked to be tested. Ask one exam-style question from the material and wait. Do not reveal the answer in this turn."
      : "Öğrenci test istedi. Materyalden tek bir sınav sorusu sor ve bekle. Bu turda cevabı verme.";
  }
  if (intent === "lesson") {
    return language === "en"
      ? "The student asked to be taught. Teach one concept from the material, step by step, and end with a check question. Do not dump the whole topic."
      : "Öğrenci eğitilmek istedi. Materyalden tek kavramı adım adım anlat ve kontrol sorusuyla bitir. Konunun tamamını dökme.";
  }
  return "";
}

export function teacherTurnGuidance(input: {
  message: string;
  lastAssistant?: string;
  language?: MaterialLanguage;
}): string {
  const language = input.language ?? "tr";
  const parts = [teacherPersona(language), groundingRules(language)];
  const intent = intentLine(teachingIntent(input.message), language);
  if (intent) parts.push(intent);
  const last = input.lastAssistant ?? "";
  if (last.includes("?") && teachingIntent(input.message) === "none") {
    parts.push(
      language === "en"
        ? "If this message answers your check question, say what matches the document, what is missing or wrong, and why. If it is a new question, teach that instead."
        : "Bu mesaj kontrol sorusunun cevabıysa belgede neyin tuttuğunu, neyin eksik ya da yanlış olduğunu ve nedenini söyle. Yeni bir soruysa onu öğret.",
    );
  }
  return parts.join("\n");
}

export const SINGLE_NARRATOR_SCHEMA =
  'Her satırın speaker alanı "ada". Tek öğretmen anlatır; ikinci kişi, diyalog ve Kerem yok. Her text TEK cümle ve 25 kelimeyi geçmez.';

export function podcastNarrationBrief(language: MaterialLanguage = "tr"): string {
  if (language === "en") {
    return (
      "One expert teacher narrates a memorable lesson. " +
      "Each section: what it is, why it matters, one concrete example from the source, the mistake students actually make, then a one-sentence recap. " +
      "Analogies only support the real explanation. Emphasize exam-critical points. Do not invent numbers or formulas."
    );
  }
  return (
    "Tek öğretmen akılda kalan bir ders anlatır. İki kişi konuşmaz. " +
    "Her bölüm: ne olduğu, neden önemli olduğu, kaynaktaki somut örnek, öğrencinin gerçekten yaptığı hata, tek cümlelik tekrar. " +
    "Benzetme açıklamanın yerine geçmez. Sınavda çıkan noktayı vurgula. Kaynakta olmayan sayı veya formül yok."
  );
}

export function podcastDialogueIssues(
  chapters: { lines?: { speaker?: string; text?: string }[] }[],
): string[] {
  const issues: string[] = [];
  let foreign = false;
  let named = false;
  for (const chapter of chapters) {
    for (const line of chapter.lines ?? []) {
      const speaker = (line.speaker ?? "").trim().toLowerCase();
      if (speaker && speaker !== "ada") foreign = true;
      if (/\bkerem\b/i.test(line.text ?? "")) named = true;
    }
  }
  if (foreign) issues.push("Podcast tek öğretmen anlatır; ikinci konuşmacı yok.");
  if (named) issues.push("Kerem diye bir sunucu yok.");
  return issues;
}

export type ReviewCheck = {
  type: "mcq" | "trueFalse";
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

function stableShift(prompt: string, optionCount: number): number {
  if (optionCount < 2) return 0;
  let hash = 0;
  for (const char of prompt) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return (hash % (optionCount - 1)) + 1;
}

/** Ders sonu tekrarı aynı cümleyi ve aynı şık yerini geri getirmez. */
export function rephraseReviewPrompt(prompt: string, language: MaterialLanguage = "tr"): string {
  const trimmed = prompt.trim();
  if (language === "en") {
    const lower = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    const next = `On the exam, ${lower}`;
    return next === trimmed ? `Restated: ${trimmed}` : next.slice(0, 300);
  }
  let next = trimmed;
  if (/^aşağıdakilerden hangisi/i.test(trimmed)) {
    next = trimmed.replace(/^Aşağıdakilerden hangisi/i, "Sınavda hangisi");
  } else if (trimmed.endsWith("?")) {
    next = `Aynı noktayı başka sözcüklerle: ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  } else {
    next = `Bunu sınav diliyle yeniden düşün: ${trimmed}`;
  }
  if (next.trim() === trimmed) next = `Tekrar, yeni cümleyle: ${trimmed}`;
  return next.slice(0, 300);
}

export function rephraseSectionCheck<T extends ReviewCheck>(
  check: T,
  language: MaterialLanguage = "tr",
): T {
  const count = check.options.length;
  const shift = stableShift(check.prompt, count);
  const options =
    shift === 0
      ? check.options
      : check.options.map((_, index) => check.options[(index + shift) % count]);
  const answerIndex = shift === 0 ? check.answerIndex : (check.answerIndex - shift + count) % count;
  return {
    ...check,
    prompt: rephraseReviewPrompt(check.prompt, language),
    options,
    answerIndex,
  };
}

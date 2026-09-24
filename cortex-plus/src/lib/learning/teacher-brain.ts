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
emphasis önceliktir, eleme değildir. "core" önemli (önce ve derin), "support" orta, "skim" daha az önemli (sonra ve kısa). "skim" konuyu listeden çıkarma.
Sınavda çıkabilecek her kavram, formül, tuzak ve örnek tipi bir konuda kalsın. Kenar notu, uyarı kutusu ve örnek adımı ayrı konu olmasın; en yakın konunun örneği ya da tuzağı olarak yaz.
Benzetme ve ezber cümlesi ancak gerçek açıklamayı destekliyorsa.
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
function keepSourceBacked(text: string, source: string): string {
  return unsupportedQuantities(text, source).length ? "" : text;
}

function keepSourceBackedList(items: string[], source: string): string[] {
  return items.filter((item) => !unsupportedQuantities(item, source).length);
}

export function sanitizeAnalysisAgainstSource(
  analysis: TeacherAnalysis,
  source: string,
): { analysis: TeacherAnalysis; droppedFormulas: string[] } {
  if (!source.trim()) return { analysis, droppedFormulas: [] };
  const droppedFormulas: string[] = [];
  const keyFormulas = analysis.examFocus.keyFormulas.filter((formula) => {
    const gaps = unsupportedQuantities(
      `${formula.expression} ${formula.meaning}`,
      source,
    );
    if (!gaps.length) return true;
    droppedFormulas.push(formula.expression);
    return false;
  });
  const keyDefinitions = analysis.examFocus.keyDefinitions.filter((item) => {
    if (item.term.length < 3) return true;
    if (!foldTr(source).includes(foldTr(item.term))) return false;
    return !unsupportedQuantities(item.definition, source).length;
  });
  const topics = analysis.topics.map((topic) => ({
    ...topic,
    strategy: {
      examples: keepSourceBackedList(topic.strategy.examples, source),
      analogies: keepSourceBackedList(topic.strategy.analogies, source),
      mnemonics: keepSourceBackedList(topic.strategy.mnemonics, source),
      workedExamplePlan: keepSourceBacked(topic.strategy.workedExamplePlan, source),
      checkQuestions: keepSourceBackedList(topic.strategy.checkQuestions, source),
    },
  }));
  const misconceptions = analysis.misconceptions.filter(
    (item) => !unsupportedQuantities(`${item.mistake} ${item.correction}`, source).length,
  );
  const objectives = analysis.objectives.filter(
    (item) => !unsupportedQuantities(item.statement, source).length,
  );
  const next = parseTeacherAnalysis(
    {
      ...analysis,
      summary: keepSourceBacked(analysis.summary, source) || analysis.summary,
      objectives: objectives.length ? objectives : analysis.objectives,
      examFocus: { ...analysis.examFocus, keyFormulas, keyDefinitions },
      misconceptions,
      topics,
    },
    analysis.language,
  );
  return { analysis: next ?? analysis, droppedFormulas };
}

/** Kısa başlık ("Su") daha uzun başlığın ("Su Akışı") içine sızmasın. */
const MIN_TOPIC_MATCH = 4;

function matchTopic(
  analysis: TeacherAnalysis,
  topicTitle: string,
): TeacherAnalysis["topics"][number] | null {
  const want = foldTr(topicTitle);
  if (want.length < MIN_TOPIC_MATCH) return null;

  let best: TeacherAnalysis["topics"][number] | null = null;
  let bestOverlap = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const topic of analysis.topics) {
    const have = foldTr(topic.title);
    if (have.length < MIN_TOPIC_MATCH) continue;
    if (!want.includes(have) && !have.includes(want)) continue;
    const overlap = Math.min(have.length, want.length);
    const gap = Math.abs(have.length - want.length);
    if (overlap > bestOverlap || (overlap === bestOverlap && gap < bestGap)) {
      best = topic;
      bestOverlap = overlap;
      bestGap = gap;
    }
  }
  if (best) return best;

  let wordBest: TeacherAnalysis["topics"][number] | null = null;
  let wordScore = 0;
  let wordLen = 0;
  const words = want.split(/[^a-z0-9]+/).filter((word) => word.length >= MIN_TOPIC_MATCH);
  for (const topic of analysis.topics) {
    const have = foldTr(topic.title);
    if (have.length < MIN_TOPIC_MATCH) continue;
    const score = words.filter((word) => have.includes(word)).length;
    if (score > wordScore || (score === wordScore && score > 0 && have.length > wordLen)) {
      wordBest = topic;
      wordScore = score;
      wordLen = have.length;
    }
  }
  return wordScore > 0 ? wordBest : null;
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
  const less = analysis.topics.filter((topic) => topic.emphasis === "skim").map((topic) => topic.title);
  if (less.length) {
    lines.push(
      `Daha az önemli (sonra, kısa ders): ${less.join(", ")}. Plandan çıkarma.`,
    );
  }
  return clipBlock(lines.join("\n"), 1200);
}

export type TeachingPriority = "important" | "medium" | "less";
export type CoverageKind = "concept" | "formula" | "trap" | "example";

export type CoverageItem = {
  id: string;
  kind: CoverageKind;
  label: string;
  topicTitle: string;
  priority: TeachingPriority;
  documentId: string | null;
};

export function priorityFromEmphasis(
  emphasis: "core" | "support" | "skim",
): TeachingPriority {
  if (emphasis === "core") return "important";
  if (emphasis === "skim") return "less";
  return "medium";
}

export function schedulePriorityRank(priority: TeachingPriority): number {
  if (priority === "important") return 1;
  if (priority === "less") return 5;
  return 3;
}

export function findAnalysisTopic(
  analysis: TeacherAnalysis,
  topicTitle: string,
): TeacherAnalysis["topics"][number] | null {
  return matchTopic(analysis, topicTitle);
}

function topicByPages(
  analysis: TeacherAnalysis,
  pages: number[],
): TeacherAnalysis["topics"][number] | null {
  if (!pages.length) return null;
  let best: TeacherAnalysis["topics"][number] | null = null;
  let score = 0;
  for (const topic of analysis.topics) {
    const overlap = topic.pageNumbers.filter((page) => pages.includes(page)).length;
    if (overlap > score) {
      best = topic;
      score = overlap;
    }
  }
  return best;
}

function coverageId(kind: CoverageKind, label: string): string {
  return `${kind}:${foldTr(label).slice(0, 80)}`;
}

/**
 * Sınav kapsamı. Eski hazır kayıtlarda ayrı liste yoktur; kavram, formül,
 * tuzak ve örnek tipinden türetilir. Yeni model çağrısı gerekmez.
 * Daha az önemli madde de listede kalır.
 */
export function coverageChecklist(
  analysis: TeacherAnalysis,
  documentId: string | null = null,
): CoverageItem[] {
  const items: CoverageItem[] = [];
  const seen = new Set<string>();
  const add = (
    kind: CoverageKind,
    label: string,
    topic: TeacherAnalysis["topics"][number],
  ) => {
    const text = label.replace(/\s+/g, " ").trim();
    if (text.length < 2) return;
    const id = coverageId(kind, text);
    const key = `${id}|${foldTr(topic.title)}|${documentId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      id,
      kind,
      label: text.slice(0, 220),
      topicTitle: topic.title,
      priority: priorityFromEmphasis(topic.emphasis),
      documentId,
    });
  };

  for (const topic of analysis.topics) {
    add("concept", topic.title, topic);
    for (const example of topic.strategy.examples) add("example", example, topic);
    if (topic.strategy.workedExamplePlan) add("example", topic.strategy.workedExamplePlan, topic);
    for (const question of topic.strategy.checkQuestions) add("trap", question, topic);
  }
  for (const formula of analysis.examFocus.keyFormulas) {
    const topic = topicByPages(analysis, formula.pageNumbers);
    if (!topic) continue;
    add("formula", `${formula.expression} (${formula.meaning})`, topic);
  }
  for (const definition of analysis.examFocus.keyDefinitions) {
    const topic = topicByPages(analysis, definition.pageNumbers);
    if (!topic) continue;
    add("concept", `${definition.term}: ${definition.definition}`, topic);
  }
  for (const trap of analysis.misconceptions) {
    const topic = topicByPages(analysis, trap.pageNumbers);
    if (!topic) continue;
    add("trap", `${trap.mistake} → ${trap.correction}`, topic);
  }
  return items;
}

export function lessonDepth(priority: TeachingPriority | null): {
  difficulty: "easy" | "medium" | "hard";
  maxDraftAttempts: 1 | 2;
  quizItems: number;
  line: string;
} {
  if (priority === "less") {
    return {
      difficulty: "easy",
      maxDraftAttempts: 1,
      quizItems: 2,
      line: "Öncelik: daha az önemli. Konuyu yine öğret ama kısa tut: tek tanım, bir tuzak, kısa bir örnek.",
    };
  }
  if (priority === "medium") {
    return {
      difficulty: "medium",
      maxDraftAttempts: 1,
      quizItems: 3,
      line: "Öncelik: orta. Tanım, formül ve bir çözümlü örnek yeter.",
    };
  }
  return {
    difficulty: "hard",
    maxDraftAttempts: 2,
    quizItems: 5,
    line: "Öncelik: önemli. Derin anlat: tanım, formül, tuzak ve çözümlü örnek tipi.",
  };
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
  // Sayfası boş formül her konuya, eşleşmeyen başlık da bütün formüllere
  // yazılmasın. Ders kapısı o sayıyı kaynakta bulamayınca taslağı düşürür.
  const pages = new Set(topic?.pageNumbers ?? []);
  const formulas = topic
    ? analysis.examFocus.keyFormulas.filter((formula) =>
        formula.pageNumbers.some((page) => pages.has(page)),
      )
    : [];
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
  if (topic) {
    const depth = lessonDepth(priorityFromEmphasis(topic.emphasis));
    const mine = coverageChecklist(analysis).filter(
      (item) => foldTr(item.topicTitle) === foldTr(topic.title),
    );
    lines.push(depth.line);
    if (mine.length) {
      lines.push("Kapsam listesi — bu derste hepsi geçecek, atlama:");
      for (const item of mine.slice(0, 12)) {
        lines.push(`- (${item.priority}) ${item.kind}: ${item.label}`);
      }
    }
  }
  return clipBlock(lines.join("\n"), 2200);
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
      "When they answer, say what is right, what is missing or wrong, and why. Then continue. " +
      "Guide. Write the full solution only if they explicitly ask. " +
      "Tie the point to how it appears on the exam. No filler and no applause."
    );
  }
  return (
    "Sen bu dersin profesörüsün; genel bir sohbet botu değilsin. " +
    "Önce öğrencinin seviyesini yokla, tek adım anlat, ardından kısa bir kontrol sorusu sor. " +
    "Öğrenci cevap verince neyin doğru, neyin eksik ya da yanlış olduğunu ve nedenini söyle. Sonra devam et. " +
    "Yönlendir. Tam çözümü ancak öğrenci açıkça isterse yaz. " +
    "Anlattığın noktayı sınavda nasıl çıktığına bağla. Dolgu, alkış ve motivasyon cümlesi yok."
  );
}

export function groundingRules(language: MaterialLanguage = "tr"): string {
  if (language === "en") {
    return (
      'Stay inside the uploaded material. If the question is not covered, say that in one sentence, then write general knowledge in a section that starts exactly with "Outside the material:". ' +
      "Do not skip that label. Never invent a formula, number, or citation and present it as part of the document."
    );
  }
  return (
    'Yalnızca yüklenen materyale dayan. Soru belgede yoksa bunu tek cümlede söyle, sonra genel bilgiyi ayrı bir bölümde yaz ve o bölüme tam olarak "Materyal dışı:" diye başla. ' +
    "Bu etiketi atlama. Belgede olmayan formülü, sayıyı veya alıntıyı belgede yazıyormuş gibi sunma."
  );
}

function inDocumentOnlyRules(language: MaterialLanguage): string {
  if (language === "en") {
    return (
      "Answer only from the loaded material. If it is not there, say so and do not fill the gap with general knowledge. Never invent a formula, number, or citation."
    );
  }
  return (
    "Yalnızca yüklenen materyalden cevap ver. Belgede yoksa bunu söyle ve boşluğu genel bilgiyle doldurma. Formül, sayı veya alıntı uydurma."
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
  /** Belge metni, ders veya öğretmen notu gerçekten yüklendiyse. */
  hasSource?: boolean;
  /**
   * Katı "yalnızca belgem" kipinde genel bilgi istenmez. Etiket o kipte
   * yazılırsa denetçi belge iddiası sanıp doğru cevabı da düşürür.
   */
  allowOutsideMaterial?: boolean;
}): string {
  const language = input.language ?? "tr";
  const parts = [teacherPersona(language)];
  if (input.hasSource) {
    parts.push(input.allowOutsideMaterial === false ? inDocumentOnlyRules(language) : groundingRules(language));
  }
  const intent = intentLine(teachingIntent(input.message), language);
  if (intent) parts.push(intent);
  const last = input.lastAssistant ?? "";
  if (last.includes("?") && teachingIntent(input.message) === "none") {
    parts.push(
      input.hasSource
        ? language === "en"
          ? "If this message answers your check question, say what matches the document, what is missing or wrong, and why. If it is a new question, teach that instead."
          : "Bu mesaj kontrol sorusunun cevabıysa belgede neyin tuttuğunu, neyin eksik ya da yanlış olduğunu ve nedenini söyle. Yeni bir soruysa onu öğret."
        : language === "en"
          ? "If this message answers your check question, say what is right, what is missing or wrong, and why. If it is a new question, teach that instead."
          : "Bu mesaj kontrol sorusunun cevabıysa neyin doğru, neyin eksik ya da yanlış olduğunu ve nedenini söyle. Yeni bir soruysa onu öğret.",
    );
  }
  return parts.join("\n");
}

export function voiceReplySchemaHint(language: MaterialLanguage): string {
  if (language === "en") {
    return 'JSON: {"reply":string,"done":boolean}. reply is spoken aloud and is short English. done is true only when the session has naturally ended.';
  }
  return 'JSON: {"reply":string,"done":boolean}. reply sesli okunacak, kısa Türkçe. done true yalnızca oturum doğal bittiyse.';
}

/**
 * Nicelik kapısı nottaki sayı yüzünden düşerse ders notsuz bir kez daha
 * üretilir. İkinci tur da düşerse üretim biter; döngü yok.
 */
export function shouldRetryLessonWithoutBrief(input: {
  brief: string | null | undefined;
  rejectedForQuantity: boolean;
  retried: boolean;
}): boolean {
  return !input.retried && Boolean(input.brief?.trim()) && input.rejectedForQuantity;
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

function foldPrompt(text: string): string {
  return text.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
}

function sameOptionOrder(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((option, index) => option.trim() === right[index]?.trim())
  );
}

function sameOptionSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = left.map((option) => option.trim()).sort();
  const b = right.map((option) => option.trim()).sort();
  return a.every((option, index) => option === b[index]);
}

/** 3 ve üstü bir sayı kaynakta yoksa varyant yeni bir olgu taşıyor demektir. */
function hasNovelQuantity(text: string, source: string): boolean {
  const nums = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const raw of nums) {
    const normalized = raw.replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 3) continue;
    const comma = normalized.replace(".", ",");
    if (!source.includes(raw) && !source.includes(normalized) && !source.includes(comma)) {
      return true;
    }
  }
  return false;
}

function shiftOptions<T extends ReviewCheck>(check: T): T {
  const count = check.options.length;
  const shift = stableShift(check.prompt, count);
  if (shift === 0) return check;
  return {
    ...check,
    options: check.options.map((_, index) => check.options[(index + shift) % count]),
    answerIndex: (check.answerIndex - shift + count) % count,
  };
}

export type StoredReview = {
  prompt: string;
  /** Eski taslaklar şık da yazdı. Yeni üretim yalnızca kök cümle ister. */
  options?: string[];
  answerIndex?: number;
};

/**
 * Ders üretilirken aynı çağrıda yazılan tekrar.
 * Şık metinleri orijinalin aynısı olmalı; yeni sayı veya orijinal cümle yok.
 * Tutmazsa null — ekran önekli yedeğe düşer, olgu uydurmaz.
 */
function storedReview(value: unknown): StoredReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { prompt?: unknown; options?: unknown; answerIndex?: unknown };
  if (typeof row.prompt !== "string") return null;
  const prompt = row.prompt.trim().slice(0, 180);
  if (prompt.length < 8) return null;
  const options = Array.isArray(row.options)
    ? row.options.filter((option): option is string => typeof option === "string").map((option) => option.trim())
    : undefined;
  const answerIndex =
    typeof row.answerIndex === "number" && Number.isInteger(row.answerIndex)
      ? row.answerIndex
      : undefined;
  return { prompt, options, answerIndex };
}

export function acceptReviewVariant(
  check: ReviewCheck & { review?: StoredReview | null },
): ReviewCheck | null {
  const review = storedReview(check.review);
  if (!review) return null;
  const original = foldPrompt(check.prompt);
  const next = foldPrompt(review.prompt);
  if (next.length < 8 || next === original || next.includes(original)) return null;
  const source = [check.prompt, check.explanation, ...check.options].join("\n");
  if (hasNovelQuantity(review.prompt, source)) return null;
  const copied =
    review.options &&
    review.options.length >= 2 &&
    typeof review.answerIndex === "number" &&
    sameOptionSet(check.options, review.options);
  if (review.options && review.options.length >= 2 && !copied) return null;
  const accepted: ReviewCheck = copied
    ? {
        type: check.type,
        prompt: review.prompt,
        options: review.options!.map((option) => option.trim()),
        answerIndex: review.answerIndex!,
        explanation: check.explanation,
      }
    : {
        type: check.type,
        prompt: review.prompt,
        options: check.options,
        answerIndex: check.answerIndex,
        explanation: check.explanation,
      };
  const correct = check.options[check.answerIndex]?.trim();
  const picked = accepted.options[accepted.answerIndex]?.trim();
  if (!correct || picked !== correct) return null;
  return sameOptionOrder(check.options, accepted.options) ? shiftOptions(accepted) : accepted;
}

/**
 * Kısa tekrar kapısının sorusu.
 * Saklı varyant geçerliyse o gelir; değilse şıklar kayar ve köke önek eklenir.
 * Orijinal cümle olduğu gibi geri dönmez.
 */
export function reviewQuestionFor<T extends ReviewCheck & { review?: StoredReview | null }>(
  check: T,
  language: MaterialLanguage = "tr",
): T {
  const accepted = acceptReviewVariant(check);
  const next = accepted ?? rephraseSectionCheck(check, language);
  if (foldPrompt(next.prompt) === foldPrompt(check.prompt)) {
    const fallback = rephraseSectionCheck(check, language);
    return {
      ...check,
      prompt: fallback.prompt,
      options: fallback.options,
      answerIndex: fallback.answerIndex,
    };
  }
  return {
    ...check,
    prompt: next.prompt,
    options: next.options,
    answerIndex: next.answerIndex,
  };
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

/**
 * Kazanım dersi (Paket 3b, 3 Kasım 2026): tek bir resmî kazanıma (outcome_id) 6–8 bölümlük, sınava özel ders.
 *
 * Read-through: havuzda (topic_content, kind='outcome_lesson') doğrulanmış ders varsa model çağrısı yok, 0 kredi.
 * Yoksa iki çağrıda stream-first üretilir: (1) plan + ilk bölüm (ilk ekran), (2) kalan bölümler, özet, kartlar.
 * Birleşen ders GATE v14 kod katmanları + rubrik + sınav iskeleti (blueprint) + 6–8 bölüm kuralından ve iskelet
 * sorularının kör çözümünden geçerse kalıcı olarak havuza yazılır; geçmezse öğrenci dersi okur ama havuza girmez.
 * Genel lise şablonu yok: iskeleti olmayan programlar (YKS/LGS/okul) "sinav" iskeletini kullanır.
 */
import { BLUEPRINT_VERSION, blueprintChecks, blueprintIssues, blueprintKind, blueprintPrompt, type BlueprintKind } from "@/lib/content-pool/blueprint";
import { lessonGateIssues, officialBlock, ORIGINALITY, parseCompactReview, verifyPrompt, type LlmCall, type UsageEntry } from "@/lib/content-pool/generate";
import { choiceCount, type PoolUnit } from "@/lib/content-pool/keys";
import { RUBRIC_JSON_FIELDS, RUBRIC_PROMPT, RUBRIC_VERSION } from "@/lib/content-pool/rubric";
import { applyReview, lessonSchema, type LessonBody } from "@/lib/content-pool/schema";
import { parseModelOutput } from "@/lib/ai/json-repair";
import { z } from "zod";

export const OUTCOME_LESSON_KIND = "outcome_lesson";
export const OUTCOME_LESSON_VERSION = 1;
export const OUTCOME_SECTIONS_MIN = 6;
export const OUTCOME_SECTIONS_MAX = 8;
/** Bir kazanım dersinin (2 yazar + 1 kör çözücü çağrısı) üst maliyet tahmini; ortak havuz tavanı denetimi için. */
export const OUTCOME_LESSON_ESTIMATE_USD = 0.06;

/** Kazanım dersinin iskeleti: programın kendi iskeleti, yoksa merkezi sınav iskeleti (genel lise şablonu yok). */
export function outcomeBlueprintKind(programKind: string): BlueprintKind {
  return blueprintKind(programKind) ?? "sinav";
}

function examName(unit: PoolUnit): string {
  return unit.program.kind ? unit.program.kind.toLocaleUpperCase("tr") : unit.program.label;
}

function outcomeUnit(unit: PoolUnit, code: string): PoolUnit {
  return { ...unit, outcomes: unit.outcomes.filter((o) => o.code === code) };
}

const sectionShape = (bp: BlueprintKind) =>
  `{"outcome_code": "<kod>", "heading": string, "explanation": string (en az 2 paragraf), "key_points": string[], ` +
  `"steps": string[], "worked_example": string, "common_mistakes": string[], "ladder": {"temel": string, "orta": string, "ileri": string}, ` +
  `"blueprint": object (BU bölümün içinde; aşağıdaki ${bp} iskeleti)}`;

function system(unit: PoolUnit): string {
  return `Sen Türkiye'deki ${examName(unit)} sınavına hazırlayan uzman bir eğitmensin; anlatımın sınavın soru biçimine göre kurulur. ${ORIGINALITY} Yalnız JSON döndür.`;
}

/** Çağrı 1 (ilk ekran): 6–8 bölümlük plan + yalnız ilk bölüm, tam iskeletiyle. Kısa tutulur ki ilk ekran hızlı gelsin. */
export function outcomeFirstPrompt(unit: PoolUnit, code: string) {
  const bp = outcomeBlueprintKind(unit.program.kind);
  return {
    system: system(unit),
    user:
      `${officialBlock(outcomeUnit(unit, code))}\n\nYalnız ${code} kazanımı için ${OUTCOME_SECTIONS_MIN}-${OUTCOME_SECTIONS_MAX} bölümlük, kolaydan sınav düzeyine ilerleyen bir ders planla. ` +
      `Şimdi planın tamamını ve YALNIZ 1. bölümü yaz. JSON şeması:\n` +
      `{"title": string, "overview": string, "plan": string[] (${OUTCOME_SECTIONS_MIN}-${OUTCOME_SECTIONS_MAX} bölüm başlığı, ilki 1. bölümün başlığı), ` +
      `"key_terms": [{"term": string, "definition": string}] (en az 3), "sections": [${sectionShape(bp)}] (tam 1 bölüm; outcome_code "${code}")}\n\n` +
      `${RUBRIC_PROMPT}${blueprintPrompt(bp)}\nŞık sayısı: ${choiceCount(unit.program)}.`,
  };
}

/** Çağrı 2 (arka planda): plandaki kalan bölümler, özet ve kartlar. */
export function outcomeRestPrompt(unit: PoolUnit, code: string, plan: string[]) {
  const bp = outcomeBlueprintKind(unit.program.kind);
  const rest = plan.slice(1);
  return {
    system: system(unit),
    user:
      `${officialBlock(outcomeUnit(unit, code))}\n\n${code} kazanımının dersi. Plan:\n${plan.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n` +
      `1. bölüm yazıldı. Şimdi planın 2-${plan.length}. bölümlerini (${rest.length} bölüm, sırayla, bu başlıklarla) yaz. JSON şeması:\n` +
      `{"sections": [${sectionShape(bp)}] (tam ${rest.length} bölüm; hepsinde outcome_code "${code}"), "summary": string (3-6 cümle), ` +
      `"cards": [{"front": string, "back": string}] (4-8 kart), ${RUBRIC_JSON_FIELDS}}\n\n${RUBRIC_PROMPT}${blueprintPrompt(bp)}\nŞık sayısı: ${choiceCount(unit.program)}.`,
  };
}

const firstSchema = z.object({
  title: z.string().min(2).max(200),
  overview: z.string().min(20).max(4000),
  plan: z.array(z.string().min(2).max(200)).min(OUTCOME_SECTIONS_MIN).max(OUTCOME_SECTIONS_MAX),
  key_terms: lessonSchema.shape.key_terms,
  sections: lessonSchema.shape.sections,
});
const restSchema = z.object({
  sections: lessonSchema.shape.sections,
  summary: lessonSchema.shape.summary,
  cards: lessonSchema.shape.cards,
});
export type OutcomeFirst = z.infer<typeof firstSchema>;

function parseWith<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const r = schema.safeParse(parseModelOutput(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function parseOutcomeFirst(text: string, code: string): OutcomeFirst | null {
  const out = parseWith(firstSchema, text);
  if (!out) return null;
  return { ...out, sections: out.sections.slice(0, 1).map((s) => ({ ...s, outcome_code: code })) };
}

/** İlk ekran için geçici ders gövdesi (özet/kartlar sonra gelir; şema alt sınırları için yer tutucu). */
export function firstLessonBody(first: OutcomeFirst): LessonBody {
  return { title: first.title, overview: first.overview, sections: first.sections, key_terms: first.key_terms, summary: first.overview, cards: [{ front: first.title, back: first.overview.slice(0, 600) }] };
}

export function mergeOutcomeLesson(first: OutcomeFirst, restText: string, code: string): LessonBody | null {
  const rest = parseWith(restSchema, restText);
  if (!rest) return null;
  const sections = [...first.sections, ...rest.sections.map((s) => ({ ...s, outcome_code: code }))].slice(0, OUTCOME_SECTIONS_MAX);
  return { title: first.title, overview: first.overview, sections, key_terms: first.key_terms, summary: rest.summary, cards: rest.cards };
}

/** Sıfır maliyetli kapı: GATE v14 kod katmanları + rubrik + sınav iskeleti + 6–8 bölüm. */
export function outcomeLessonIssues(lesson: LessonBody, code: string, programKind: string, choices: number): string[] {
  const n = lesson.sections.length;
  return [
    ...new Set([
      ...(n < OUTCOME_SECTIONS_MIN || n > OUTCOME_SECTIONS_MAX ? [`bölüm sayısı ${n} (beklenen ${OUTCOME_SECTIONS_MIN}-${OUTCOME_SECTIONS_MAX})`] : []),
      // İskelet ayrıca programın şık sayısıyla denetlenir (lessonGateIssues'a program türü verilmez, iskelet iki kez sayılmasın).
      ...lessonGateIssues(lesson, [code], ""),
      ...blueprintIssues(lesson, outcomeBlueprintKind(programKind), choices),
    ]),
  ];
}

export type OutcomeGenerated =
  | { ok: true; lesson: LessonBody; qa: Record<string, unknown> }
  | { ok: false; lesson: LessonBody | null; qa: Record<string, unknown> };

/**
 * Stream-first üretim. `onFirst` ilk bölüm hazır olunca çağrılır (öğrenci ekranı açılır); dönüş tam ders ve kapı sonucu.
 * Tam 3 model çağrısı: yazar (ilk), yazar (kalan), kör çözücü (iskelet soruları; kapı önce geçerse).
 */
export async function generateOutcomeLesson(
  unit: PoolUnit,
  code: string,
  llm: LlmCall,
  opts: { models: { generate: string; verify: string }; onUsage?: (e: UsageEntry) => Promise<void>; onFirst?: (first: OutcomeFirst) => Promise<void> },
): Promise<OutcomeGenerated> {
  const call = async (actionCode: UsageEntry["actionCode"], model: string, prompt: Omit<Parameters<LlmCall>[0], "model">) => {
    const out = await llm({ model, ...prompt });
    if (opts.onUsage) await opts.onUsage({ actionCode, model, tokensIn: out.tokensIn, tokensOut: out.tokensOut });
    return out.text;
  };
  const qaBase = { kind: OUTCOME_LESSON_KIND, rubric: RUBRIC_VERSION, blueprint: outcomeBlueprintKind(unit.program.kind), blueprint_version: BLUEPRINT_VERSION, checked_at: new Date().toISOString() };
  const first = parseOutcomeFirst(await call("OUTCOME_LESSON", opts.models.generate, outcomeFirstPrompt(unit, code)), code);
  if (!first) return { ok: false, lesson: null, qa: { ...qaBase, issues: ["ilk bölüm okunamadı"] } };
  if (opts.onFirst) await opts.onFirst(first);
  const lesson = mergeOutcomeLesson(first, await call("OUTCOME_LESSON", opts.models.generate, outcomeRestPrompt(unit, code, first.plan)), code);
  if (!lesson) return { ok: false, lesson: firstLessonBody(first), qa: { ...qaBase, issues: ["kalan bölümler okunamadı"] } };
  const choices = choiceCount(unit.program);
  const issues = outcomeLessonIssues(lesson, code, unit.program.kind, choices);
  if (!issues.length) {
    const checks = blueprintChecks(lesson).map((c) => ({ ...c, difficulty: "medium" as const }));
    const sub = outcomeUnit(unit, code);
    const raw = await call("OUTCOME_LESSON_VERIFY", opts.models.verify, { ...verifyPrompt(sub, checks), reasoningEffort: "low" });
    const review = parseCompactReview(raw, checks);
    if (!review) issues.push("iskelet sorusu: doğrulama yanıtı okunamadı");
    else for (const r of applyReview(checks, { lesson_ok: true, lesson_issues: [], items: review.rows }).rejected) issues.push(`iskelet sorusu doğrulanmadı (${r.reason})`);
  }
  const qa = { ...qaBase, ok: issues.length === 0, issues, sections: lesson.sections.length, verify_model: opts.models.verify };
  return issues.length ? { ok: false, lesson, qa } : { ok: true, lesson, qa };
}

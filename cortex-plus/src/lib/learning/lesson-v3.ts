import { z } from "zod";
import { lessonDiagramSchema } from "@/lib/learning/lesson-diagram";
import {
  lessonCardsSchema,
  lessonExampleSchema,
  lessonFormulaSchema,
  lessonProcedureSchema,
  lessonSourceSchema,
  lessonTableSchema,
  lessonV2Schema,
  looseText,
  sectionCheckSchema,
  sectionNoteSchema,
  type LessonV2,
  type SectionCheck,
} from "@/lib/learning/teaching-standards";

/**
 * LessonV3 — Ders → Ekran → Blok dizisi (16 Ekim 2026, ürün sahibinin kararı).
 *
 * V2'de bölümün sabit alanları vardı (gövde, kart, formül, adım, tablo, not,
 * soru): her türden en fazla bir tane, hep aynı sırada. V3'te bir ekran sıralı
 * bloklardan oluşur; formül metnin ortasında durabilir, bir kavram 2-3 ekrana
 * yayılabilir (`concept` aynı kalır).
 *
 * Kayıtlı V2 dersler veritabanında olduğu gibi kalır ve okunurken çevrilir
 * (`readLessonV3`). Ders metnini okuyan yan kullanıcılar (sohbet bağlamı,
 * podcast, puanlama) V2 görünümünü okur (`readLessonV2`).
 *
 * İki değişmez:
 * - Ekran i = bölüm i. Cevaplar (`lessonAnswers[i]`), `grade-check`'in
 *   `sectionIndex`'i ve puanlama bu yüzden değişmedi.
 * - Ekran başına bir soru: ilk `check` bloğu ekranın sorusudur.
 */

export const LESSON_V3_FORMAT = 3 as const;

const textBlockSchema = z.object({ type: z.literal("text"), text: z.string().min(2).max(2500) });
const formulaBlockSchema = z.object({ type: z.literal("formula"), formula: lessonFormulaSchema });
const procedureBlockSchema = z.object({ type: z.literal("procedure"), procedure: lessonProcedureSchema });
const tableBlockSchema = z.object({ type: z.literal("table"), table: lessonTableSchema });
const cardsBlockSchema = z.object({ type: z.literal("cards"), cards: lessonCardsSchema });
const noteBlockSchema = z.object({ type: z.literal("note"), note: sectionNoteSchema });
const diagramBlockSchema = z.object({ type: z.literal("diagram"), diagram: lessonDiagramSchema });
const exampleBlockSchema = z.object({ type: z.literal("example"), example: lessonExampleSchema });
const checkBlockSchema = z.object({ type: z.literal("check"), check: sectionCheckSchema });

export const lessonBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  formulaBlockSchema,
  procedureBlockSchema,
  tableBlockSchema,
  cardsBlockSchema,
  noteBlockSchema,
  diagramBlockSchema,
  exampleBlockSchema,
  checkBlockSchema,
]);

export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type LessonBlockType = LessonBlock["type"];

/** Bozuk tek blok dersi düşürmez: yalnız o blok atılır (V2'deki `.catch` ile aynı ilke). */
const blocksSchema = z.array(z.unknown()).transform((items, ctx): LessonBlock[] => {
  const blocks = items.flatMap((item): LessonBlock[] => {
    const parsed = lessonBlockSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  if (!blocks.length) {
    ctx.addIssue({ code: "custom", message: "Ekranda geçerli blok yok." });
    return z.NEVER;
  }
  return blocks.slice(0, 12);
});

export const lessonScreenSchema = z.object({
  heading: z.string().min(2).max(160),
  /** Giriş kartındaki "Bu derste neler var" listesinde kavramın altında durur. */
  lead: z.string().max(200).optional().catch(undefined),
  /** Aynı kavramın ardışık ekranları aynı adı taşır; yoksa başlık kavramdır. */
  concept: looseText(120),
  source: lessonSourceSchema.optional().catch(undefined),
  blocks: blocksSchema,
});

export type LessonScreen = z.infer<typeof lessonScreenSchema>;

const v2 = lessonV2Schema.shape;

export const lessonV3Schema = z.object({
  format: z.literal(LESSON_V3_FORMAT),
  title: v2.title,
  objective: v2.objective,
  overview: v2.overview,
  screens: z.array(lessonScreenSchema).min(1).max(12),
  /** Yalnız eski derslerden gelir; V3 yazarı çözümlü örneği ekranın `example` bloğuna koyar. */
  example: v2.example,
  commonMistake: v2.commonMistake,
  infoCheck: v2.infoCheck,
  findError: v2.findError,
  numericalCheck: v2.numericalCheck,
  summary: v2.summary,
  nextFocus: v2.nextFocus,
});

export type LessonV3 = z.infer<typeof lessonV3Schema>;

/** Ekranın sorusu: ilk `check` bloğu. */
export function screenCheck(screen: Pick<LessonScreen, "blocks">): SectionCheck | undefined {
  const block = screen.blocks.find((item) => item.type === "check");
  return block?.type === "check" ? block.check : undefined;
}

/** Soru ilk bloksa "önce dene": sonraki bloklar cevaptan sonra açılır. */
export function screenChecksFirst(screen: Pick<LessonScreen, "blocks">): boolean {
  return screen.blocks[0]?.type === "check";
}

/** Ekranın kavramı (`concept` yoksa başlık). */
export function screenConcept(screen: Pick<LessonScreen, "concept" | "heading">): string {
  return (screen.concept ?? "").trim() || screen.heading.trim();
}

/** Ardışık aynı kavramlı ekranlar tek grup: giriş planı ve "1/2" etiketi bunu okur. */
export function conceptGroups(screens: Pick<LessonScreen, "concept" | "heading">[]): { concept: string; screens: number[] }[] {
  const groups: { concept: string; key: string; screens: number[] }[] = [];
  screens.forEach((screen, index) => {
    const concept = screenConcept(screen);
    const key = concept.toLocaleLowerCase("tr");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.screens.push(index);
    else groups.push({ concept, key, screens: [index] });
  });
  return groups.map(({ concept, screens: members }) => ({ concept, screens: members }));
}

/** Metin bloklarının birleşimi (kaynak denetimi, okuma süresi, sohbet bağlamı). */
export function screenText(screen: { blocks: readonly { type: string }[] }): string {
  return screen.blocks
    .flatMap((block) => (block.type === "text" ? [String((block as { text?: unknown }).text ?? "").trim()] : []))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Ekranın düz metni: metin blokları + ikinci ve sonraki formül/adım/tablo/örnek.
 * V2 görünümünde bölümün tek formülü/adım listesi/tablosu kendi alanında durur;
 * fazlası gövdeye metin olarak eklenir ki metni okuyan hiçbir şey kaybolmasın.
 */
function screenBodyForV2(screen: LessonScreen): string {
  const seen = new Set<LessonBlockType>();
  const parts: string[] = [];
  for (const block of screen.blocks) {
    const first = !seen.has(block.type);
    seen.add(block.type);
    if (block.type === "text") parts.push(block.text.trim());
    else if (block.type === "example") parts.push(exampleLine(block.example));
    else if (!first && block.type === "formula") parts.push(`${block.formula.title}: ${block.formula.expression}`);
    else if (!first && block.type === "procedure") {
      parts.push(block.procedure.steps.map((step, index) => `${index + 1}. ${step.label}: ${step.detail}`).join("\n"));
    } else if (!first && block.type === "table") {
      parts.push([block.table.columns.join(" | "), ...block.table.rows.map((row) => row.join(" | "))].join("\n"));
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

function exampleLine(example: z.infer<typeof lessonExampleSchema>): string {
  const steps = example.steps?.length ? ` ${example.steps.join(" ")}` : "";
  const result = example.result ? ` Sonuç: ${example.result}` : "";
  return `Örnek: ${example.prompt}${steps || ` ${example.solution}`}${result}`.trim();
}

function firstBlock<T extends LessonBlockType>(screen: LessonScreen, type: T) {
  return screen.blocks.find((block) => block.type === type) as Extract<LessonBlock, { type: T }> | undefined;
}

/** V3 → V2 görünümü. Ekran i → bölüm i; ekranın sorusu bölümün sorusu. */
export function v3ToV2(lesson: LessonV3): LessonV2 {
  return {
    title: lesson.title,
    objective: lesson.objective,
    overview: lesson.overview,
    sections: lesson.screens.map((screen) => {
      const check = screenCheck(screen);
      return {
        heading: screen.heading,
        ...(screen.lead ? { lead: screen.lead } : {}),
        body: screenBodyForV2(screen),
        ...(screen.source ? { source: screen.source } : {}),
        ...(check ? { check, checkFirst: screenChecksFirst(screen) } : {}),
        note: firstBlock(screen, "note")?.note,
        cards: firstBlock(screen, "cards")?.cards,
        diagram: firstBlock(screen, "diagram")?.diagram,
        formula: firstBlock(screen, "formula")?.formula,
        procedure: firstBlock(screen, "procedure")?.procedure,
        table: firstBlock(screen, "table")?.table,
      };
    }),
    example: lesson.example,
    commonMistake: lesson.commonMistake,
    infoCheck: lesson.infoCheck,
    findError: lesson.findError,
    numericalCheck: lesson.numericalCheck,
    summary: lesson.summary,
    nextFocus: lesson.nextFocus,
  };
}

/**
 * V2 → V3. Bloklar V2 ekranının çizim sırasıyla dizilir (gövde, kartlar,
 * formül, adımlar, tablo, çizim, not); `checkFirst` ise soru başa, değilse sona.
 */
export function v2ToV3(lesson: LessonV2): LessonV3 {
  return {
    format: LESSON_V3_FORMAT,
    title: lesson.title,
    objective: lesson.objective,
    overview: lesson.overview,
    screens: lesson.sections.map((section) => {
      const content: LessonBlock[] = [];
      if (section.body.trim()) content.push({ type: "text", text: section.body });
      if (section.cards) content.push({ type: "cards", cards: section.cards });
      if (section.formula) content.push({ type: "formula", formula: section.formula });
      if (section.procedure) content.push({ type: "procedure", procedure: section.procedure });
      if (section.table) content.push({ type: "table", table: section.table });
      if (section.diagram) content.push({ type: "diagram", diagram: section.diagram });
      if (section.note) content.push({ type: "note", note: section.note });
      const question: LessonBlock[] = section.check ? [{ type: "check", check: section.check }] : [];
      return {
        heading: section.heading,
        ...(section.lead ? { lead: section.lead } : {}),
        ...(section.source ? { source: section.source } : {}),
        blocks: section.checkFirst ? [...question, ...content] : [...content, ...question],
      };
    }),
    example: lesson.example,
    commonMistake: lesson.commonMistake,
    infoCheck: lesson.infoCheck,
    findError: lesson.findError,
    numericalCheck: lesson.numericalCheck,
    summary: lesson.summary,
    nextFocus: lesson.nextFocus,
  };
}

export function isLessonV3(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { format?: unknown }).format === LESSON_V3_FORMAT);
}

/** Kayıtlı ders hangi biçimde olursa olsun V3. Bozuksa null. */
export function readLessonV3(value: unknown): LessonV3 | null {
  if (isLessonV3(value)) return lessonV3Schema.safeParse(value).data ?? null;
  const legacy = lessonV2Schema.safeParse(value);
  return legacy.success ? v2ToV3(legacy.data) : null;
}

/** Kayıtlı ders hangi biçimde olursa olsun V2 görünümü. Bozuksa null. */
export function readLessonV2(value: unknown): LessonV2 | null {
  if (isLessonV3(value)) {
    const parsed = lessonV3Schema.safeParse(value);
    return parsed.success ? v3ToV2(parsed.data) : null;
  }
  return lessonV2Schema.safeParse(value).data ?? null;
}

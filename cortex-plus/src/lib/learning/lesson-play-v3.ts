/**
 * LessonV3 oynatma paketi (16 Ekim 2026): mühürleme ve istemcide okuma.
 *
 * lesson-play.ts'ten ayrı: teaching-standards → lesson-play içe aktarıyor,
 * lesson-v3 de teaching-standards'ı; bu kod lesson-play'de dursaydı döngü
 * lesson-v3'ün şemalarını yarım yüklenmiş teaching-standards'la kurardı.
 */

import { z } from "zod";
import {
  publicLessonV2Schema,
  sealLessonForPlay,
  sealSectionCheck,
  type PublicLessonV2,
  type PublicSectionCheck,
  type QualityReportEntry,
} from "@/lib/learning/lesson-play";
import {
  isLessonV3,
  readLessonV2,
  readLessonV3,
  v2ToV3,
  type LessonBlock,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import type { MaterialLanguage } from "@/lib/learning/teacher-brain";

/** V3 oynatma bloğu: `check` bloğu mühürlü soru taşır, öbürleri olduğu gibi. */
export type PublicLessonBlock =
  | Exclude<LessonBlock, { type: "check" }>
  | { type: "check"; check: PublicSectionCheck };

export type PublicLessonV3 = Omit<LessonV3, "screens" | "findError" | "numericalCheck" | "infoCheck"> & {
  screens: Array<Omit<LessonV3["screens"][number], "blocks"> & { blocks: PublicLessonBlock[] }>;
  findError?: { prompt: string; options: string[]; faultyText?: string };
  numericalCheck?: { prompt: string };
  infoCheck?: { prompt: string };
  qualityReport?: QualityReportEntry[];
};

/**
 * İstemcinin V3 paketi okuması. Bloklar sunucuda zaten şemadan geçti; burada
 * yalnız biçim tutuyor mu bakılır, bilinmeyen blok atılır (yeni bir blok türü
 * eski istemciyi kırmasın).
 */
const publicBlockSchema = z.object({ type: z.string() }).passthrough();

export const publicLessonV3Schema = z.object({
  format: z.literal(3),
  title: z.string().min(2).max(160),
  overview: z.string().optional(),
  objective: z.string().optional(),
  screens: z
    .array(
      z.object({
        heading: z.string().min(1).max(160),
        lead: z.string().optional(),
        concept: z.string().optional(),
        source: z.object({ file: z.string(), page: z.number().optional() }).optional(),
        blocks: z.array(publicBlockSchema).transform((blocks) =>
          blocks.filter((block): block is z.infer<typeof publicBlockSchema> => KNOWN_BLOCKS.has(block.type)),
        ),
      }),
    )
    .min(1),
  example: publicLessonV2Schema.shape.example,
  commonMistake: publicLessonV2Schema.shape.commonMistake,
  summary: publicLessonV2Schema.shape.summary,
  nextFocus: publicLessonV2Schema.shape.nextFocus,
  findError: publicLessonV2Schema.shape.findError,
  numericalCheck: publicLessonV2Schema.shape.numericalCheck,
  infoCheck: publicLessonV2Schema.shape.infoCheck,
  qualityReport: publicLessonV2Schema.shape.qualityReport,
});

const KNOWN_BLOCKS = new Set(["text", "formula", "procedure", "table", "cards", "note", "diagram", "example", "check"]);

/** İstemci: paket V3 ise V3 olarak, eski V2 paketiyse çevrilerek okunur. */
export function readPlayLessonV3(value: unknown): PublicLessonV3 | null {
  if (isLessonV3(value)) {
    const parsed = publicLessonV3Schema.safeParse(value);
    return parsed.success ? (parsed.data as unknown as PublicLessonV3) : null;
  }
  // Mühürlü V2 paketi; olmazsa mühürsüz (yerel oturum) tam V2.
  const legacy = publicLessonV2Schema.safeParse(value).data ?? readLessonV2(value);
  if (!legacy) return null;
  return v2ToV3(legacy as unknown as LessonV2) as unknown as PublicLessonV3;
}

/**
 * Kayıtlı ders (V2 ya da V3) → oynatma paketi. `format: 3` diyen istemci V3
 * paketi alır; demeyen (yayın sırasında açık kalmış eski sekme) V2 paketi —
 * eski ekran V3'ü okuyamaz, ders boş açılmasın.
 */
export function sealStoredLesson(
  stored: unknown,
  options: { language?: MaterialLanguage; format?: 2 | 3 } = {},
): PublicLessonV2 | PublicLessonV3 | null {
  if (options.format === 3) {
    const lesson = readLessonV3(stored);
    return lesson ? sealLessonV3ForPlay(lesson) : null;
  }
  const lesson = readLessonV2(stored);
  return lesson ? sealLessonForPlay(lesson, options) : null;
}

/** V3 oynatma paketi: `check` bloklarında cevap ve gerekçe yok. */
export function sealLessonV3ForPlay(lesson: LessonV3): PublicLessonV3 {
  return {
    ...lesson,
    screens: lesson.screens.map((screen) => ({
      ...screen,
      blocks: screen.blocks.map((block): PublicLessonBlock =>
        block.type === "check" ? { type: "check", check: sealSectionCheck(block.check) } : block,
      ),
    })),
    findError: lesson.findError
      ? { prompt: lesson.findError.prompt, options: lesson.findError.options, faultyText: lesson.findError.faultyText }
      : undefined,
    numericalCheck: lesson.numericalCheck ? { prompt: lesson.numericalCheck.prompt } : undefined,
    infoCheck: lesson.infoCheck ? { prompt: lesson.infoCheck.prompt } : undefined,
  };
}

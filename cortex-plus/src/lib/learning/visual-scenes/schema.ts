import { z } from "zod";
import {
  ACADEMIC_DOMAINS,
  VISUAL_ARCHETYPES,
  type AcademicDomain,
  type VisualArchetype,
} from "@/lib/learning/visual-scenes/archetype";

/**
 * Görsel sahne verisi (Faz 1-B). Model yalnız anlamı yazar (etiket, rol, yön, büyüklük sırası);
 * koordinatı ekran kurar. Uzun metin düşürülmez, kırpılır; geçersiz alan atılır, sahne ancak zorunlu
 * iskelet yoksa düşer.
 */

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/** Kırpılan metin: boşluk sadeleşir, `max` karakterde kesilir, `min`'in altı geçersiz. */
/** Uzun metni kelime sınırında keser ve "…" ekler (yarım kelime kalmaz). */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.max(1, max - 1));
  const space = head.lastIndexOf(" ");
  const base = space >= max * 0.5 ? head.slice(0, space) : head;
  return `${base.replace(/[\s,.;:-]+$/, "")}…`;
}

export function clampText(max: number, min = 1) {
  return z
    .union([z.string(), z.number().finite()])
    .transform((value) => cutAtWord(squash(String(value)), max))
    .pipe(z.string().min(min));
}

const optionalText = (max: number) => clampText(max).optional().catch(undefined);

/** Diziyi kırpar; bozuk öğeyi atar (tek öğe sahneyi düşürmesin). */
function looseArray<T extends z.ZodTypeAny>(item: T, min: number, max: number) {
  return z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((entry) => {
        const parsed = item.safeParse(entry);
        return parsed.success ? [parsed.data as z.infer<T>] : [];
      }),
    )
    .pipe(z.array(z.any()).min(min))
    .transform((items) => items.slice(0, max) as z.infer<T>[]);
}

/* ───────── 1) Tıp / biyoloji mekanizma zinciri ───────── */

export const PATHWAY_ROLES = ["trigger", "receptor", "messenger", "target", "finding"] as const;
export type PathwayRole = (typeof PATHWAY_ROLES)[number];
export const PATHWAY_ROLE_LABEL: Record<PathwayRole, string> = {
  trigger: "Tetikleyici",
  receptor: "Reseptör",
  messenger: "İkincil Haberci",
  target: "Enzim / Hedef",
  finding: "Klinik Bulgu",
};

export const medicalPathwaySchema = z.object({
  archetype: z.literal("MEDICAL_BIOLOGY_PATHWAY"),
  title: clampText(90, 2),
  layer: z.enum(["cell", "tissue", "organ"]).catch("cell"),
  steps: looseArray(
    z.object({
      role: z.enum(PATHWAY_ROLES).catch("target"),
      label: clampText(48),
      detail: optionalText(70),
      /** Bu adıma gelen ok: aktivasyon (yeşil) ya da inhibisyon / blokaj (kırmızı [X]). İlk adımda yok sayılır. */
      effect: z.enum(["activate", "inhibit"]).catch("activate"),
    }),
    2,
    5,
  ),
  spotlight: z.object({ text: clampText(140, 4) }),
});
export type MedicalPathwayData = z.infer<typeof medicalPathwaySchema>;

/* ───────── 2) Fizik / mühendislik / kimya kuvvet diyagramı ───────── */

export const VECTOR_DIRECTIONS = ["up", "down", "left", "right", "up_right", "up_left", "down_right", "down_left"] as const;
export type VectorDirection = (typeof VECTOR_DIRECTIONS)[number];

export const mechanicsSchema = z.object({
  archetype: z.literal("ENGINEERING_PHYSICS_MECHANICS"),
  title: clampText(90, 2),
  setting: z.enum(["free_body", "fluid", "circuit"]).catch("free_body"),
  body: z.object({ label: clampText(28) }),
  vectors: looseArray(
    z.object({
      symbol: clampText(8),
      label: clampText(32),
      direction: z.enum(VECTOR_DIRECTIONS).catch("up"),
      /** Göreli büyüklük 1-5: ok bu sırayla uzar ve kalınlaşır. */
      magnitude: z.coerce.number().catch(3).transform((value) => Math.max(1, Math.min(5, Math.round(value)))),
    }),
    1,
    6,
  ),
  logic: z.object({
    formula: clampText(60, 2),
    drivers: looseArray(
      z.object({
        symbol: clampText(8),
        label: clampText(36),
        /** Değişken artınca sonuç artar (up) ya da azalır (down). */
        effect: z.enum(["up", "down"]).catch("up"),
      }),
      1,
      4,
    ),
    /** Formülde yer almayan çeldirici değişkenler: üstü çizili kırmızı rozet. */
    distractors: looseArray(z.object({ symbol: clampText(8), label: clampText(36) }), 0, 2).catch([]),
  }),
});
export type MechanicsData = z.infer<typeof mechanicsSchema>;

/* ───────── 3) Mimarlık teknik pafta ───────── */

export const blueprintSchema = z.object({
  archetype: z.literal("ARCHITECTURE_SPATIAL_BLUEPRINT"),
  title: clampText(90, 2),
  view: z.enum(["section", "elevation"]).catch("section"),
  theme: z.enum(["night", "paper"]).catch("night"),
  /** Numaralı callout pinleri (1-4): taşıyıcı aks, cephe katmanı, açıklık, kesit sırasıyla yerleşir. */
  elements: looseArray(z.object({ label: clampText(36), role: clampText(80) }), 2, 4),
  dimension: z.object({ label: clampText(24) }).optional().catch(undefined),
  flow: z.enum(["light", "load", "both"]).catch("load"),
});
export type BlueprintData = z.infer<typeof blueprintSchema>;

/* ───────── 4) Hukuk / sosyal karar akışı ───────── */

/** "3/5" → {num:3, den:5}; bozuksa null. */
export function parseFraction(text: string): { num: number; den: number } | null {
  const match = /^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/.exec(text);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  return den > 0 && num > 0 && num <= den ? { num, den } : null;
}

export const lawDecisionSchema = z.object({
  archetype: z.literal("LAW_SOCIAL_FLOWCHART"),
  title: clampText(90, 2),
  decision: z.object({
    question: clampText(80, 3),
    yes: clampText(60),
    no: clampText(60),
  }),
  /** Çoğunluk barometresi (ör. 3/5 = 360, 2/3 = 400): kesir + isteğe bağlı sayı ve toplam. */
  majority: looseArray(
    z
      .object({
        label: clampText(36),
        fraction: clampText(7),
        count: z.coerce.number().int().positive().optional().catch(undefined),
        total: z.coerce.number().int().positive().optional().catch(undefined),
      })
      .refine((row) => parseFraction(row.fraction) !== null),
    0,
    3,
  ).catch([]),
  timeline: looseArray(z.object({ date: clampText(16), label: clampText(40) }), 0, 5).catch([]),
  ruleVsException: z.object({
    rule: looseArray(clampText(70), 1, 3),
    exception: looseArray(clampText(70), 1, 3),
  }),
});
export type LawDecisionData = z.infer<typeof lawDecisionSchema>;

/* ───────── 5) Matematik / algoritma grafiği ───────── */

export const CURVE_FAMILIES = ["linear", "quadratic", "cubic", "exponential", "logarithmic", "sine", "absolute"] as const;
export type CurveFamily = (typeof CURVE_FAMILIES)[number];
export const CURVE_POINTS = ["root", "vertex", "y_intercept", "max", "min", "inflection"] as const;
export type CurvePointKind = (typeof CURVE_POINTS)[number];
export const SHAPE_KINDS = ["triangle", "right_triangle", "rectangle", "parallelogram", "circle"] as const;

export const mathGraphSchema = z.object({
  archetype: z.literal("MATH_ALGORITHMIC_GRAPH"),
  title: clampText(90, 2),
  mode: z.enum(["function", "integral", "geometry"]).catch("function"),
  curve: z
    .object({
      family: z.enum(CURVE_FAMILIES).catch("quadratic"),
      expression: clampText(40),
      /** Ters yönlü eğri (ör. aşağı açılan parabol, azalan üstel). */
      flipped: z.boolean().optional().catch(undefined),
      points: looseArray(z.object({ kind: z.enum(CURVE_POINTS), label: clampText(24) }), 0, 3).catch([]),
    })
    .optional()
    .catch(undefined),
  integral: z.object({ from: clampText(8), to: clampText(8), label: clampText(40) }).optional().catch(undefined),
  shape: z
    .object({
      kind: z.enum(SHAPE_KINDS).catch("triangle"),
      angles: looseArray(z.object({ label: clampText(12), group: z.coerce.number().int().min(1).max(3).catch(1) }), 0, 4).catch([]),
      sides: looseArray(z.object({ label: clampText(12), group: z.coerce.number().int().min(1).max(3).catch(1) }), 0, 4).catch([]),
    })
    .optional()
    .catch(undefined),
  /** Adım adım dönüşüm (0-4): okla bağlı çipler. */
  steps: looseArray(clampText(40), 0, 4).catch([]),
});
export type MathGraphData = z.infer<typeof mathGraphSchema>;

/* ───────── 6) Belgedeki şekil / tablo spotu ───────── */

export const documentSpotlightSchema = z.object({
  archetype: z.literal("DOCUMENT_FIGURE_SPOTLIGHT"),
  title: clampText(90, 2),
  page: z.coerce.number().int().positive().optional().catch(undefined),
  figure: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("table"),
      caption: clampText(80),
      columns: looseArray(clampText(24), 2, 4),
      rows: looseArray(looseArray(clampText(28), 1, 4), 1, 5),
    }),
    z.object({
      kind: z.literal("image"),
      caption: clampText(80),
      /** İmzalı depo adresi (öğrencinin yüklediği sayfa/fotoğraf). */
      href: z.string().url().max(2000),
      /** genişlik / yükseklik */
      aspect: z.coerce.number().min(0.3).max(3).catch(0.75),
    }),
  ]),
  /** Vurgulanacak noktalar: tabloda satır/sütun (0'dan), resimde 0-1 arası x/y. */
  spots: looseArray(
    z.object({
      row: z.coerce.number().int().min(0).max(4).optional().catch(undefined),
      col: z.coerce.number().int().min(0).max(3).optional().catch(undefined),
      x: z.coerce.number().min(0).max(1).optional().catch(undefined),
      y: z.coerce.number().min(0).max(1).optional().catch(undefined),
      label: clampText(28),
      note: clampText(80),
    }),
    1,
    3,
  ),
});
export type DocumentSpotlightData = z.infer<typeof documentSpotlightSchema>;

/* ───────── Birleşik sahne ───────── */

export const visualSceneSchema = z.discriminatedUnion("archetype", [
  medicalPathwaySchema,
  mechanicsSchema,
  blueprintSchema,
  lawDecisionSchema,
  mathGraphSchema,
  documentSpotlightSchema,
]);
export type VisualScene = z.infer<typeof visualSceneSchema>;

const ARCHETYPE_ALIASES: Record<string, VisualArchetype> = {
  medical: "MEDICAL_BIOLOGY_PATHWAY",
  pathway: "MEDICAL_BIOLOGY_PATHWAY",
  mechanics: "ENGINEERING_PHYSICS_MECHANICS",
  physics: "ENGINEERING_PHYSICS_MECHANICS",
  blueprint: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  architecture: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  law: "LAW_SOCIAL_FLOWCHART",
  flowchart: "LAW_SOCIAL_FLOWCHART",
  math: "MATH_ALGORITHMIC_GRAPH",
  graph: "MATH_ALGORITHMIC_GRAPH",
  document: "DOCUMENT_FIGURE_SPOTLIGHT",
  spotlight: "DOCUMENT_FIGURE_SPOTLIGHT",
};

function normalizeArchetype(raw: unknown): VisualArchetype | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if ((VISUAL_ARCHETYPES as readonly string[]).includes(upper)) return upper as VisualArchetype;
  return ARCHETYPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Model çıktısını ya da kayıttaki veriyi sahneye oturtur. `fallback`: veride arketip yoksa (model alanı
 * unuttuysa) sınıflandırıcının seçtiği arketip. Geçersizse null.
 */
export function parseVisualScene(raw: unknown, fallback?: VisualArchetype): VisualScene | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const archetype = normalizeArchetype(row.archetype ?? row.visualArchetype) ?? fallback ?? null;
  if (!archetype) return null;
  const parsed = visualSceneSchema.safeParse({ ...row, archetype });
  return parsed.success ? parsed.data : null;
}

export const academicDomainSchema = z.enum(ACADEMIC_DOMAINS);
export const visualArchetypeSchema = z.enum(VISUAL_ARCHETYPES);

export function readAcademicDomain(raw: unknown): AcademicDomain | undefined {
  const parsed = academicDomainSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function readVisualArchetype(raw: unknown): VisualArchetype | undefined {
  return normalizeArchetype(raw) ?? undefined;
}

/* ───────── 1 dk çizimli video: 5 sahneli akış ───────── */

export const REEL_BEATS = ["hook", "main_diagram", "comparison", "exam_trap", "memory_nail"] as const;
export type ReelBeat = (typeof REEL_BEATS)[number];
export const REEL_BEAT_LABEL: Record<ReelBeat, string> = {
  hook: "Çarpıcı Kanca",
  main_diagram: "Branşa Özel Ana Çizim",
  comparison: "Karşılaştırma / Formül Mantığı",
  exam_trap: "Sakın Buna Düşme!",
  memory_nail: "Hafıza Çivisi",
};

export const reelHookSchema = z.object({
  kind: z.literal("hook"),
  /** Konunun sınavda en çok çıkan kilit sorusu. */
  question: clampText(110, 6),
  /** Merak uyandıran görsel başlık. */
  visualTitle: clampText(48, 2),
  badge: optionalText(28),
});

export const reelComparisonSchema = z.object({
  kind: z.literal("comparison"),
  title: clampText(70, 2),
  mode: z.enum(["concept", "variable"]).catch("concept"),
  left: clampText(24),
  right: clampText(24),
  rows: looseArray(
    z.object({
      label: clampText(24),
      left: clampText(36),
      right: clampText(36),
      /** Satırda öne çıkan taraf (renkli onay) ya da yok. */
      winner: z.enum(["left", "right", "none"]).catch("none"),
    }),
    2,
    4,
  ),
});

export const reelTrapSchema = z.object({
  kind: z.literal("exam_trap"),
  title: clampText(60, 2),
  wrong: clampText(110, 4),
  right: clampText(120, 4),
  tell: optionalText(90),
});

export const reelMemorySchema = z.object({
  kind: z.literal("memory_nail"),
  mnemonic: clampText(60, 2),
  keys: looseArray(z.object({ letter: clampText(3), meaning: clampText(28) }), 0, 5).catch([]),
  summary: clampText(120, 4),
});

export const reelArchetypeSchema = z.object({ kind: z.literal("archetype"), scene: z.unknown() }).transform((row, ctx) => {
  const scene = parseVisualScene(row.scene);
  if (!scene) {
    ctx.addIssue({ code: "custom", message: "Arketip sahnesi geçersiz." });
    return z.NEVER;
  }
  return { kind: "archetype" as const, scene };
});

export type ReelHook = z.infer<typeof reelHookSchema>;
export type ReelComparison = z.infer<typeof reelComparisonSchema>;
export type ReelTrap = z.infer<typeof reelTrapSchema>;
export type ReelMemory = z.infer<typeof reelMemorySchema>;
export type ReelArchetype = { kind: "archetype"; scene: VisualScene };
export type ReelVisual = ReelHook | ReelArchetype | ReelComparison | ReelTrap | ReelMemory;

const BEAT_KIND: Record<ReelBeat, ReelVisual["kind"]> = {
  hook: "hook",
  main_diagram: "archetype",
  comparison: "comparison",
  exam_trap: "exam_trap",
  memory_nail: "memory_nail",
};

export function reelKindForBeat(beat: ReelBeat): ReelVisual["kind"] {
  return BEAT_KIND[beat];
}

/** Sahnenin görsel verisi; `beat` verilirse tür ona göre tamamlanır. Geçersizse null. */
export function parseReelVisual(raw: unknown, beat?: ReelBeat, fallbackArchetype?: VisualArchetype): ReelVisual | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = typeof row.kind === "string" ? row.kind : beat ? BEAT_KIND[beat] : "";
  if (kind === "archetype") {
    const sceneRaw = row.scene && typeof row.scene === "object" ? row.scene : row;
    const scene = parseVisualScene(sceneRaw, fallbackArchetype);
    return scene ? { kind: "archetype", scene } : null;
  }
  const schema =
    kind === "hook" ? reelHookSchema : kind === "comparison" ? reelComparisonSchema : kind === "exam_trap" ? reelTrapSchema : kind === "memory_nail" ? reelMemorySchema : null;
  if (!schema) return null;
  const parsed = schema.safeParse({ ...row, kind });
  return parsed.success ? (parsed.data as ReelVisual) : null;
}

export function isReelBeat(value: unknown): value is ReelBeat {
  return typeof value === "string" && (REEL_BEATS as readonly string[]).includes(value);
}

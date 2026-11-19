import { z } from "zod";
import type { PedagogicalLevel } from "@/lib/learning/pedagogical-profile";
import { isProgression, phraseDirection, trendOf } from "./direction-semantics";
import {
  ACADEMIC_DOMAINS,
  CONCEPT_STRUCTURES,
  VISUAL_ARCHETYPES,
  foldTr,
  type AcademicDomain,
  type ConceptStructure,
  type VisualArchetype,
} from "@/lib/learning/visual-scenes/archetype";

/**
 * Görsel sahne verisi (Faz 1-B). Model yalnız anlamı yazar (etiket, rol, yön, büyüklük sırası);
 * koordinatı ekran kurar. Uzun metin düşürülmez, kırpılır; geçersiz alan atılır, sahne ancak zorunlu
 * iskelet yoksa düşer.
 *
 * 20 Kasım 2026: her sahne isteğe bağlı `pedagogicalLevel` (1-4) taşır; yoğunluk ve yazı boyu buna göre ayarlanır.
 * Yeni alanların hepsi isteğe bağlıdır: kayıttaki eski sahne JSON'ları aynen ayrışır ve çizilir.
 */

/** Seviye: 1 ortaokul, 2 lise, 3 üniversite, 4 uzmanlık. Geçersizse yok sayılır (sahne düşmez). */
export const pedagogicalLevelField = z.coerce
  .number()
  .int()
  .min(1)
  .max(4)
  .transform((value) => value as PedagogicalLevel)
  .optional()
  .catch(undefined);

/** Düğüm/öğe kimliği: kısa metin ya da sayı (model "1" ya da 1 yazabilir). */
const idField = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value).replace(/\s+/g, " ").trim().slice(0, 36))
  .pipe(z.string().min(1));

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

/**
 * Simge alanı (F_1, ΔT …): model kelime yazarsa üç noktayla kesilmez; kelimelerin baş harflerinden kısaltma olur
 * (tek kelimede baş harf). Anlamın tamamı etiket alanında durur.
 */
export function shortSymbol(text: string, max: number): string {
  // Eski kayıtlarda kesilmiş simge ("Kelim…") de kısaltmaya döner.
  const value = squash(text).replace(/…$/, "");
  if (value.length <= max && value === squash(text)) return value;
  const words = value.split(" ").filter((word) => /\p{L}/u.test(word));
  const initials = words.map((word) => (word.match(/\p{L}/u)?.[0] ?? "").toLocaleUpperCase("tr")).join("");
  return (words.length > 1 ? initials : initials.slice(0, 1)).slice(0, max) || value.slice(0, max);
}

export function symbolText(max: number) {
  return z
    .union([z.string(), z.number().finite()])
    .transform((value) => shortSymbol(String(value), max))
    .pipe(z.string().min(1));
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
  pedagogicalLevel: pedagogicalLevelField,
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
  pedagogicalLevel: pedagogicalLevelField,
  /** `trend`: kuvvet olmayan içerik (eğilim, değişim yönü): aynı bileşen, kuvvet/serbest cisim dili kullanılmaz. */
  setting: z.enum(["free_body", "fluid", "circuit", "trend"]).catch("free_body"),
  body: z.object({ label: clampText(40) }),
  vectors: looseArray(
    z.object({
      symbol: symbolText(8),
      label: clampText(56),
      direction: z.enum(VECTOR_DIRECTIONS).catch("up"),
      /** Ok yönünde ilerledikçe gösterilen nicelik artar mı azalır mı (eğilim sahnesi). */
      trend: z.enum(["increase", "decrease"]).optional().catch(undefined),
      /** Göreli büyüklük 1-5: ok bu sırayla uzar ve kalınlaşır. */
      magnitude: z.coerce.number().catch(3).transform((value) => Math.max(1, Math.min(5, Math.round(value)))),
    }),
    1,
    6,
  ),
  logic: z.object({
    formula: clampText(100, 2),
    drivers: looseArray(
      z.object({
        symbol: symbolText(8),
        label: clampText(56),
        /** Değişken artınca sonuç artar (up) ya da azalır (down). */
        effect: z.enum(["up", "down"]).catch("up"),
      }),
      1,
      4,
    ),
    /** Formülde yer almayan çeldirici değişkenler: üstü çizili kırmızı rozet. */
    distractors: looseArray(z.object({ symbol: symbolText(8), label: clampText(56) }), 0, 2).catch([]),
  }),
});
export type MechanicsData = z.infer<typeof mechanicsSchema>;

/**
 * Yön/eğilim onarımı: etiketteki ilerleme yönü ("soldan sağa" …) okun yönüyle çelişirse ok etikete uyar; etiketteki
 * "artar/azalır" `trend` alanını belirler. Bütün oklar eğilim anlatıyorsa (kuvvet değil) sahne `trend` olur.
 */
export function repairMechanics(data: MechanicsData): MechanicsData {
  const vectors = data.vectors.map((vector) => {
    const said = phraseDirection(vector.label);
    const trend = trendOf(vector.label) ?? vector.trend;
    return { ...vector, direction: said ?? vector.direction, ...(trend ? { trend } : {}) };
  });
  const trendLike = (vector: (typeof vectors)[number]) => Boolean(vector.trend) || isProgression(vector.label);
  const setting = data.setting === "free_body" && vectors.every(trendLike) ? "trend" : data.setting;
  return { ...data, setting, vectors };
}

/* ───────── 3) Mimarlık teknik pafta ───────── */

export const BLUEPRINT_VIEWS = ["elevation", "section", "plan", "schematic"] as const;
export type BlueprintView = (typeof BLUEPRINT_VIEWS)[number];

/** Yapı elemanı türü: çizimin geometrisi bu türlerden kurulur. */
export const BLUEPRINT_KINDS = ["column", "beam", "slab", "wall", "opening", "arch", "dome", "vault", "roof", "foundation", "stair", "facade"] as const;
export type BlueprintKind = (typeof BLUEPRINT_KINDS)[number];
export const BLUEPRINT_KIND_LABEL: Record<BlueprintKind, string> = {
  column: "Kolon",
  beam: "Kiriş",
  slab: "Döşeme",
  wall: "Duvar",
  opening: "Açıklık",
  arch: "Kemer",
  dome: "Kubbe",
  vault: "Tonoz",
  roof: "Çatı",
  foundation: "Temel",
  stair: "Merdiven",
  facade: "Cephe",
};

/** Tür adı (Türkçe ya da İngilizce) ya da etiketteki kök → tür. Sıra önemli: özel (kubbe, kemer) genelden (duvar) önce. */
const BLUEPRINT_KIND_WORDS: [BlueprintKind, RegExp][] = [
  ["dome", /(?<![a-z])(kubbe|dome|kasnak)/],
  ["vault", /(?<![a-z])(tonoz|vault|besik ortu)/],
  ["arch", /(?<![a-z])(kemer|arch|revak)/],
  ["stair", /(?<![a-z])(merdiven|stair|basamak)/],
  ["foundation", /(?<![a-z])(temel|foundation|footing|radye)/],
  ["roof", /(?<![a-z])(cati|roof|mahya|sacak)/],
  ["opening", /(?<![a-z])(aciklik|opening|pencere|window|kapi|door|bosluk)/],
  ["facade", /(?<![a-z])(cephe|facade|kaplama|dis kabuk|giydirme)/],
  ["beam", /(?<![a-z])(kiris|beam|lento|hatil)/],
  ["slab", /(?<![a-z])(doseme|slab|plak|kat dosemesi)/],
  ["column", /(?<![a-z])(kolon|column|sutun|pillar|ayak|tasiyici aks|aks(?![a-z]))/],
  ["wall", /(?<![a-z])(duvar|wall|perde)/],
];

export function blueprintKindOf(raw: unknown, label?: string): BlueprintKind | undefined {
  for (const text of [raw, label]) {
    if (typeof text !== "string" || !text.trim()) continue;
    const folded = foldTr(text);
    if ((BLUEPRINT_KINDS as readonly string[]).includes(folded.trim())) return folded.trim() as BlueprintKind;
    for (const [kind, pattern] of BLUEPRINT_KIND_WORDS) if (pattern.test(folded)) return kind;
  }
  return undefined;
}

export const BLUEPRINT_MATERIALS = ["concrete", "masonry", "insulation", "wood", "steel", "glass", "plaster", "stone", "soil", "air", "membrane"] as const;
export type BlueprintMaterial = (typeof BLUEPRINT_MATERIALS)[number];
const MATERIAL_WORDS: [BlueprintMaterial, RegExp][] = [
  ["insulation", /(yalitim|izolasyon|isi yalit|eps|xps|tasyunu|camyunu|strafor|insulation)/],
  ["membrane", /(membran|su yalit|bitum|membrane)/],
  ["concrete", /(beton|concrete|sap(?![a-z])|samot)/],
  ["masonry", /(tugla|briket|gazbeton|kagir|masonry|brick|blok)/],
  ["wood", /(ahsap|kereste|wood|timber|parke)/],
  ["steel", /(celik|metal|steel|aluminyum|demir)/],
  ["glass", /(cam(?![a-z]*yunu)|glass|vitray)/],
  ["plaster", /(siva|alci|plaster|boya)/],
  ["stone", /(tas(?![a-z]*yunu)|mermer|granit|stone|kesme tas)/],
  ["soil", /(toprak|zemin|soil|dolgu)/],
  ["air", /(hava bosl|hava katman|air gap|bosluk)/],
];

export function blueprintMaterialOf(...texts: (string | undefined)[]): BlueprintMaterial | undefined {
  for (const text of texts) {
    if (!text) continue;
    const folded = foldTr(text);
    for (const [material, pattern] of MATERIAL_WORDS) if (pattern.test(folded)) return material;
  }
  return undefined;
}

const blueprintElementSchema = z
  .object({
    id: idField.optional().catch(undefined),
    label: clampText(36),
    role: clampText(80),
    kind: z.string().optional().catch(undefined),
    /** Aynı elemandan kaç tane (kolon aks sayısı, kat sayısı, açıklık sayısı); 1-6. */
    count: z.coerce.number().int().min(1).max(6).optional().catch(undefined),
    /** Biçim: çatıda gable | flat | shed, açıklıkta window | door, kemerde round | pointed. */
    variant: z.enum(["gable", "flat", "shed", "window", "door", "round", "pointed"]).optional().catch(undefined),
    /** Kesitte kesilen eleman (taranır); verilmezse türünden. */
    cut: z.boolean().optional().catch(undefined),
  })
  .transform(({ kind, ...rest }) => {
    const resolved = blueprintKindOf(kind, rest.label);
    return { ...rest, ...(resolved ? { kind: resolved } : {}) };
  });
export type BlueprintElement = z.output<typeof blueprintElementSchema>;

const blueprintLayerSchema = z
  .object({
    name: clampText(32),
    /** Kalınlık metni (kaynaktaki gibi, ör. birimli sayı); bantlar bu sayılarla orantılı. */
    thickness: optionalText(16),
    material: optionalText(28),
    order: z.coerce.number().int().optional().catch(undefined),
  })
  .transform((layer) => {
    const material = blueprintMaterialOf(layer.material, layer.name);
    return { ...layer, ...(material ? { materialKind: material } : {}) };
  });
export type BlueprintLayer = z.output<typeof blueprintLayerSchema>;

const calloutPinSchema = z.object({
  n: z.coerce.number().int().min(1).max(9).optional().catch(undefined),
  /** Hedef öğe: eleman kimliği, etiketi, türü ya da katman adı. */
  target: idField.optional().catch(undefined),
  /** Hedef yoksa çizim alanında göreli konum (0-1). */
  x: z.coerce.number().min(0).max(1).optional().catch(undefined),
  y: z.coerce.number().min(0).max(1).optional().catch(undefined),
  label: optionalText(36),
  note: optionalText(80),
});
export type CalloutPin = z.output<typeof calloutPinSchema>;

export const blueprintSchema = z.object({
  archetype: z.literal("ARCHITECTURE_SPATIAL_BLUEPRINT"),
  title: clampText(90, 2),
  pedagogicalLevel: pedagogicalLevelField,
  /** Eski kayıtların görünüş alanı; `viewType` yoksa bu geçerli. */
  view: z.enum(["section", "elevation"]).catch("section"),
  viewType: z.enum(BLUEPRINT_VIEWS).optional().catch(undefined),
  theme: z.enum(["night", "paper"]).catch("night"),
  /** Yapı elemanları (2-6): tür, sayı ve biçimden çizim kurulur; pin verilmezse her eleman kendi pinini alır. */
  elements: looseArray(blueprintElementSchema, 2, 6),
  /** Katman dizilimi (duvar/döşeme/çatı kesiti): ad, kalınlık, malzeme, sıra. */
  layers: looseArray(blueprintLayerSchema, 0, 6)
    .catch([])
    .transform((layers) =>
      layers
        .map((layer, index) => ({ layer, index }))
        .sort((a, b) => (a.layer.order ?? a.index) - (b.layer.order ?? b.index) || a.index - b.index)
        .map(({ layer }) => layer),
    ),
  /** Numaralı açıklama pinleri: hedef öğenin üstüne oturur. */
  calloutPins: looseArray(calloutPinSchema, 0, 6).catch([]),
  dimension: z.object({ label: clampText(24) }).optional().catch(undefined),
  flow: z.enum(["light", "load", "both"]).catch("load"),
});
export type BlueprintData = z.infer<typeof blueprintSchema>;

/** Sahnenin görünüş türü: yeni `viewType`, yoksa eski `view`. */
export function blueprintView(data: Pick<BlueprintData, "view" | "viewType">): BlueprintView {
  return data.viewType ?? data.view;
}

/* ───────── 4) Hukuk / sosyal karar akışı ───────── */

/** "3/5" → {num:3, den:5}; bozuksa null. */
export function parseFraction(text: string): { num: number; den: number } | null {
  const match = /^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/.exec(text);
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  return den > 0 && num > 0 && num <= den ? { num, den } : null;
}

const lawNodeSchema = z.object({
  id: idField,
  /** Soru düğümünde koşul, yaprakta sonuç. */
  text: clampText(80, 2),
  /** Evet / Hayır dalı: başka düğümün kimliği ya da doğrudan sonuç metni. */
  yes: idField.optional().catch(undefined),
  no: idField.optional().catch(undefined),
  /** İkiden çok dal (ya da adlı dallar): etiket + hedef. */
  branches: looseArray(z.object({ label: clampText(24), to: idField }), 0, 3).catch([]),
  tone: z.enum(["positive", "negative", "neutral"]).optional().catch(undefined),
});
export type LawNode = z.output<typeof lawNodeSchema>;

export const lawDecisionSchema = z.object({
  archetype: z.literal("LAW_SOCIAL_FLOWCHART"),
  title: clampText(90, 2),
  pedagogicalLevel: pedagogicalLevelField,
  /** Tek kademeli eski karar (kayıttaki sahneler); `nodes` varsa ağaç ondan kurulur. */
  decision: z
    .object({
      question: clampText(80, 3),
      yes: clampText(60),
      no: clampText(60),
    })
    .optional()
    .catch(undefined),
  /** Çok kademeli karar ağacı (derinlik en çok 3): ilk düğüm köktür. */
  nodes: looseArray(lawNodeSchema, 0, 10).catch([]),
  /** Çoğunluk barometresi (ör. 3/5 = 360, 2/3 = 400): eşik kesri, eşiğin sayısı, toplam ve gerçekleşen. */
  majority: looseArray(
    z
      .object({
        label: clampText(36),
        fraction: clampText(7),
        count: z.coerce.number().int().positive().optional().catch(undefined),
        total: z.coerce.number().int().positive().optional().catch(undefined),
        /** Gerçekleşen sayı (oy, imza …): eşiği geçip geçmediği renkle gösterilir. */
        actual: z.coerce.number().int().nonnegative().optional().catch(undefined),
      })
      .refine((row) => parseFraction(row.fraction) !== null),
    0,
    3,
  ).catch([]),
  timeline: looseArray(z.object({ date: clampText(16), label: clampText(40) }), 0, 5).catch([]),
  /** İsteğe bağlı: kaynak bir istisna söylemiyorsa yazılmaz (istisna listesi boş kalabilir). */
  ruleVsException: z
    .object({
      rule: looseArray(clampText(70), 1, 3),
      exception: looseArray(clampText(70), 0, 3).catch([]),
    })
    .optional()
    .catch(undefined),
});
export type LawDecisionData = z.infer<typeof lawDecisionSchema>;

/** Ağaç düğümü: soru (çocuklu) ya da sonuç (yaprak). */
export type LawTreeNode = {
  key: string;
  text: string;
  depth: number;
  tone: "positive" | "negative" | "neutral";
  children: { label: string; tone: "positive" | "negative" | "neutral"; node: LawTreeNode }[];
};

/** Karar ağacının en çok kaç soru kademesi çizilir (daha derindeki soru sonuç olarak kalır). */
export const LAW_TREE_MAX_DEPTH = 3;

/**
 * Düğüm listesinden ağaç: kök ilk düğüm; `yes`/`no`/`branches` hedefi bir düğümün kimliğiyse ona bağlanır, değilse
 * doğrudan sonuç metnidir. Döngü ve derinlik sınırı kesilir. Düğüm yoksa eski `decision`'dan tek kademeli ağaç.
 */
export function lawTreeOf(data: Pick<LawDecisionData, "nodes" | "decision">): LawTreeNode | null {
  if (data.nodes.length) {
    const byId = new Map(data.nodes.map((node) => [foldTr(node.id), node]));
    let serial = 0;
    const leaf = (text: string, depth: number, tone: LawTreeNode["tone"]): LawTreeNode => ({ key: `leaf${serial++}`, text: cutAtWord(text, 80), depth, tone, children: [] });
    const build = (node: LawNode, depth: number, seen: Set<string>, tone: LawTreeNode["tone"]): LawTreeNode => {
      const own = node.tone ?? tone;
      const edges: { label: string; tone: LawTreeNode["tone"]; to: string }[] = [
        ...(node.yes ? [{ label: "EVET", tone: "positive" as const, to: node.yes }] : []),
        ...(node.no ? [{ label: "HAYIR", tone: "negative" as const, to: node.no }] : []),
        ...node.branches.map((branch) => ({ label: branch.label.toLocaleUpperCase("tr"), tone: "neutral" as const, to: branch.to })),
      ].slice(0, 3);
      if (!edges.length || depth >= LAW_TREE_MAX_DEPTH) return { key: node.id, text: node.text, depth, tone: own, children: [] };
      const next = new Set(seen).add(foldTr(node.id));
      return {
        key: node.id,
        text: node.text,
        depth,
        tone: "neutral",
        children: edges.map((edge) => {
          const target = byId.get(foldTr(edge.to));
          const child = target && !next.has(foldTr(target.id)) ? build(target, depth + 1, next, edge.tone) : leaf(edge.to, depth + 1, edge.tone);
          return { label: edge.label, tone: edge.tone, node: child };
        }),
      };
    };
    const root = build(data.nodes[0]!, 0, new Set(), "neutral");
    if (root.children.length) return root;
  }
  if (!data.decision) return null;
  return {
    key: "root",
    text: data.decision.question,
    depth: 0,
    tone: "neutral",
    children: [
      { label: "EVET", tone: "positive", node: { key: "yes", text: data.decision.yes, depth: 1, tone: "positive", children: [] } },
      { label: "HAYIR", tone: "negative", node: { key: "no", text: data.decision.no, depth: 1, tone: "negative", children: [] } },
    ],
  };
}

/** Ağacın bütün düğümleri (önce derinlik). */
export function lawTreeNodes(root: LawTreeNode | null): LawTreeNode[] {
  if (!root) return [];
  return [root, ...root.children.flatMap((child) => lawTreeNodes(child.node))];
}

/** Ağaçtaki soru kademesi sayısı (tek kararda 1). */
export function lawTreeDepth(root: LawTreeNode | null): number {
  if (!root || !root.children.length) return 0;
  return 1 + Math.max(...root.children.map((child) => lawTreeDepth(child.node)));
}

/* ───────── 7) Kavram yapısı (ekonomi, tarih, psikoloji, coğrafya, edebiyat, felsefe, dil, genel) ───────── */

const conceptItemSchema = z.object({
  id: idField.optional().catch(undefined),
  label: clampText(44),
  detail: optionalText(90),
  /** Zaman çizelgesinde tarih / dönem. */
  date: optionalText(18),
});
export type ConceptItem = z.output<typeof conceptItemSchema>;

export const conceptStructureSchema = z
  .object({
    archetype: z.literal("CONCEPT_STRUCTURE_VISUALIZER"),
    title: clampText(90, 2),
    pedagogicalLevel: pedagogicalLevelField,
    /** Yapı: süreç, matris, piramit, zaman çizelgesi, neden-sonuç, arz-talep. Yoksa veriden çıkarılır. */
    structure: z.enum(CONCEPT_STRUCTURES).optional().catch(undefined),
    /** Süreç adımları, piramit katmanları (tepeden tabana), zaman durakları ya da neden-sonuç düğümleri. */
    items: looseArray(conceptItemSchema, 0, 7).catch([]),
    /** Neden-sonuç bağları: kimlik, etiket ya da 1'den sıra numarası; etkisi artırır / azaltır. */
    links: looseArray(
      z.object({ from: idField, to: idField, label: optionalText(24), effect: z.enum(["increase", "decrease"]).optional().catch(undefined) }),
      0,
      10,
    ).catch([]),
    /** Karşılaştırma matrisi: sütun başlıkları ve satırlar. */
    columns: looseArray(clampText(24), 0, 4).catch([]),
    comparisonRows: looseArray(
      z.object({ label: clampText(28), values: looseArray(clampText(64), 1, 4), highlight: z.coerce.number().int().min(0).max(3).optional().catch(undefined) }),
      0,
      6,
    ).catch([]),
    /** Arz-talep grafiği: eksen ve eğri adları, denge, kayma. */
    market: z
      .object({
        priceLabel: optionalText(20),
        quantityLabel: optionalText(20),
        supplyLabel: optionalText(20),
        demandLabel: optionalText(20),
        equilibrium: optionalText(32),
        shift: z
          .object({ curve: z.enum(["supply", "demand"]).catch("demand"), direction: z.enum(["right", "left"]).catch("right"), label: optionalText(40) })
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    /** Sınavda sorulan tek cümle. */
    takeaway: optionalText(120),
  })
  .transform((data) => ({ ...data, structure: data.structure ?? inferConceptStructure(data) }));
export type ConceptStructureData = z.output<typeof conceptStructureSchema>;

/** Yapı yazılmadıysa veriden: matris satırı → matrix, piyasa → arz-talep, tarihli öğe → zaman, bağ → neden-sonuç. */
export function inferConceptStructure(data: {
  comparisonRows: unknown[];
  market?: unknown;
  items: { date?: string }[];
  links: unknown[];
}): ConceptStructure {
  if (data.comparisonRows.length >= 2) return "matrix";
  if (data.market) return "supply_demand";
  if (data.items.length >= 2 && data.items.filter((item) => item.date).length >= Math.ceil(data.items.length / 2)) return "timeline";
  if (data.links.length) return "cause_effect";
  return "process";
}

/** Bu yapının zorunlu iskeleti yoksa sorun metni (sahne düşer); varsa null. */
export function conceptSkeletonProblem(data: Pick<ConceptStructureData, "structure" | "items" | "comparisonRows">): string | null {
  if (data.structure === "matrix") return data.comparisonRows.length >= 2 ? null : "Matris en az iki satır ister.";
  if (data.structure === "supply_demand") return null;
  return data.items.length >= 2 ? null : "Yapı en az iki öğe ister.";
}

/* ───────── 5) Matematik / algoritma grafiği ───────── */

export const CURVE_FAMILIES = ["linear", "quadratic", "cubic", "exponential", "logarithmic", "sine", "absolute"] as const;
export type CurveFamily = (typeof CURVE_FAMILIES)[number];
export const CURVE_POINTS = ["root", "vertex", "y_intercept", "max", "min", "inflection"] as const;
export type CurvePointKind = (typeof CURVE_POINTS)[number];
export const SHAPE_KINDS = ["triangle", "right_triangle", "rectangle", "parallelogram", "circle"] as const;

export const mathGraphSchema = z.object({
  archetype: z.literal("MATH_ALGORITHMIC_GRAPH"),
  title: clampText(90, 2),
  pedagogicalLevel: pedagogicalLevelField,
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
  integral: z.object({ from: symbolText(8), to: symbolText(8), label: clampText(40) }).optional().catch(undefined),
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
  pedagogicalLevel: pedagogicalLevelField,
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

const visualSceneUnion = z.discriminatedUnion("archetype", [
  medicalPathwaySchema,
  mechanicsSchema,
  blueprintSchema,
  lawDecisionSchema,
  mathGraphSchema,
  documentSpotlightSchema,
  conceptStructureSchema,
]);

/** Arketipin zorunlu iskeleti (alan alan doğrulamanın ötesinde): karar ağacı ya da kavram yapısının öğeleri. */
function sceneSkeletonProblem(scene: z.output<typeof visualSceneUnion>): string | null {
  if (scene.archetype === "LAW_SOCIAL_FLOWCHART") return lawTreeOf(scene) ? null : "Karar ağacı yok.";
  if (scene.archetype === "CONCEPT_STRUCTURE_VISUALIZER") return conceptSkeletonProblem(scene);
  return null;
}

/** Ayrıştırılan her sahne anlam onarımından geçer (yeni üretim ve kayıttaki eski veri aynı kuralla). */
export const visualSceneSchema = visualSceneUnion
  .superRefine((scene, ctx) => {
    const problem = sceneSkeletonProblem(scene);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((scene) => (scene.archetype === "ENGINEERING_PHYSICS_MECHANICS" ? repairMechanics(scene) : scene));
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
  concept: "CONCEPT_STRUCTURE_VISUALIZER",
  structure: "CONCEPT_STRUCTURE_VISUALIZER",
  kavram: "CONCEPT_STRUCTURE_VISUALIZER",
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
  keys: looseArray(z.object({ letter: symbolText(3), meaning: clampText(28) }), 0, 5).catch([]),
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

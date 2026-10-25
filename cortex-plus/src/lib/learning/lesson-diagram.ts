import { z } from "zod";

/**
 * Ders şeması — modelin çizdiği, bizim bastığımız.
 *
 * Şekille anlaşılan konuları (faz diyagramı, Mohr dairesi, birim çember)
 * kelimeyle anlatıyorduk; Referans ürünün dersinde bölümün içinde diyagram var.
 *
 * Model ham SVG üretseydi o metni DOM'a basmak zorunda kalırdık ve ders
 * içeriği bir işaretleme kanalına dönerdi: <script>, olay öznitelikleri,
 * dış kaynak referansı. Onun yerine model çizimin TARİFİNİ yazıyor —
 * sayılar ve etiketler — SVG'yi biz kuruyoruz. Modelden gelen hiçbir şey
 * işaretleme olarak yorumlanmıyor.
 *
 * Renkler serbest değil: tema jetonlarına bağlı bir isim kümesi. Böylece
 * çizim açık ve koyu temada birlikte çalışıyor ve modelin seçtiği bir
 * renk zemine karışmıyor.
 */

export const DIAGRAM_TONES = ["ink", "muted", "accent", "surface", "line"] as const;
export type DiagramTone = (typeof DIAGRAM_TONES)[number];

const tone = z.enum(DIAGRAM_TONES);

/** Çizim alanı sabit: model ölçek uydurmasın, her şema aynı kutuda dursun. */
export const DIAGRAM_WIDTH = 320;
export const DIAGRAM_HEIGHT = 200;

const x = z.number().min(0).max(DIAGRAM_WIDTH);
const y = z.number().min(0).max(DIAGRAM_HEIGHT);

const shapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rect"),
    x,
    y,
    w: z.number().min(1).max(DIAGRAM_WIDTH),
    h: z.number().min(1).max(DIAGRAM_HEIGHT),
    fill: tone.optional(),
    stroke: tone.optional(),
  }),
  z.object({
    kind: z.literal("circle"),
    cx: x,
    cy: y,
    r: z.number().min(1).max(DIAGRAM_HEIGHT),
    fill: tone.optional(),
    stroke: tone.optional(),
  }),
  z.object({
    kind: z.literal("line"),
    x1: x,
    y1: y,
    x2: x,
    y2: y,
    stroke: tone.optional(),
    /** Ucunda ok olsun mu — eksen ve yön göstermek için. */
    arrow: z.boolean().optional(),
    dashed: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("text"),
    x,
    y,
    text: z.string().min(1).max(40),
    tone: tone.optional(),
    anchor: z.enum(["start", "middle", "end"]).optional(),
    size: z.enum(["sm", "md"]).optional(),
  }),
]);

export type DiagramShape = z.infer<typeof shapeSchema>;

const diagramCaption = z.string().min(8).max(160);

const diagramNodeSchema = z.object({
  id: z.string().min(1).max(24),
  label: z.string().min(1).max(40),
});

const diagramEdgeSchema = z.object({
  from: z.string().min(1).max(24),
  to: z.string().min(1).max(24),
  label: z.string().max(30).optional(),
});

/** Eski serbest çizim. `layout` yoksa da bu şema. */
const diagramFreeSchema = z.object({
  layout: z.literal("free").optional(),
  caption: diagramCaption,
  shapes: z.array(shapeSchema).min(2).max(24),
});

const diagramFlowSchema = z.object({
  layout: z.literal("flow"),
  caption: diagramCaption,
  nodes: z.array(diagramNodeSchema).min(2).max(8),
  edges: z.array(diagramEdgeSchema).max(12).optional(),
});

const diagramCycleSchema = z.object({
  layout: z.literal("cycle"),
  caption: diagramCaption,
  nodes: z.array(diagramNodeSchema).min(2).max(8),
});

const diagramMatrixSchema = z.object({
  layout: z.literal("matrix"),
  caption: diagramCaption,
  columns: z.array(z.string().min(1).max(24)).min(2).max(6),
  rows: z.array(z.string().min(1).max(24)).min(1).max(8),
  cells: z.array(z.object({
    r: z.number().int().min(0).max(7),
    c: z.number().int().min(0).max(5),
    label: z.string().min(1).max(40),
  })).min(1).max(24),
});

export type DiagramTreeNode = { label: string; children?: DiagramTreeNode[] };

const diagramTreeNodeSchema: z.ZodType<DiagramTreeNode> = z.lazy(() =>
  z.object({
    label: z.string().min(1).max(40),
    children: z.array(diagramTreeNodeSchema).max(6).optional(),
  }),
);

const diagramTreeSchema = z.object({
  layout: z.literal("tree"),
  caption: diagramCaption,
  root: diagramTreeNodeSchema,
});

export const STRUCTURED_DIAGRAM_LAYOUTS = ["flow", "cycle", "matrix", "tree"] as const;
export type StructuredDiagramLayout = (typeof STRUCTURED_DIAGRAM_LAYOUTS)[number];

/**
 * Serbest çizim (`shapes`) ya da yapılandırılmış şema. Model koordinat yazmaz;
 * `flow` / `cycle` / `matrix` / `tree` yerleşimini kod çizer.
 */
export const lessonDiagramSchema = z.union([
  diagramFlowSchema,
  diagramCycleSchema,
  diagramMatrixSchema,
  diagramTreeSchema,
  diagramFreeSchema,
]);

export type LessonDiagram = z.infer<typeof lessonDiagramSchema>;

export function isStructuredDiagram(
  diagram: LessonDiagram,
): diagram is Extract<LessonDiagram, { layout: StructuredDiagramLayout }> {
  return diagram.layout === "flow" || diagram.layout === "cycle" || diagram.layout === "matrix" || diagram.layout === "tree";
}

/** Etiket yazı tipi boyu; çizen bileşenle aynı olmak zorunda. */
const LABEL_SIZE = { sm: 9, md: 11 } as const;
/** Ortalama karakter genişliği / punto. Ölçmüyoruz, sığdırıyoruz. */
const CHAR_RATIO = 0.55;

export type PlacedLabel = {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** Kutuya hiç sığmıyorsa yazının sıkıştırılacağı genişlik. */
  fitWidth?: number;
};

/**
 * Etiketi çizim alanının İÇİNDE tutar.
 *
 * Şema şekillerin koordinatını sınırlıyor ama yazının uzunluğunu değil:
 * x = 220'de başlayan 24 karakterlik bir etiket kutunun sağından taşıyor
 * ve ekranda ortadan kesiliyor. Canlıda çıkan buydu — "Drenajsız (c u,
 * φ u ≈ 0)" yarısından kesildi.
 *
 * Modelden daha iyi koordinat ummak yerine yerleştirmeyi biz yapıyoruz:
 * yazı taşacaksa içeri kaydırılır, kutudan geniş olan tek satır ise
 * kutuya sıkıştırılır. Kırpılmış yazı okunmuyor; sıkıştırılmış okunuyor.
 */
export function placeLabel(shape: {
  x: number;
  y: number;
  text: string;
  anchor?: "start" | "middle" | "end";
  size?: "sm" | "md";
}): PlacedLabel {
  const anchor = shape.anchor ?? "start";
  const fontSize = LABEL_SIZE[shape.size ?? "md"];
  const width = shape.text.length * fontSize * CHAR_RATIO;
  const pad = 2;
  const y = Math.min(DIAGRAM_HEIGHT - pad, Math.max(fontSize / 2, shape.y));

  if (width >= DIAGRAM_WIDTH - pad * 2) {
    // Hiçbir yere sığmıyor: ortala ve kutu genişliğine sıkıştır.
    return {
      x: DIAGRAM_WIDTH / 2,
      y,
      anchor: "middle",
      fitWidth: DIAGRAM_WIDTH - pad * 2,
    };
  }

  let x = shape.x;
  if (anchor === "start") {
    x = Math.min(x, DIAGRAM_WIDTH - pad - width);
    x = Math.max(pad, x);
  } else if (anchor === "end") {
    x = Math.max(x, pad + width);
    x = Math.min(DIAGRAM_WIDTH - pad, x);
  } else {
    x = Math.min(x, DIAGRAM_WIDTH - pad - width / 2);
    x = Math.max(pad + width / 2, x);
  }
  return { x, y, anchor };
}

/**
 * Çizimin gerçekten kullandığı alan.
 *
 * Alan 320x200 sabit ama model çoğu zaman üst şeride çiziyor: canlıdaki
 * ilk çizimde iki kutu üstte duruyor, kutunun alt yarısı bomboş kalıyor
 * ve şekil ekranda kaybolmuş gibi görünüyordu. Boşluğu modelden düzgün
 * koordinat isteyerek değil, çerçeveyi çizilene daraltarak kapatıyoruz.
 *
 * Taban ölçü korunuyor: üç çizgiden ibaret bir şema sayfayı kaplamasın.
 */
export function diagramViewBox(shapes: DiagramShape[]): string {
  let minX = DIAGRAM_WIDTH;
  let minY = DIAGRAM_HEIGHT;
  let maxX = 0;
  let maxY = 0;
  const grow = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };

  for (const shape of shapes) {
    if (shape.kind === "rect") {
      grow(shape.x, shape.y, shape.x + shape.w, shape.y + shape.h);
    } else if (shape.kind === "circle") {
      grow(
        shape.cx - shape.r,
        shape.cy - shape.r,
        shape.cx + shape.r,
        shape.cy + shape.r,
      );
    } else if (shape.kind === "line") {
      grow(
        Math.min(shape.x1, shape.x2),
        Math.min(shape.y1, shape.y2),
        Math.max(shape.x1, shape.x2),
        Math.max(shape.y1, shape.y2),
      );
    } else {
      const placed = placeLabel(shape);
      const fontSize = LABEL_SIZE[shape.size ?? "md"];
      const width = placed.fitWidth ?? shape.text.length * fontSize * CHAR_RATIO;
      const left =
        placed.anchor === "start"
          ? placed.x
          : placed.anchor === "end"
            ? placed.x - width
            : placed.x - width / 2;
      grow(left, placed.y - fontSize, left + width, placed.y + fontSize);
    }
  }

  if (maxX <= minX || maxY <= minY) return `0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`;

  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(DIAGRAM_WIDTH, maxX + pad);
  maxY = Math.min(DIAGRAM_HEIGHT, maxY + pad);

  // Geniş ve alçak bir çizim geniş ve alçak görünsün — yan yana iki
  // kutuya kare bir çerçeve vermek, kapatmaya çalıştığımız boşluğu geri
  // getiriyor. Yalnızca DAR ve UZUN olan sınırlanıyor: o, sütun gibi
  // uzayıp sayfayı bölüyor.
  let width = maxX - minX;
  const height = maxY - minY;
  if (height / width > 1.5) {
    const wanted = height / 1.5;
    const extra = (wanted - width) / 2;
    minX = Math.max(0, minX - extra);
    width = Math.min(DIAGRAM_WIDTH - minX, wanted);
  }

  return `${round(minX)} ${round(minY)} ${round(width)} ${round(height)}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Çizimin okunabilir olup olmadığı.
 *
 * Şema sınırları şekilleri kutunun içinde tutuyor ama tek başına yeterli
 * değil: etiketsiz bir çizim öğrenciye neyin ne olduğunu söylemiyor, ve
 * her şeklin üst üste bindiği bir çizim de bir şey anlatmıyor.
 */
function treeStats(node: DiagramTreeNode, depth = 1): { count: number; depth: number } {
  const kids = node.children ?? [];
  const nested = kids.map((child) => treeStats(child, depth + 1));
  return {
    count: 1 + nested.reduce((sum, row) => sum + row.count, 0),
    depth: nested.reduce((max, row) => Math.max(max, row.depth), depth),
  };
}

export function diagramIssues(diagram: LessonDiagram): string[] {
  if (isStructuredDiagram(diagram)) return structuredDiagramIssues(diagram);
  if (!("shapes" in diagram)) return ["Çizim tarif edilemedi."];
  const issues: string[] = [];
  const labels = diagram.shapes.filter((s) => s.kind === "text");
  /**
   * İKİ ETİKET, İKİ ŞEKİL — tek etiket bir çizim değil, bir rozet.
   *
   * Taban bir etikete ayarlıyken canlıda çıkan iki çizim şunlardı: içinde
   * "Kili temsil eder" yazan bir kutu, ve içinden bir çizgi geçen, yanında
   * "Daire" yazan bir çember. İkisi de kuralı geçti, ikisi de öğrenciye
   * hiçbir şey öğretmedi. Bir şeklin anlamı parçalarının adlandırılmasıyla
   * doğuyor: eksenin adı, bölgenin adı, ölçünün adı. Tek etiket, çizimin
   * kendi başlığını tekrarlamaktan öteye geçmiyor.
   *
   * Taban bilinçli olarak düşük: iki etiket ve iki şekil, bir eksen ile
   * adlandırılmış iki bölge demek. Daha yükseği modeli her konuyu kutularla
   * anlatmaya zorlardı.
   */
  if (labels.length < 2) {
    issues.push("Çizimde en az iki etiket olmalı; parçaların adı yazılmalı.");
  }
  const drawn = diagram.shapes.length - labels.length;
  if (drawn < 2) {
    issues.push("Çizimde en az iki şekil olmalı; tek kutu diyagram değil.");
  }
  // Etiketi başlığın kopyası olan çizim kendini tekrar ediyor demektir.
  const caption = diagram.caption.trim().toLocaleLowerCase("tr");
  if (labels.every((s) => caption.includes(s.text.trim().toLocaleLowerCase("tr")))) {
    issues.push("Etiketler başlığı tekrarlıyor; parçaların kendi adı yok.");
  }
  // Sıfır alanlı dikdörtgen ve sıfır uzunluklu çizgi ekranda kaybolur.
  for (const shape of diagram.shapes) {
    if (shape.kind === "line" && shape.x1 === shape.x2 && shape.y1 === shape.y2) {
      issues.push("Sıfır uzunlukta çizgi var.");
    }
  }
  return issues;
}

function structuredDiagramIssues(diagram: Extract<LessonDiagram, { layout: StructuredDiagramLayout }>): string[] {
  const issues: string[] = [];
  if (diagram.layout === "matrix") {
    const { columns, rows, cells } = diagram;
    if (cells.some((cell) => cell.r >= rows.length || cell.c >= columns.length)) {
      issues.push("Matris hücresi satır ya da sütun başlığının dışında.");
    }
    return issues;
  }
  if (diagram.layout === "tree") {
    const stats = treeStats(diagram.root);
    if (!(diagram.root.children ?? []).length) issues.push("Ağaç şemasında kökten inen en az bir dal olmalı.");
    if (stats.depth > 4) issues.push("Ağaç şeması en çok 4 düzey iner.");
    if (stats.count > 12) issues.push("Ağaç şeması en çok 12 düğüm taşır.");
    return issues;
  }
  const ids = new Set(diagram.nodes.map((node) => node.id));
  if (ids.size !== diagram.nodes.length) issues.push("Akış düğümlerinin kimliği birbirinden farklı olmalı.");
  if (diagram.layout === "flow" && diagram.edges?.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) {
    issues.push("Akış oku tanımsız bir düğümü gösteriyor.");
  }
  return issues;
}

export type DiagramPlacement = {
  x: number;
  y: number;
  label: string;
  id?: string;
};

export type DiagramLayout = {
  width: number;
  height: number;
  nodes: DiagramPlacement[];
  edges: { x1: number; y1: number; x2: number; y2: number; label?: string }[];
  cells?: { x: number; y: number; w: number; h: number; label: string; tone: number }[];
  headers?: { x: number; y: number; label: string }[];
};

/** Yapılandırılmış şemanın koordinatları. Model x/y yazmaz. */
export function layoutStructuredDiagram(diagram: Extract<LessonDiagram, { layout: StructuredDiagramLayout }>): DiagramLayout {
  if (diagram.layout === "matrix") return layoutMatrix(diagram);
  if (diagram.layout === "tree") return layoutTree(diagram.root);
  return layoutFlow(diagram.nodes, diagram.layout === "cycle", diagram.layout === "flow" ? diagram.edges : undefined);
}

function layoutFlow(
  nodes: { id: string; label: string }[],
  cycle: boolean,
  edges?: { from: string; to: string; label?: string }[],
): DiagramLayout {
  const width = DIAGRAM_WIDTH;
  const height = DIAGRAM_HEIGHT;
  const placed = nodes.map((node, index) => {
    if (!cycle) {
      const gap = width / nodes.length;
      return { id: node.id, label: node.label, x: gap * index + gap / 2, y: height / 2 };
    }
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / nodes.length;
    return {
      id: node.id,
      label: node.label,
      x: width / 2 + Math.cos(angle) * 110,
      y: height / 2 + Math.sin(angle) * 68,
    };
  });
  const byId = new Map(placed.map((node) => [node.id, node]));
  const links = edges?.length
    ? edges
    : nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1]!.id }));
  const drawn = cycle && !edges?.length
    ? [...links, { from: nodes[nodes.length - 1]!.id, to: nodes[0]!.id }]
    : links;
  return {
    width,
    height,
    nodes: placed,
    edges: drawn.flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return [];
      const label = "label" in edge && typeof edge.label === "string" ? edge.label : undefined;
      return [{ x1: from.x, y1: from.y, x2: to.x, y2: to.y, label }];
    }),
  };
}

function layoutMatrix(diagram: Extract<LessonDiagram, { layout: "matrix" }>): DiagramLayout {
  const labelW = 72;
  const headH = 28;
  const cellW = (DIAGRAM_WIDTH - labelW) / diagram.columns.length;
  const cellH = (DIAGRAM_HEIGHT - headH) / diagram.rows.length;
  const headers = [
    ...diagram.columns.map((label, index) => ({ x: labelW + cellW * index + cellW / 2, y: 16, label })),
    ...diagram.rows.map((label, index) => ({ x: 8, y: headH + cellH * index + cellH / 2, label })),
  ];
  return {
    width: DIAGRAM_WIDTH,
    height: DIAGRAM_HEIGHT,
    nodes: [],
    edges: [],
    headers,
    cells: diagram.cells.map((cell) => ({
      x: labelW + cellW * cell.c,
      y: headH + cellH * cell.r,
      w: cellW - 4,
      h: cellH - 4,
      label: cell.label,
      tone: (cell.r + cell.c) % 3,
    })),
  };
}

function layoutTree(root: DiagramTreeNode): DiagramLayout {
  const levels: DiagramTreeNode[][] = [];
  const queue: { node: DiagramTreeNode; depth: number }[] = [{ node: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    (levels[current.depth] ??= []).push(current.node);
    for (const child of current.node.children ?? []) queue.push({ node: child, depth: current.depth + 1 });
  }
  const height = DIAGRAM_HEIGHT;
  const nodes: DiagramPlacement[] = [];
  const edges: DiagramLayout["edges"] = [];
  const positions = new Map<DiagramTreeNode, DiagramPlacement>();
  levels.forEach((level, depth) => {
    level.forEach((node, index) => {
      const placed = {
        label: node.label,
        x: (DIAGRAM_WIDTH * (index + 1)) / (level.length + 1),
        y: 24 + (depth * (height - 36)) / Math.max(1, levels.length - 1 || 1),
      };
      positions.set(node, placed);
      nodes.push(placed);
    });
  });
  const walk = (node: DiagramTreeNode) => {
    const from = positions.get(node);
    for (const child of node.children ?? []) {
      const to = positions.get(child);
      if (from && to) edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      walk(child);
    }
  };
  walk(root);
  return { width: DIAGRAM_WIDTH, height, nodes, edges };
}

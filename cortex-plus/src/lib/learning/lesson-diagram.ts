import { z } from "zod";

/**
 * Ders şeması — modelin çizdiği, bizim bastığımız.
 *
 * Şekille anlaşılan konuları (faz diyagramı, Mohr dairesi, birim çember)
 * kelimeyle anlatıyorduk; Astra'nın dersinde bölümün içinde diyagram var.
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

export const lessonDiagramSchema = z.object({
  /** Ekran okuyucunun okuduğu açıklama; şekil süs değil, içerik. */
  caption: z.string().min(8).max(160),
  shapes: z.array(shapeSchema).min(2).max(24),
});

export type LessonDiagram = z.infer<typeof lessonDiagramSchema>;

/**
 * Çizimin okunabilir olup olmadığı.
 *
 * Şema sınırları şekilleri kutunun içinde tutuyor ama tek başına yeterli
 * değil: etiketsiz bir çizim öğrenciye neyin ne olduğunu söylemiyor, ve
 * her şeklin üst üste bindiği bir çizim de bir şey anlatmıyor.
 */
export function diagramIssues(diagram: LessonDiagram): string[] {
  const issues: string[] = [];
  const labels = diagram.shapes.filter((s) => s.kind === "text");
  if (labels.length < 1) {
    issues.push("Çizimde etiket yok; hangi parçanın ne olduğu yazılmalı.");
  }
  const drawn = diagram.shapes.length - labels.length;
  if (drawn < 1) {
    issues.push("Çizimde şekil yok; yalnızca yazıdan diyagram olmaz.");
  }
  // Sıfır alanlı dikdörtgen ve sıfır uzunluklu çizgi ekranda kaybolur.
  for (const shape of diagram.shapes) {
    if (shape.kind === "line" && shape.x1 === shape.x2 && shape.y1 === shape.y2) {
      issues.push("Sıfır uzunlukta çizgi var.");
    }
  }
  return issues;
}

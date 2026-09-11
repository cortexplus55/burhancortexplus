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
 * Şekille anlaşılan konular.
 *
 * Çizim yolu yazıldıktan sonra canlıda bir kez bile çalışmadı: "isteğe
 * bağlı" diyen bir talimatı model hep atlıyor. Konunun adı ya da
 * kaynaktan gelen bölüm başlıkları buradaki kelimelerden birini taşıyorsa
 * çizim isteğe bağlı olmaktan çıkıyor.
 *
 * Liste KONU adı değil, ŞEKİL kelimesi taşır. İlk hâlinde "mohr",
 * "birim çember", "akış ağı" gibi konular yazılıydı — yani ürün yalnızca
 * mühendislik ve matematik belgelerinde çizim üretirdi; kimya öğrencisinin
 * "Lewis Yapısı" ya da biyolojinin "Krebs Döngüsü" hiç tetiklemezdi.
 * Buradaki kelimeler hangi derste geçerse geçsin aynı şeyi söylüyor:
 * bu başlığın arkasında bir resim var.
 *
 * Liste yine de dar: her konuya çizim istemek çizimi değersizleştirir ve
 * modeli kelimeyle anlaşılan bir şeyi kutularla anlatmaya zorlar.
 */
const DIAGRAM_WORDS = [
  "diyagram",
  "sema",
  "cember",
  "daire",
  "eksen",
  "kesit",
  "harita",
  "dongu",
  "vektor",
  "zarf",
  "model",
  "serbest cisim",
];

function foldTr(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/** Bu ders çizim istiyor mu? Konu adı ve bölüm başlıklarına bakılır. */
export function needsDiagram(...texts: (string | null | undefined)[]): boolean {
  const blob = foldTr(texts.filter(Boolean).join(" | "));
  return DIAGRAM_WORDS.some((word) => blob.includes(word));
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

  // Çok dar bir çizim sayfayı kaplamasın: en boy oranı 2:1'i geçmesin.
  let width = maxX - minX;
  let height = maxY - minY;
  if (width / height > 2) {
    const wanted = width / 2;
    const extra = (wanted - height) / 2;
    minY = Math.max(0, minY - extra);
    height = Math.min(DIAGRAM_HEIGHT - minY, wanted);
  }
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
export function diagramIssues(diagram: LessonDiagram): string[] {
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

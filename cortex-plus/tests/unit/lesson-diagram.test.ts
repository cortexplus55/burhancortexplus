import { describe, expect, it } from "vitest";
import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  diagramIssues,
  lessonDiagramSchema,
  needsDiagram,
} from "@/lib/learning/lesson-diagram";

/** Üç fazlı zemin modeli — üst üste üç kutu, yanlarında sembolleri. */
const phaseDiagram = {
  caption: "Üç fazlı zemin modeli: katı, sıvı ve gaz fazlarının hacimleri.",
  shapes: [
    { kind: "rect" as const, x: 40, y: 30, w: 90, h: 40 },
    { kind: "rect" as const, x: 40, y: 70, w: 90, h: 40 },
    { kind: "rect" as const, x: 40, y: 110, w: 90, h: 50 },
    { kind: "text" as const, x: 140, y: 50, text: "Va — hava" },
    { kind: "text" as const, x: 140, y: 90, text: "Vw — su" },
    { kind: "text" as const, x: 140, y: 135, text: "Vs — katı" },
  ],
};

describe("lessonDiagramSchema", () => {
  it("accepts a labelled phase diagram", () => {
    const parsed = lessonDiagramSchema.safeParse(phaseDiagram);
    expect(parsed.success).toBe(true);
    expect(diagramIssues(phaseDiagram)).toEqual([]);
  });

  it("keeps shapes inside the drawing area", () => {
    // Kutunun dışına taşan şekil ekranda kırpılır.
    const outside = {
      ...phaseDiagram,
      shapes: [
        ...phaseDiagram.shapes,
        { kind: "circle" as const, cx: DIAGRAM_WIDTH + 50, cy: 10, r: 5 },
      ],
    };
    expect(lessonDiagramSchema.safeParse(outside).success).toBe(false);
  });

  it("refuses a colour the theme does not own", () => {
    // Model kendi rengini seçerse çizim koyu ya da açık temada kayboluyor.
    const custom = {
      ...phaseDiagram,
      shapes: [{ ...phaseDiagram.shapes[0], fill: "#ff0000" }],
    };
    expect(lessonDiagramSchema.safeParse(custom).success).toBe(false);
  });

  it("rejects a drawing with no labels", () => {
    const bare = {
      caption: "Etiketsiz üç kutu; hangisinin ne olduğu belli değil.",
      shapes: phaseDiagram.shapes.filter((s) => s.kind !== "text"),
    };
    expect(diagramIssues(bare).some((i) => i.includes("etiket"))).toBe(true);
  });

  it("rejects a drawing that is only text", () => {
    const wordsOnly = {
      caption: "Yalnızca yazı; buna diyagram denmez.",
      shapes: [
        { kind: "text" as const, x: 10, y: 10, text: "katı" },
        { kind: "text" as const, x: 10, y: 30, text: "sıvı" },
      ],
    };
    expect(diagramIssues(wordsOnly).some((i) => i.includes("şekil yok"))).toBe(true);
  });

  it("catches a line that would be invisible", () => {
    const zeroLine = {
      ...phaseDiagram,
      shapes: [
        ...phaseDiagram.shapes,
        { kind: "line" as const, x1: 10, y1: 10, x2: 10, y2: 10 },
      ],
    };
    expect(diagramIssues(zeroLine).some((i) => i.includes("Sıfır uzunlukta"))).toBe(true);
  });

  it("fits the unit circle inside the box", () => {
    // Birim çember en sık istenecek çizim; sınırlara sığdığı doğrulanmalı.
    const unitCircle = {
      caption: "Birim çember: yarıçap 1, x kosinüs, y sinüs.",
      shapes: [
        { kind: "circle" as const, cx: DIAGRAM_WIDTH / 2, cy: DIAGRAM_HEIGHT / 2, r: 70 },
        { kind: "line" as const, x1: 20, y1: 100, x2: 300, y2: 100, arrow: true },
        { kind: "line" as const, x1: 160, y1: 190, x2: 160, y2: 10, arrow: true },
        { kind: "text" as const, x: 305, y: 100, text: "x = cos θ", anchor: "end" as const },
      ],
    };
    expect(lessonDiagramSchema.safeParse(unitCircle).success).toBe(true);
    expect(diagramIssues(unitCircle)).toEqual([]);
  });
});

describe("a broken diagram must not take the lesson down", () => {
  it("drops an invalid diagram and keeps the lesson", async () => {
    // diagram eklenince ders üretimi tamamen durdu: kurala uymayan tek
    // bir çizim lessonV2Schema'yı tümden düşürüyordu.
    const { lessonV2Schema } = await import("@/lib/learning/teaching-standards");
    const lesson = {
      title: "Üç Fazlı Zemin Modeli",
      objective: "Faz diyagramındaki hacimleri ayırt edebileceksin.",
      overview: "Zemin katı, sıvı ve gaz olmak üzere üç fazdan oluşur.",
      sections: [
        {
          heading: "Faz Diyagramı",
          body: "**Katı faz** mineral taneleridir; **sıvı faz** sudur.",
          diagram: {
            caption: "Bozuk çizim: alan dışına taşan bir daire.",
            shapes: [{ kind: "circle", cx: 9999, cy: 9999, r: 5 }],
          },
        },
        { heading: "Boşluk Oranı", body: "Boşluk hacminin katı hacmine oranıdır." },
        { heading: "Porozite", body: "Boşluk hacminin toplam hacme oranıdır." },
      ],
      example: { prompt: "e = 0,5 ise n?", solution: "n = e/(1+e) = 0,333." },
      commonMistake: { claim: "e ile n aynı", correction: "Paydaları farklı." },
      infoCheck: { prompt: "Boşluk oranı nedir?", answer: "Vv / Vs" },
      summary: ["e = Vv/Vs", "n = Vv/V"],
      nextFocus: ["Doygunluk derecesi"],
    };
    const parsed = lessonV2Schema.safeParse(lesson);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.sections[0].diagram).toBeUndefined();
    expect(parsed.data?.sections[0].body).toContain("Katı faz");
  });
});

describe("needsDiagram", () => {
  it("fires on a heading that carries a shape word, whatever the subject", () => {
    // İlk hâlinde liste konu adlarından ("mohr", "birim çember", "akış
    // ağı") kuruluydu; ürün yalnızca mühendislik belgelerinde çizim
    // üretirdi. Artık ölçü, başlığın bir resmi işaret edip etmediği.
    expect(needsDiagram("Kayma Mukavemeti", "Mohr Dairesi ve Kırılma Zarfı")).toBe(true);
    expect(needsDiagram("Trigonometri", "Birim Çember")).toBe(true);
    expect(needsDiagram("Zemin Fiziği", "Faz Diyagramı")).toBe(true);
    expect(needsDiagram("Hücre Biyolojisi", "Krebs Döngüsü")).toBe(true);
    expect(needsDiagram("Anatomi", "Kalbin Kesiti")).toBe(true);
    expect(needsDiagram("Coğrafya", "İklim Haritası")).toBe(true);
    expect(needsDiagram("Fizik", "Serbest Cisim Diyagramı")).toBe(true);
  });

  it("stays quiet on topics that words explain", () => {
    // Her konuya çizim istemek çizimi değersizleştirir.
    expect(needsDiagram("Atterberg (Kıvam) Limitleri")).toBe(false);
    expect(needsDiagram("Darcy Yasası", "Laboratuvar Deneyleri")).toBe(false);
    expect(needsDiagram("Sağlam Çocuk İzlemi", "Aşı Takvimi")).toBe(false);
    expect(needsDiagram("Osmanlı'da Toprak Sistemi")).toBe(false);
  });

  it("ignores empty inputs", () => {
    expect(needsDiagram(null, undefined, "")).toBe(false);
  });
});

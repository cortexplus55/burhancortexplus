// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { isProgression, phraseDirection, trendOf, withTrend } from "@/lib/learning/visual-scenes/direction-semantics";
import { parseVisualScene, type MechanicsData } from "@/lib/learning/visual-scenes/schema";
import { layoutIssues, sceneFrame, type SceneChrome, type SceneMode } from "@/lib/learning/visual-scenes/layout";
import { layoutMechanics } from "@/components/learning/visual-scenes/MechanicsVectorScene";
import { layoutMedicalPathway } from "@/components/learning/visual-scenes/MedicalPathwayScene";
import { VisualSceneRenderer } from "@/components/learning/visual-scenes";

afterEach(cleanup);

/*
  Faz 1-B düzeltmesi (19 Kasım 2026): ok yönü ile etiketteki yön/eğilim tutarlı, kuvvet olmayan içerikte kuvvet dili yok,
  etiketler kesilmeden sarılır, rozet yazısı ortalı. Fikstürler jeneriktir (gerçek ders içeriği değil).
*/

const MODES: SceneMode[] = ["9:16", "16:9"];
const CHROMES: SceneChrome[] = ["video", "lesson"];

/** Eğilim anlatan, oku etiketle çelişen jenerik sahne (model çıktısındaki hata biçimi). */
const TREND_RAW = {
  archetype: "ENGINEERING_PHYSICS_MECHANICS",
  title: "Tabloda ilerledikçe iki niceliğin değişimi",
  setting: "free_body",
  body: { label: "Örnek tablo" },
  vectors: [
    { symbol: "a", label: "Birinci nicelik soldan sağa", direction: "left", magnitude: 2, trend: "decrease" },
    { symbol: "a", label: "Birinci nicelik yukarıdan aşağıya", direction: "up", magnitude: 2, trend: "increase" },
    { symbol: "b", label: "İkinci nicelik soldan sağa ilerledikçe azalır", direction: "right", magnitude: 2 },
    { symbol: "b", label: "İkinci nicelik yukarıdan aşağıya ilerledikçe artar", direction: "down", magnitude: 2 },
  ],
  logic: {
    formula: "İki nicelik aynı yönde değişir.",
    drivers: [
      { symbol: "→", label: "Soldan sağa ilerleme", effect: "down" },
      { symbol: "↓", label: "Yukarıdan aşağıya ilerleme", effect: "up" },
    ],
    distractors: [],
  },
};

const FORCE_RAW = {
  archetype: "ENGINEERING_PHYSICS_MECHANICS",
  title: "Serbest cisim diyagramı",
  setting: "free_body",
  body: { label: "Cisim" },
  vectors: [
    { symbol: "F_1", label: "Yukarı doğru birinci kuvvet", direction: "up", magnitude: 4 },
    { symbol: "G", label: "Ağırlık", direction: "down", magnitude: 3 },
  ],
  logic: { formula: "F_1 = a · b", drivers: [{ symbol: "a", label: "Birinci değişken artarsa", effect: "up" }], distractors: [] },
};

describe("yön ve eğilim anlamı", () => {
  it("etiketteki ilerleme yönünü ve eğilimi okur", () => {
    expect(phraseDirection("Birinci nicelik soldan sağa")).toBe("right");
    expect(phraseDirection("sağdan sola gidildikçe")).toBe("left");
    expect(phraseDirection("Yukarıdan aşağıya ilerleme")).toBe("down");
    expect(phraseDirection("aşağıdan yukarıya ve soldan sağa")).toBe("up_right");
    expect(phraseDirection("soldan sağa ve sağdan sola")).toBeNull();
    expect(phraseDirection("Ağırlık")).toBeNull();
    expect(trendOf("ilerledikçe azalır")).toBe("decrease");
    expect(trendOf("Değer artar")).toBe("increase");
    expect(trendOf("önce artar sonra azalır")).toBeNull();
    expect(isProgression("soldan sağa")).toBe(true);
    expect(isProgression("aşağı inildikçe")).toBe(true);
    expect(isProgression("Yukarı doğru birinci kuvvet")).toBe(false);
    expect(withTrend("Birinci nicelik soldan sağa", "decrease")).toBe("Birinci nicelik soldan sağa: azalır");
    expect(withTrend("İlerledikçe artar", "decrease")).toBe("İlerledikçe artar");
  });

  it("çelişen ok etikete uyar, eğilim etiketten gelir, sahne eğilim sahnesi olur", () => {
    const scene = parseVisualScene(TREND_RAW) as MechanicsData;
    expect(scene.setting).toBe("trend");
    expect(scene.vectors.map((vector) => vector.direction)).toEqual(["right", "down", "right", "down"]);
    expect(scene.vectors.map((vector) => vector.trend)).toEqual(["decrease", "increase", "decrease", "increase"]);
  });

  it("kuvvet sahnesi kuvvet sahnesi kalır", () => {
    const scene = parseVisualScene(FORCE_RAW) as MechanicsData;
    expect(scene.setting).toBe("free_body");
    expect(scene.vectors.map((vector) => vector.direction)).toEqual(["up", "down"]);
  });

  for (const mode of MODES) {
    for (const chrome of CHROMES) {
      it(`eğilim sahnesi ${mode} ${chrome}: kuvvet dili yok, eğilim yazıda, kesik etiket yok, çakışma yok`, () => {
        const scene = parseVisualScene(TREND_RAW) as MechanicsData;
        const layout = layoutMechanics(scene, sceneFrame(mode, chrome), "chemistry");
        expect(layoutIssues(layout)).toEqual([]);
        const all = layout.texts.map((box) => box.lines.join(" ")).join(" | ");
        expect(all).toContain("EĞİLİM VE YÖN DİYAGRAMI");
        expect(all).toContain("EĞİLİMİN MANTIĞI");
        expect(all).not.toMatch(/KUVVET|FORMÜLÜN/);
        expect(all).toContain("Birinci nicelik soldan sağa: azalır");
        expect(all).toContain("Soldan sağa ilerleme: azalır");
        expect(layout.texts.filter((box) => box.truncated).map((box) => box.id)).toEqual([]);
        const { container } = render(<VisualSceneRenderer scene={scene} mode={mode} chrome={chrome} domain="chemistry" animate="none" />);
        expect(container.textContent).toContain("azalır");
        expect(container.querySelector("svg")?.getAttribute("aria-label")).toMatch(/Eğilim ve Yön Diyagramı|azalır/);
      });
    }
  }

  it("50 karakterlik etiketler kesilmeden sarılır (kuvvet sahnesi, iki oran, iki yüzey)", () => {
    const long = {
      ...FORCE_RAW,
      vectors: [
        { symbol: "F_1", label: "Birinci kuvvet yüzeye dik ve yukarı yönde etki eder", direction: "up", magnitude: 4 },
        { symbol: "G", label: "Ağırlık cismin kütle merkezinden aşağı doğru etki eder", direction: "down", magnitude: 3 },
      ],
      logic: {
        formula: "F_1 = a · b",
        drivers: [{ symbol: "a", label: "Birinci değişken arttıkça bileşke kuvvet de büyür", effect: "up" }],
        distractors: [{ symbol: "x", label: "Soruda verilen ama formülde yer almayan değişken" }],
      },
    };
    const scene = parseVisualScene(long) as MechanicsData;
    for (const mode of MODES) {
      for (const chrome of CHROMES) {
        const layout = layoutMechanics(scene, sceneFrame(mode, chrome));
        expect(layoutIssues(layout), `${mode} ${chrome}`).toEqual([]);
        expect(layout.texts.filter((box) => box.truncated).map((box) => box.id), `${mode} ${chrome}`).toEqual([]);
      }
    }
  });

  it("rozet yazısı rozetin ortasından çizilir", () => {
    const scene = parseVisualScene(TREND_RAW) as MechanicsData;
    for (const mode of MODES) {
      const badge = layoutMechanics(scene, sceneFrame(mode, "lesson"), "chemistry").texts[0]!;
      expect(badge.anchor).toBe("middle");
      expect(badge.x).toBeCloseTo(badge.rect.x + badge.rect.w / 2, 5);
    }
    const medical = parseVisualScene({
      archetype: "MEDICAL_BIOLOGY_PATHWAY",
      title: "Jenerik zincir",
      layer: "cell",
      steps: [
        { role: "trigger", label: "Uyaran" },
        { role: "receptor", label: "Reseptör", effect: "activate" },
        { role: "finding", label: "Bulgu", effect: "activate" },
      ],
      spotlight: { text: "Jenerik vurgu" },
    });
    const badge = layoutMedicalPathway(medical as never, sceneFrame("16:9", "video")).texts[0]!;
    expect(badge.anchor).toBe("middle");
    const { container } = render(<VisualSceneRenderer scene={medical!} mode="16:9" chrome="video" animate="none" />);
    expect(container.querySelector("text")?.getAttribute("text-anchor")).toBe("middle");
  });

  it("ok etiketi okun rengini taşır (yan yana oklarda etiket–simge eşleşmesi renkten okunur)", () => {
    const scene = parseVisualScene({
      archetype: "ENGINEERING_PHYSICS_MECHANICS",
      title: "Jenerik iki eğilim",
      setting: "trend",
      body: { label: "Örnek" },
      vectors: [
        { symbol: "A", label: "Birinci nicelik", direction: "right", magnitude: 2, trend: "increase" },
        { symbol: "B", label: "İkinci nicelik", direction: "right", magnitude: 2, trend: "increase" },
      ],
      logic: { formula: "Jenerik kural cümlesi.", drivers: [{ symbol: "A", label: "Birinci nicelik", effect: "up" }], distractors: [] },
    });
    for (const mode of MODES) {
      const { container } = render(<VisualSceneRenderer scene={scene!} mode={mode} chrome="lesson" animate="none" />);
      for (const index of [0, 1]) {
        const symbolFill = container.querySelector(`text[data-text-id='vector${index}-symbol']`)?.getAttribute("fill");
        const labelFill = container.querySelector(`text[data-text-id='vector${index}-label']`)?.getAttribute("fill");
        expect(symbolFill).toBeTruthy();
        expect(labelFill).toBe(symbolFill);
      }
      cleanup();
    }
  });
});

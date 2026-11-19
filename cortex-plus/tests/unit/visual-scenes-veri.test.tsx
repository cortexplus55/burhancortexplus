// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resolvePedagogicalProfile, type PedagogicalLevel } from "@/lib/learning/pedagogical-profile";
import {
  MIN_SCREEN_TEXT_PX,
  REFERENCE_DISPLAY_WIDTH,
  SCENE_FONT_FLOOR,
  inflate,
  labelBudget,
  layoutIssues,
  sceneFontFloor,
  sceneFrame,
  type Rect,
  type SceneChrome,
  type SceneLayout,
  type SceneMode,
} from "@/lib/learning/visual-scenes/layout";
import {
  conceptSkeletonProblem,
  inferConceptStructure,
  lawTreeDepth,
  lawTreeOf,
  parseVisualScene,
  type VisualScene,
} from "@/lib/learning/visual-scenes/schema";
import { ARCHETYPE_SPEC, VISUAL_SCENE_COMMON_RULE, archetypeSpecBlock, visualSceneStrings, visualSceneText } from "@/lib/learning/visual-scenes/prompt";
import { CONCEPT_STRUCTURES, sceneArchetypeLabel, type VisualArchetype } from "@/lib/learning/visual-scenes/archetype";
import { VisualSceneRenderer } from "@/components/learning/visual-scenes";
import { layoutBlueprint, type BlueprintLayout } from "@/components/learning/visual-scenes/ArchitecturalBlueprintScene";
import { layoutLawDecision } from "@/components/learning/visual-scenes/LawDecisionScene";
import { causeGraph, layoutConceptStructure, type MarketLayout } from "@/components/learning/visual-scenes/ConceptStructureScene";
import { layoutMedicalPathway } from "@/components/learning/visual-scenes/MedicalPathwayScene";
import { layoutMechanics } from "@/components/learning/visual-scenes/MechanicsVectorScene";
import { layoutMathGraph } from "@/components/learning/visual-scenes/MathGraphScene";
import { layoutDocumentSpotlight } from "@/components/learning/visual-scenes/DocumentSpotlightScene";
import { visualSceneGrounded } from "@/lib/learning/teacher-lesson";

afterEach(cleanup);

/*
  20 Kasım 2026: görsel sahne motoru veri güdümlü ve seviyeye duyarlı. Fikstürler jeneriktir (gerçek ders içeriği yok);
  her biri bir arketipin yeni alanlarını zorlar. "Farklı veri → farklı çizim", seviye 1 ↔ 4 farkı, yazı tabanı ve
  bütün oran/yüzey/seviye birleşimlerinde sıfır taşma burada denetlenir.
*/
const MEDIUM = "Bu açıklama orta uzunlukta yazıldı ve sarılarak sığmalı";

const ARCH_SECTION = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Merkezi örtülü yapının kesiti",
  viewType: "section",
  elements: [
    { id: "k", label: "Merkezi kubbe", role: "Yükü kasnak üzerinden ayaklara aktarır", kind: "kubbe" },
    { id: "ay", label: "Taşıyıcı ayaklar", role: "Düşey yükü temele indirir", kind: "column", count: 4 },
    { id: "km", label: "Sivri kemer", role: "Açıklığı geçer", kind: "arch", variant: "pointed" },
    { id: "t", label: "Temel", role: "Yükü zemine yayar", kind: "foundation" },
    { id: "d", label: "Dış duvar", role: "Kabuğu oluşturur", kind: "wall" },
  ],
  layers: [
    { name: "Dış sıva", material: "Kireç sıva", thickness: "2 cm" },
    { name: "Kagir duvar", material: "Kesme taş", thickness: "60 cm" },
    { name: "İç sıva", material: "Alçı", thickness: "2 cm" },
  ],
  calloutPins: [
    { n: 1, target: "k" },
    { n: 2, target: "ay" },
    { n: 3, target: "km" },
    { n: 4, target: "Kagir duvar" },
    { n: 5, x: 0.1, y: 0.9, label: "Zemin", note: "Doğal zemin" },
  ],
  dimension: { label: "Kubbe çapı" },
  flow: "load",
};

const ARCH_PLAN = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Aks sistemi ve açıklıkların planı",
  viewType: "plan",
  elements: [
    { label: "Kolonlar", role: "Aks kesişimlerinde taşıyıcı", kind: "column", count: 5 },
    { label: "Kapı", role: "Giriş", kind: "opening", variant: "door" },
    { label: "Merdiven", role: "Katlar arası geçiş", kind: "stair" },
  ],
  dimension: { label: "Toplam uzunluk" },
};

const ARCH_ELEVATION = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Beşik çatılı cephe",
  viewType: "elevation",
  theme: "paper",
  elements: [
    { label: "Beşik çatı", role: "Yağmuru iki yana akıtır", kind: "roof", variant: "gable" },
    { label: "Pencereler", role: "Işık alır", kind: "opening", count: 2 },
    { label: "Kat döşemesi", role: "Katları ayırır", kind: "slab", count: 3 },
    { label: "Giriş kapısı", role: "Ana giriş", kind: "opening", variant: "door" },
  ],
  flow: "light",
};

const ARCH_LAYERS = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Teras çatı katman dizilimi",
  viewType: "schematic",
  elements: [
    { label: "Çatı döşemesi", role: "Taşıyıcı katman", kind: "slab" },
    { label: "Su yalıtımı", role: "Suyu keser" },
  ],
  layers: [
    { name: "Koruma betonu", material: "Beton", thickness: "5 cm", order: 1 },
    { name: "Su yalıtımı", material: "Bitümlü membran", thickness: "1 cm", order: 2 },
    { name: "Isı yalıtımı", material: "XPS", thickness: "8 cm", order: 3 },
    { name: "Betonarme döşeme", material: "Beton", thickness: "15 cm", order: 4 },
  ],
};

/** Kayıttaki eski biçim: yalnız view + label/role; türler etiketten çıkarılır. */
const ARCH_LEGACY = {
  archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  title: "Kesitte yapı elemanları ve yük aktarımı",
  view: "section",
  theme: "night",
  elements: [
    { label: "Taşıyıcı aks", role: "Yükü döşemeden temele aktaran düşey eleman dizisi" },
    { label: "Cephe katmanı", role: "Dış kabuk; ısı ve nemi denetler" },
    { label: "Açıklık", role: MEDIUM },
    { label: "Döşeme kesiti", role: "Katı ayıran yatay taşıyıcı" },
  ],
  dimension: { label: "Aks aralığı" },
  flow: "both",
};

const LAW_LEGACY = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Şart ve sonuç",
  decision: { question: "Şart sağlandı mı?", yes: "İşlem geçerli sayılır", no: "İşlem kurulmaz" },
  ruleVsException: { rule: ["Genel kural uygulanır"], exception: ["İstisna sayılan hâllerde"] },
};

const LAW_DEEP = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Üç kademeli karar",
  nodes: [
    { id: "q1", text: "Birinci şart sağlandı mı?", yes: "q2", no: "Başvuru reddedilir" },
    { id: "q2", text: "İkinci şart sağlandı mı?", yes: "q3", no: "Eksik tamamlanır" },
    { id: "q3", text: "Süre içinde mi?", yes: "İşlem geçerli", no: "Hak düşer" },
  ],
  majority: [
    { label: "Gerekli oy", fraction: "2/3", count: 400, total: 600, actual: 380 },
    { label: "Toplantı yeter sayısı", fraction: "1/3", count: 200, total: 600, actual: 450 },
  ],
};

const LAW_BRANCHES = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Üç yollu ayrım",
  nodes: [{ id: "r", text: "Uyuşmazlığın türü nedir?", branches: [{ label: "İdari", to: "İdari yargı" }, { label: "Adli", to: "Adli yargı" }, { label: "Anayasal", to: "Anayasa yargısı" }] }],
  ruleVsException: { rule: ["Görev kuralı kamu düzenindendir"] },
};

const CONCEPT: Record<(typeof CONCEPT_STRUCTURES)[number], Record<string, unknown>> = {
  process: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Yedi adımlı süreç",
    structure: "process",
    items: Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}. aşama`, ...(index % 2 ? {} : { detail: index === 2 ? MEDIUM : "Kısa açıklama" }) })),
    takeaway: "Aşamaların sırası sorulur.",
  },
  matrix: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Üç dönemin karşılaştırması",
    columns: ["Birinci", "İkinci", "Üçüncü"],
    comparisonRows: [
      { label: "Tema", values: ["Birinci tema", "İkinci tema", "Üçüncü tema"], highlight: 1 },
      { label: "Biçim", values: ["Kalıplı", "Serbest", "Karma"] },
      { label: "Dil", values: ["Ağır", "Sade", MEDIUM] },
    ],
  },
  pyramid: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Tepeden tabana beş katman",
    structure: "pyramid",
    items: [{ label: "Tepe katman", detail: "En az öğe" }, { label: "Dördüncü katman" }, { label: "Üçüncü katman", detail: "Ara düzey" }, { label: "İkinci katman" }, { label: "Taban katman", detail: "Bütün yapının dayanağı" }],
  },
  timeline: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Dört durakta kronoloji",
    items: [
      { date: "Birinci dönem", label: "Başlangıç olayı", detail: "Sürecin ilk adımı" },
      { date: "İkinci dönem", label: "Gelişme" },
      { date: "Üçüncü dönem", label: "Dönüm noktası", detail: MEDIUM },
      { date: "Dördüncü dönem", label: "Sonuç" },
    ],
  },
  cause_effect: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "İki nedenden sonuca",
    items: [{ id: "n1", label: "Birinci neden" }, { id: "n2", label: "İkinci neden" }, { id: "m", label: "Ara etki" }, { id: "s", label: "Sonuç" }],
    links: [{ from: "n1", to: "m", effect: "increase" }, { from: "n2", to: "m", effect: "decrease" }, { from: "m", to: "s", effect: "increase" }, { from: "n1", to: "s" }],
  },
  supply_demand: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Talep artınca yeni denge",
    structure: "supply_demand",
    market: { equilibrium: "Piyasa dengesi", shift: { curve: "demand", direction: "right", label: "Talep artar" } },
    takeaway: "Talep artınca denge fiyatı ve miktarı artar.",
  },
};

const MEDICAL = {
  archetype: "MEDICAL_BIOLOGY_PATHWAY",
  title: "Uyarandan bulguya mekanizma zinciri",
  layer: "cell",
  steps: [
    { role: "trigger", label: "Dış uyaran", detail: "Sinyali başlatan molekül" },
    { role: "receptor", label: "Zar reseptörü", detail: "Uyaranı bağlar", effect: "activate" },
    { role: "messenger", label: "İkincil haberci", detail: MEDIUM, effect: "activate" },
    { role: "target", label: "Hedef enzim", detail: "Bloke edilir", effect: "inhibit" },
    { role: "finding", label: "Bulgu", detail: "Blokajla geriler", effect: "activate" },
  ],
  spotlight: { text: "Blokaj basamağı ve sonrasındaki bulgu birlikte sorulur." },
};

const MECHANICS = {
  archetype: "ENGINEERING_PHYSICS_MECHANICS",
  title: "Serbest cisim diyagramı",
  setting: "free_body",
  body: { label: "Cisim" },
  vectors: [
    { symbol: "F_1", label: "Yukarı yönlü kuvvet", direction: "up", magnitude: 4 },
    { symbol: "G", label: "Ağırlık", direction: "down", magnitude: 3 },
  ],
  logic: {
    formula: "F_1 = a · b",
    drivers: [
      { symbol: "a", label: "Birinci değişken artarsa", effect: "up" },
      { symbol: "b", label: "İkinci değişken artarsa", effect: "up" },
    ],
    distractors: [{ symbol: "x", label: "Formülde yer almayan çeldirici" }],
  },
};

const MATH = {
  archetype: "MATH_ALGORITHMIC_GRAPH",
  title: "Eğrinin kritik noktaları",
  mode: "function",
  curve: { family: "quadratic", expression: "f(x) = ax² + bx + c", points: [{ kind: "vertex", label: "Tepe" }, { kind: "root", label: "Kök" }] },
  steps: ["Fonksiyonu yaz", "Kökleri bul", "Tepeyi bul", "Grafiği çiz"],
};

const DOCUMENT = {
  archetype: "DOCUMENT_FIGURE_SPOTLIGHT",
  title: "Tablodaki kritik hücre",
  figure: { kind: "table", caption: "Tablo 1", columns: ["Ölçüt", "Birinci", "İkinci"], rows: [["Satır bir", "Değer A", "Değer B"], ["Satır iki", "Değer C", MEDIUM]] },
  spots: [{ row: 0, col: 1, label: "Vurgu", note: "Sınavda doğrudan sorulur" }],
};

const ALL: Record<string, Record<string, unknown>> = {
  ARCH_SECTION,
  ARCH_PLAN,
  ARCH_ELEVATION,
  ARCH_LAYERS,
  ARCH_LEGACY,
  LAW_LEGACY,
  LAW_DEEP,
  LAW_BRANCHES,
  MEDICAL,
  MECHANICS,
  MATH,
  DOCUMENT,
  ...Object.fromEntries(Object.entries(CONCEPT).map(([key, raw]) => [`CONCEPT_${key}`, raw])),
};

type Layout = (scene: VisualScene, mode: SceneMode, chrome: SceneChrome, level?: PedagogicalLevel) => SceneLayout;
const LAYOUT: Record<VisualArchetype, Layout> = {
  MEDICAL_BIOLOGY_PATHWAY: (s, m, c, l) => layoutMedicalPathway(s as never, sceneFrame(m, c, l)),
  ENGINEERING_PHYSICS_MECHANICS: (s, m, c, l) => layoutMechanics(s as never, sceneFrame(m, c, l)),
  ARCHITECTURE_SPATIAL_BLUEPRINT: (s, m, c, l) => layoutBlueprint(s as never, sceneFrame(m, c, l)),
  LAW_SOCIAL_FLOWCHART: (s, m, c, l) => layoutLawDecision(s as never, sceneFrame(m, c, l)),
  MATH_ALGORITHMIC_GRAPH: (s, m, c, l) => layoutMathGraph(s as never, sceneFrame(m, c, l)),
  DOCUMENT_FIGURE_SPOTLIGHT: (s, m, c, l) => layoutDocumentSpotlight(s as never, sceneFrame(m, c, l)),
  CONCEPT_STRUCTURE_VISUALIZER: (s, m, c, l) => layoutConceptStructure(s as never, sceneFrame(m, c, l)),
};

const MODES: SceneMode[] = ["9:16", "16:9"];
const CHROMES: SceneChrome[] = ["video", "lesson"];
const LEVELS: (PedagogicalLevel | undefined)[] = [undefined, 1, 2, 3, 4];

function scene(raw: Record<string, unknown>): VisualScene {
  const parsed = parseVisualScene(raw);
  expect(parsed, String(raw.title)).not.toBeNull();
  return parsed!;
}

/** Çizimin geometri imzası: bütün yol, çizgi, dikdörtgen ve dairelerin koordinatları (ızgara ve zemin dahil). */
function pathSet(container: HTMLElement): string[] {
  const attrs = ["d", "x1", "y1", "x2", "y2", "x", "y", "width", "height", "cx", "cy", "r"];
  return [...container.querySelectorAll("svg path, svg line, svg rect, svg circle")]
    .map((node) => `${node.tagName}:${attrs.map((name) => node.getAttribute(name) ?? "").join(",")}`)
    .sort();
}

describe("yazı tabanı: ekranda en az 11 px", () => {
  it("viewBox ölçeği hesaba katılır: en dar gösterimde taban × ölçek ≥ 11 px", () => {
    for (const mode of MODES) {
      const width = mode === "9:16" ? 360 : 640;
      const floor = sceneFontFloor(mode);
      expect((floor * REFERENCE_DISPLAY_WIDTH[mode]) / width).toBeGreaterThanOrEqual(MIN_SCREEN_TEXT_PX);
      expect(SCENE_FONT_FLOOR).toBeGreaterThanOrEqual(floor);
      expect(sceneFrame(mode).text.floor).toBeGreaterThanOrEqual(floor);
    }
  });

  it("her arketip, her oran, yüzey ve seviyede: yerleşimdeki her yazı tabanda ya da üstünde, sıfır taşma ve çakışma", () => {
    const problems: string[] = [];
    for (const [name, raw] of Object.entries(ALL)) {
      const parsed = scene(raw);
      for (const level of LEVELS) {
        for (const mode of MODES) {
          for (const chrome of CHROMES) {
            const layout = LAYOUT[parsed.archetype](parsed, mode, chrome, level);
            const small = layout.texts.filter((box) => box.fontSize < layout.frame.text.floor - 0.01).map((box) => `${box.id}:${box.fontSize}`);
            const issues = layoutIssues(layout).map((issue) => `${issue.kind} ${issue.detail}`);
            if (small.length || issues.length) problems.push(`${name} L${level ?? "-"} ${mode} ${chrome}: ${[...small, ...issues].join("; ")}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("çizilen her <text> öğesinin yazı boyu tabanın altına inmez (rozet, pin numarası, aks balonu dahil)", () => {
    const problems: string[] = [];
    for (const [name, raw] of Object.entries(ALL)) {
      const parsed = scene(raw);
      for (const level of [undefined, 1, 4] as const) {
        for (const mode of MODES) {
          const { container } = render(<VisualSceneRenderer scene={parsed} mode={mode} level={level} animate="none" />);
          for (const node of container.querySelectorAll("svg text")) {
            const size = Number(node.getAttribute("font-size"));
            if (!(size >= sceneFontFloor(mode) - 0.01)) problems.push(`${name} L${level ?? "-"} ${mode}: ${node.textContent} ${size}`);
          }
          cleanup();
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("seviye: aynı veri, farklı yoğunluk", () => {
  it("seviye profili tek kaynaktan: çerçevenin etiket bütçesi ve yazı ölçeği pedagogical-profile ile aynı", () => {
    const probe: Record<PedagogicalLevel, [string | null, string | null]> = { 1: ["8", null], 2: ["10", null], 3: ["Üniversite", null], 4: [null, "KPSS"] };
    for (const level of [1, 2, 3, 4] as PedagogicalLevel[]) {
      const profile = resolvePedagogicalProfile(...probe[level]);
      expect(profile.level).toBe(level);
      const frame = sceneFrame("16:9", "lesson", level);
      expect(frame.text.maxLabels).toBe(profile.visual.maxLabels);
      expect(frame.text.fontScale).toBe(profile.visual.fontScale);
      expect(frame.text.density).toBe(profile.visual.density);
    }
    expect(sceneFrame("16:9").text.maxLabels).toBe(Number.POSITIVE_INFINITY);
    expect(labelBudget(5, [{ count: 4, keep: 4 }, { count: 3, keep: 0 }, { count: 2, keep: 1 }])).toEqual([4, 0, 1]);
  });

  it("seviye 1 daha az etiket ve büyük yazı, seviye 4 tam ayrıntı ve teknik işaret", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["tıp", MEDICAL],
      ["süreç", CONCEPT.process],
      ["mimarlık", ARCH_SECTION],
      ["hukuk", LAW_DEEP],
      ["matematik", MATH],
    ];
    for (const [name, raw] of cases) {
      const parsed = scene(raw);
      for (const mode of MODES) {
        const low = LAYOUT[parsed.archetype](parsed, mode, "lesson", 1);
        const high = LAYOUT[parsed.archetype](parsed, mode, "lesson", 4);
        const title = (layout: SceneLayout) => layout.texts.find((box) => box.id === "title")!.fontSize;
        expect(title(low), `${name} ${mode} başlık`).toBeGreaterThan(title(high));
        expect(low.texts.length, `${name} ${mode} etiket sayısı`).toBeLessThan(high.texts.length);
      }
    }
    // Teknik işaretler (kot, ölçü çentiği) yalnız üniversite/uzmanlık düzeyinde.
    const section = scene(ARCH_SECTION);
    const low = layoutBlueprint(section as never, sceneFrame("16:9", "lesson", 1));
    const high = layoutBlueprint(section as never, sceneFrame("16:9", "lesson", 4));
    expect(low.kots).toHaveLength(0);
    expect(high.kots.length).toBeGreaterThanOrEqual(2);
    expect(low.dimension?.ticks ?? []).toHaveLength(0);
    expect(high.dimension?.ticks.length).toBeGreaterThan(0);
  });

  it("sahnenin kendi pedagogicalLevel alanı çizimi değiştirir; geçersiz seviye yok sayılır", () => {
    const fontOf = (raw: Record<string, unknown>) => {
      const { container } = render(<VisualSceneRenderer scene={scene(raw)} mode="16:9" animate="none" />);
      const size = Number(container.querySelector("text[data-text-id='title']")!.getAttribute("font-size"));
      cleanup();
      return size;
    };
    expect(fontOf({ ...MEDICAL, pedagogicalLevel: 1 })).toBeGreaterThan(fontOf({ ...MEDICAL, pedagogicalLevel: 4 }));
    expect(scene({ ...MEDICAL, pedagogicalLevel: "3" }).pedagogicalLevel).toBe(3);
    expect(scene({ ...MEDICAL, pedagogicalLevel: 9 }).pedagogicalLevel).toBeUndefined();
    expect(scene(MEDICAL).pedagogicalLevel).toBeUndefined();
  });
});

describe("mimarlık: çizim veriden kurulur", () => {
  it("farklı görünüş ve eleman seti → farklı SVG yolları ve parçalar", () => {
    const draw = (raw: Record<string, unknown>) => {
      const { container } = render(<VisualSceneRenderer scene={scene(raw)} mode="16:9" animate="none" />);
      const out = {
        paths: pathSet(container),
        view: container.querySelector("[data-view]")?.getAttribute("data-view"),
        kinds: new Set([...container.querySelectorAll("[data-shape]")].map((node) => node.getAttribute("data-shape"))),
        poche: container.querySelectorAll("[data-poche]").length,
      };
      cleanup();
      return out;
    };
    const section = draw(ARCH_SECTION);
    const plan = draw(ARCH_PLAN);
    const elevation = draw(ARCH_ELEVATION);
    const layers = draw(ARCH_LAYERS);
    expect([section.view, plan.view, elevation.view, layers.view]).toEqual(["section", "plan", "elevation", "schematic"]);
    expect(section.paths).not.toEqual(plan.paths);
    expect(section.paths).not.toEqual(elevation.paths);
    expect(plan.paths).not.toEqual(layers.paths);
    for (const kind of ["dome", "arch", "column", "foundation", "wall", "layer"]) expect(section.kinds.has(kind), kind).toBe(true);
    for (const kind of ["stair", "opening", "column"]) expect(plan.kinds.has(kind), kind).toBe(true);
    for (const kind of ["roof", "opening", "slab"]) expect(elevation.kinds.has(kind), kind).toBe(true);
    // Kesitte kesilen eleman taranır, görünüşte taranmaz.
    expect(section.poche).toBeGreaterThan(4);
    expect(elevation.poche).toBe(0);
    // Aynı türde farklı sayı → farklı geometri (aks sayısı).
    const three = layoutBlueprint(scene({ ...ARCH_PLAN, elements: [{ ...ARCH_PLAN.elements[0], count: 3 }, ...ARCH_PLAN.elements.slice(1)] }) as never, sceneFrame("16:9"));
    const five = layoutBlueprint(scene(ARCH_PLAN) as never, sceneFrame("16:9"));
    expect(three.axes.filter((axis) => /\d/.test(axis.label))).toHaveLength(3);
    expect(five.axes.filter((axis) => /\d/.test(axis.label))).toHaveLength(5);
  });

  it("numaralı pin işaret ettiği öğenin üstüne oturur (eleman kimliği, katman adı, göreli konum)", () => {
    const parsed = scene(ARCH_SECTION) as Extract<VisualScene, { archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT" }>;
    for (const mode of MODES) {
      for (const level of [undefined, 1, 4] as const) {
        const layout = layoutBlueprint(parsed, sceneFrame(mode, "lesson", level));
        const shapeBox = (predicate: (shape: BlueprintLayout["shapes"][number]) => boolean): Rect => {
          const rects = layout.shapes.filter(predicate).map((shape) => shape.rect);
          const x = Math.min(...rects.map((r) => r.x));
          const y = Math.min(...rects.map((r) => r.y));
          return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
        };
        const inside = (pin: { x: number; y: number }, rect: Rect) => {
          const room = inflate(rect, 10);
          return pin.x >= room.x && pin.x <= room.x + room.w && pin.y >= room.y && pin.y <= room.y + room.h;
        };
        for (const [n, element] of [[1, 0], [2, 1], [3, 2]] as const) {
          const pin = layout.pins.find((item) => item.n === n);
          if (!pin) continue; // seviye 1 bütçesi pin düşürebilir
          expect(inside(pin, shapeBox((shape) => shape.element === element)), `pin ${n} ${mode} L${level ?? "-"}`).toBe(true);
        }
        const layerPin = layout.pins.find((item) => item.n === 4);
        if (layerPin) expect(inside(layerPin, shapeBox((shape) => shape.layer === 1)), `katman pini ${mode}`).toBe(true);
        const free = layout.pins.find((item) => item.n === 5);
        if (free) {
          expect(free.x).toBeLessThan(layout.drawing.x + layout.drawing.w * 0.5);
          expect(free.y).toBeGreaterThan(layout.drawing.y + layout.drawing.h * 0.5);
        }
      }
    }
  });

  it("eski kayıt (view + label/role) aynen ayrışır ve çizilir; türler etiketten çıkarılır, pinler kendi öğesinde", () => {
    const parsed = scene(ARCH_LEGACY) as Extract<VisualScene, { archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT" }>;
    expect(parsed.elements.map((element) => element.kind)).toEqual(["column", "facade", "opening", "slab"]);
    expect(parsed.viewType).toBeUndefined();
    expect(parsed.layers).toEqual([]);
    const { container } = render(<VisualSceneRenderer scene={parsed} mode="9:16" animate="none" />);
    expect(container.querySelectorAll("[data-pin]")).toHaveLength(4);
    expect(container.querySelector("[data-view='section']")).not.toBeNull();
    const layout = layoutBlueprint(parsed, sceneFrame("9:16"));
    for (const pin of layout.pins) {
      const own = layout.shapes.filter((shape) => shape.element === pin.n - 1).map((shape) => shape.rect);
      expect(own.length, `pin ${pin.n}`).toBeGreaterThan(0);
      expect(own.some((rect) => pin.x >= rect.x - 12 && pin.x <= rect.x + rect.w + 12 && pin.y >= rect.y - 12 && pin.y <= rect.y + rect.h + 12), `pin ${pin.n}`).toBe(true);
    }
  });

  it("katman detayı: bantlar kalınlıkla orantılı, malzemeye göre taranır, sıra korunur", () => {
    const parsed = scene(ARCH_LAYERS) as Extract<VisualScene, { archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT" }>;
    expect(parsed.layers.map((layer) => layer.materialKind)).toEqual(["concrete", "membrane", "insulation", "concrete"]);
    const layout = layoutBlueprint(parsed, sceneFrame("16:9", "lesson", 4));
    const bands = layout.shapes.filter((shape) => shape.kind === "layer").sort((a, b) => a.rect.y - b.rect.y);
    expect(bands.map((band) => band.layer)).toEqual([0, 1, 2, 3]);
    expect(bands[3]!.rect.h).toBeGreaterThan(bands[2]!.rect.h);
    expect(bands[2]!.rect.h).toBeGreaterThan(bands[0]!.rect.h);
    expect(layout.texts.some((box) => box.id.startsWith("thickness") && box.lines.join(" ") === "15 cm")).toBe(true);
  });
});

describe("hukuk: çok kademeli karar ağacı", () => {
  it("derinlik 1 (eski karar) ve 3 (düğümler) farklı ağaç ve farklı yol çizer", () => {
    const shallow = scene(LAW_LEGACY);
    const deep = scene(LAW_DEEP);
    expect(lawTreeDepth(lawTreeOf(shallow as never))).toBe(1);
    expect(lawTreeDepth(lawTreeOf(deep as never))).toBe(3);
    const draw = (parsed: VisualScene) => {
      const { container } = render(<VisualSceneRenderer scene={parsed} mode="16:9" animate="none" />);
      const out = {
        depth: container.querySelector("[data-tree-depth]")?.getAttribute("data-tree-depth"),
        questions: container.querySelectorAll("[data-node='question']").length,
        leaves: container.querySelectorAll("[data-node='leaf']").length,
        yes: container.querySelectorAll("[data-branch='yes']").length,
        no: container.querySelectorAll("[data-branch='no']").length,
        paths: pathSet(container),
      };
      cleanup();
      return out;
    };
    const one = draw(shallow);
    const three = draw(deep);
    expect([one.depth, one.questions, one.leaves, one.yes, one.no]).toEqual(["1", 1, 2, 1, 1]);
    expect([three.depth, three.questions, three.leaves]).toEqual(["3", 3, 4]);
    expect(three.no).toBe(3);
    expect(one.paths).not.toEqual(three.paths);
  });

  it("adlı dallar, döngü ve derinlik sınırı; ağaç yoksa sahne düşer", () => {
    const branches = lawTreeOf(scene(LAW_BRANCHES) as never)!;
    expect(branches.children.map((child) => child.label)).toEqual(["İDARİ", "ADLİ", "ANAYASAL"]);
    const loop = scene({ ...LAW_LEGACY, decision: undefined, nodes: [{ id: "a", text: "Birinci soru?", yes: "b", no: "Son" }, { id: "b", text: "İkinci soru?", yes: "a", no: "Bitti" }] });
    expect(lawTreeDepth(lawTreeOf(loop as never))).toBe(2);
    const chain = Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, text: `${index + 1}. soru?`, yes: `q${index + 1}`, no: "Ret" }));
    expect(lawTreeDepth(lawTreeOf(scene({ ...LAW_LEGACY, decision: undefined, nodes: chain }) as never))).toBe(3);
    expect(parseVisualScene({ archetype: "LAW_SOCIAL_FLOWCHART", title: "Ağaçsız", majority: [] })).toBeNull();
  });

  it("barometre toplamı ve gerçekleşeni çizer: eşik geçildiyse yeşil, geçilmediyse kırmızı", () => {
    const { container } = render(<VisualSceneRenderer scene={scene(LAW_DEEP)} mode="9:16" animate="none" />);
    const rows = [...container.querySelectorAll("[data-ratio]")];
    expect(rows.map((row) => row.getAttribute("data-pass"))).toEqual(["0", "1"]);
    expect(container.querySelectorAll("[data-threshold]")).toHaveLength(2);
    expect(container.textContent).toContain("380/600");
    expect(container.textContent).toContain("eşik geçilmedi");
    expect(container.textContent).toContain("eşik geçildi");
  });

  it("istisna zorunlu değil: tablo yoksa çizilmez, istisna yoksa tek sütun", () => {
    const render1 = (raw: Record<string, unknown>) => {
      const { container } = render(<VisualSceneRenderer scene={scene(raw)} mode="16:9" animate="none" />);
      const out = { table: Boolean(container.querySelector("[data-section='rule-vs-exception']")), text: container.textContent ?? "" };
      cleanup();
      return out;
    };
    expect(render1({ ...LAW_DEEP }).table).toBe(false);
    const single = render1(LAW_BRANCHES);
    expect(single.table).toBe(true);
    expect(single.text).toContain("GENEL KURAL");
    expect(single.text).not.toContain("İSTİSNA");
    expect(render1(LAW_LEGACY).text).toContain("İSTİSNA");
  });
});

describe("kavram yapısı: altı biçim", () => {
  it("her biçim kendi çizimini üretir (farklı veri → farklı çizim)", () => {
    const seen = new Map<string, string[]>();
    for (const structure of CONCEPT_STRUCTURES) {
      const parsed = scene(CONCEPT[structure]);
      expect(parsed.archetype).toBe("CONCEPT_STRUCTURE_VISUALIZER");
      expect(sceneArchetypeLabel(parsed as never).length).toBeGreaterThan(5);
      const { container } = render(<VisualSceneRenderer scene={parsed} mode="16:9" animate="none" />);
      expect(container.querySelector(`[data-structure='${structure}']`), structure).not.toBeNull();
      seen.set(structure, pathSet(container));
      cleanup();
    }
    const signatures = new Set([...seen.values()].map((paths) => paths.join("|")));
    expect(signatures.size).toBe(CONCEPT_STRUCTURES.length);
  });

  it("yapı yazılmadıysa veriden çıkarılır; iskelet yoksa sahne düşer", () => {
    expect(inferConceptStructure({ comparisonRows: [{}, {}], items: [], links: [] })).toBe("matrix");
    expect(inferConceptStructure({ comparisonRows: [], market: {}, items: [], links: [] })).toBe("supply_demand");
    expect(inferConceptStructure({ comparisonRows: [], items: [{ date: "a" }, { date: "b" }], links: [] })).toBe("timeline");
    expect(inferConceptStructure({ comparisonRows: [], items: [{}, {}], links: [{}] })).toBe("cause_effect");
    expect(inferConceptStructure({ comparisonRows: [], items: [{}, {}], links: [] })).toBe("process");
    expect(scene(CONCEPT.matrix).archetype === "CONCEPT_STRUCTURE_VISUALIZER" && (scene(CONCEPT.matrix) as { structure: string }).structure).toBe("matrix");
    expect(conceptSkeletonProblem({ structure: "pyramid", items: [{ label: "Tek" }], comparisonRows: [] })).not.toBeNull();
    expect(parseVisualScene({ archetype: "CONCEPT_STRUCTURE_VISUALIZER", title: "Tek adım", structure: "process", items: [{ label: "Tek" }] })).toBeNull();
    expect(parseVisualScene({ archetype: "concept", title: "Takma ad", items: [{ label: "Bir" }, { label: "İki" }] })?.archetype).toBe("CONCEPT_STRUCTURE_VISUALIZER");
  });

  it("arz-talep: kayma yönüyle tutarlı yeni denge (talep sağa → fiyat ve miktar artar; arz sola → fiyat artar, miktar azalır)", () => {
    const market = (shift: { curve: "supply" | "demand"; direction: "right" | "left" }) => {
      const layout = layoutConceptStructure(scene({ ...CONCEPT.supply_demand, market: { shift } }) as never, sceneFrame("16:9"));
      const body = layout.body as MarketLayout;
      const [e, e2] = body.points;
      return { e: e!, e2: e2!, arrow: body.shiftArrow! };
    };
    const demandUp = market({ curve: "demand", direction: "right" });
    expect(demandUp.e2.x).toBeGreaterThan(demandUp.e.x);
    expect(demandUp.e2.y).toBeLessThan(demandUp.e.y);
    expect(demandUp.arrow.x2).toBeGreaterThan(demandUp.arrow.x1);
    const supplyDown = market({ curve: "supply", direction: "left" });
    expect(supplyDown.e2.x).toBeLessThan(supplyDown.e.x);
    expect(supplyDown.e2.y).toBeLessThan(supplyDown.e.y);
    const demandDown = market({ curve: "demand", direction: "left" });
    expect(demandDown.e2.x).toBeLessThan(demandDown.e.x);
    expect(demandDown.e2.y).toBeGreaterThan(demandDown.e.y);
  });

  it("neden-sonuç: katman en uzun yoldan; katman atlayan bağ kutulara değmeden kenar şeridinden geçer", () => {
    const parsed = scene(CONCEPT.cause_effect) as Extract<VisualScene, { archetype: "CONCEPT_STRUCTURE_VISUALIZER" }>;
    const graph = causeGraph(parsed.items, parsed.links);
    expect(graph.layer).toEqual([0, 0, 1, 2]);
    expect(causeGraph(parsed.items, []).edges).toHaveLength(3);
    for (const mode of MODES) {
      const layout = layoutConceptStructure(parsed, sceneFrame(mode));
      const body = layout.body as Extract<typeof layout.body, { kind: "cause_effect" }>;
      const skip = body.edges.find((edge) => edge.points.length === 6);
      expect(skip, mode).toBeDefined();
      expect(layoutIssues(layout)).toEqual([]);
    }
  });
});

describe("istem ve düz metin", () => {
  it("istem yeni alanları ve seviye kuralını tek yerde söyler; doğruluk kuralları aynen", () => {
    expect(VISUAL_SCENE_COMMON_RULE).toContain("BİLGİ DOĞRULUĞU");
    expect(VISUAL_SCENE_COMMON_RULE).toContain("pedagogicalLevel");
    expect(VISUAL_SCENE_COMMON_RULE.match(/pedagogicalLevel/g)).toHaveLength(1);
    for (const field of ["viewType", "layers", "calloutPins"]) expect(ARCHETYPE_SPEC.ARCHITECTURE_SPATIAL_BLUEPRINT.json).toContain(field);
    expect(ARCHETYPE_SPEC.LAW_SOCIAL_FLOWCHART.json).toContain('"nodes"');
    expect(ARCHETYPE_SPEC.LAW_SOCIAL_FLOWCHART.draws).toContain("İSTEĞE BAĞLI");
    expect(ARCHETYPE_SPEC.LAW_SOCIAL_FLOWCHART.when).not.toMatch(/tarih|edebiyat|felsefe/i);
    for (const field of ["structure", "comparisonRows", "market", "links"]) expect(ARCHETYPE_SPEC.CONCEPT_STRUCTURE_VISUALIZER.json).toContain(field);
    expect(archetypeSpecBlock("CONCEPT_STRUCTURE_VISUALIZER", false)).toContain("ARCHITECTURE_SPATIAL_BLUEPRINT");
  });

  it("temellendirme ve düz metin yeni alanları kapsar (katman, ağaç düğümü, kavram öğesi)", () => {
    const arch = visualSceneStrings(scene(ARCH_SECTION));
    expect(arch.labels).toContain("Kagir duvar");
    expect(arch.prose).toContain("60 cm");
    const law = visualSceneStrings(scene(LAW_DEEP));
    expect(law.labels).toContain("Süre içinde mi?");
    expect(law.prose).toContain("Hak düşer");
    expect(visualSceneText(scene(LAW_DEEP))).toContain("Birinci şart sağlandı mı? evet → (İkinci şart sağlandı mı?");
    const matrix = visualSceneStrings(scene(CONCEPT.matrix));
    expect(matrix.labels).toEqual(expect.arrayContaining(["Birinci", "Tema"]));
    expect(visualSceneText(scene(CONCEPT.supply_demand))).toContain("talep sağa kayar");
    // Uydurma sayı temellenmez.
    const corpus = "Birinci şart, ikinci şart, süre, başvuru, eksik, işlem, hak, gerekli oy, toplantı yeter sayısı 2/3 400 600 1/3 200";
    expect(visualSceneGrounded(scene(LAW_DEEP), corpus)).toBe(false);
    expect(visualSceneGrounded(scene(LAW_DEEP), `${corpus} 380 450`)).toBe(true);
  });
});

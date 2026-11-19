// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  ARCHETYPE_LABEL,
  VISUAL_ARCHETYPES,
  classifyAcademicDomain,
  detectSourceTable,
  type VisualArchetype,
} from "@/lib/learning/visual-scenes/archetype";
import { layoutIssues, sceneFrame, SAFE_BOTTOM_MARGIN, type SceneChrome, type SceneMode } from "@/lib/learning/visual-scenes/layout";
import { fitText, measureText } from "@/lib/learning/visual-scenes/text-fit";
import { parseReelVisual, parseVisualScene, type ReelVisual, type VisualScene } from "@/lib/learning/visual-scenes/schema";
import { ReelSceneRenderer, VisualSceneRenderer } from "@/components/learning/visual-scenes";
import { layoutMedicalPathway } from "@/components/learning/visual-scenes/MedicalPathwayScene";
import { layoutMechanics } from "@/components/learning/visual-scenes/MechanicsVectorScene";
import { layoutBlueprint } from "@/components/learning/visual-scenes/ArchitecturalBlueprintScene";
import { layoutLawDecision } from "@/components/learning/visual-scenes/LawDecisionScene";
import { layoutMathGraph } from "@/components/learning/visual-scenes/MathGraphScene";
import { layoutDocumentSpotlight } from "@/components/learning/visual-scenes/DocumentSpotlightScene";
import { layoutReelHook } from "@/components/learning/visual-scenes/ReelHookScene";
import { layoutComparison } from "@/components/learning/visual-scenes/ComparisonMatrixScene";
import { layoutExamTrap } from "@/components/learning/visual-scenes/ExamTrapScene";
import { layoutMemoryNail } from "@/components/learning/visual-scenes/MemoryNailScene";
import type { SceneLayout } from "@/lib/learning/visual-scenes/layout";

afterEach(cleanup);

/*
  Jenerik fikstürler: gerçek ders içeriği değil; her arketipin bütün yapı alanlarını ve uzun metin
  durumlarını zorlar. Çoğunluk örnekleri spec'in kendi örnekleridir (3/5 = 360, 2/3 = 400).
*/
const LONG = "Bu açıklama bilerek uzun yazıldı; satıra sığmazsa sarılmalı, küçülmeli ve gerekirse üç noktayla kesilmelidir ki kutudan hiç taşmasın";

const RAW: Record<VisualArchetype, unknown> = {
  MEDICAL_BIOLOGY_PATHWAY: {
    archetype: "MEDICAL_BIOLOGY_PATHWAY",
    title: "Uyarandan klinik bulguya beş basamaklı mekanizma zinciri",
    layer: "cell",
    steps: [
      { role: "trigger", label: "Dış uyaran", detail: "Sinyali başlatan molekül" },
      { role: "receptor", label: "Zar reseptörü", detail: "Uyaranı bağlar ve aktive olur", effect: "activate" },
      { role: "messenger", label: "İkincil haberci", detail: LONG, effect: "activate" },
      { role: "target", label: "Hedef enzim basamağı", detail: "Bu basamak bloke edilir", effect: "inhibit" },
      { role: "finding", label: "Klinik bulgu", detail: "Blokajla bulgu geriler", effect: "activate" },
    ],
    spotlight: { text: "Sınavda blokaj basamağı ve sonrasındaki klinik bulgu birlikte sorulur; okun yönünü ve rengini ezberle." },
  },
  ENGINEERING_PHYSICS_MECHANICS: {
    archetype: "ENGINEERING_PHYSICS_MECHANICS",
    title: "Serbest cisim diyagramı ve formülün mantığı",
    setting: "fluid",
    body: { label: "Cisim" },
    vectors: [
      { symbol: "F_1", label: "Yukarı yönlü kuvvet", direction: "up", magnitude: 5 },
      { symbol: "G", label: "Ağırlık", direction: "down", magnitude: 3 },
      { symbol: "F_2", label: "Yatay itme", direction: "right", magnitude: 2 },
      { symbol: "F_3", label: "Çapraz kuvvet", direction: "up_left", magnitude: 1 },
    ],
    logic: {
      formula: "F_1 = a · b · c",
      drivers: [
        { symbol: "a", label: "Birinci değişken artarsa", effect: "up" },
        { symbol: "b", label: LONG, effect: "up" },
        { symbol: "c", label: "Üçüncü değişken azalırsa", effect: "down" },
      ],
      distractors: [{ symbol: "x", label: "Formülde yer almayan çeldirici" }],
    },
  },
  ARCHITECTURE_SPATIAL_BLUEPRINT: {
    archetype: "ARCHITECTURE_SPATIAL_BLUEPRINT",
    title: "Kesitte yapı elemanları ve yük aktarımı",
    view: "section",
    theme: "night",
    elements: [
      { label: "Taşıyıcı aks", role: "Yükü döşemeden temele aktaran düşey eleman dizisi" },
      { label: "Cephe katmanı", role: "Dış kabuk; ısı ve nemi denetler" },
      { label: "Açıklık", role: LONG },
      { label: "Döşeme kesiti", role: "Katı ayıran yatay taşıyıcı" },
    ],
    dimension: { label: "Aks aralığı" },
    flow: "both",
  },
  LAW_SOCIAL_FLOWCHART: {
    archetype: "LAW_SOCIAL_FLOWCHART",
    title: "Şart, çoğunluk ve istisna akışı",
    decision: { question: "Şart sağlandı mı?", yes: "İşlem geçerli sayılır ve sonuç doğar", no: "İşlem kurulmaz; ikinci yola geçilir" },
    majority: [
      { label: "Nitelikli çoğunluk", fraction: "3/5", count: 360, total: 600 },
      { label: "Yüksek çoğunluk", fraction: "2/3", count: 400, total: 600 },
    ],
    timeline: [
      { date: "1. aşama", label: "Teklif" },
      { date: "2. aşama", label: "Görüşme" },
      { date: "3. aşama", label: "Oylama" },
      { date: "4. aşama", label: LONG },
    ],
    ruleVsException: { rule: ["Genel kural ilk durumda uygulanır", LONG], exception: ["İstisna yalnız sayılan hâllerde"] },
  },
  MATH_ALGORITHMIC_GRAPH: {
    archetype: "MATH_ALGORITHMIC_GRAPH",
    title: "Eğrinin kritik noktaları ve integral alanı",
    mode: "integral",
    curve: { family: "quadratic", expression: "f(x) = ax² + bx + c", points: [{ kind: "vertex", label: "Tepe" }, { kind: "root", label: "Kök" }, { kind: "y_intercept", label: "y-kesişimi" }] },
    integral: { from: "a", to: "b", label: "Taralı alan" },
    steps: ["Fonksiyonu yaz", "Sınırları belirle", LONG],
  },
  DOCUMENT_FIGURE_SPOTLIGHT: {
    archetype: "DOCUMENT_FIGURE_SPOTLIGHT",
    title: "Belgendeki tabloda kritik hücreler",
    page: 4,
    figure: {
      kind: "table",
      caption: "Tablo 1. Belgedeki karşılaştırma",
      columns: ["Ölçüt", "Birinci", "İkinci"],
      rows: [
        ["Satır bir", "Değer A", "Değer B"],
        ["Satır iki", "Değer C", LONG],
        ["Satır üç", "Değer E", "Değer F"],
      ],
    },
    spots: [
      { row: 0, col: 1, label: "Birinci vurgu", note: "Bu hücre sınavda doğrudan sorulur" },
      { row: 2, col: 2, label: "İkinci vurgu", note: LONG },
    ],
  },
};

const ARCHETYPE_LAYOUTS: Record<VisualArchetype, (scene: VisualScene, mode: SceneMode, chrome: SceneChrome) => SceneLayout> = {
  MEDICAL_BIOLOGY_PATHWAY: (s, m, c) => layoutMedicalPathway(s as never, sceneFrame(m, c)),
  ENGINEERING_PHYSICS_MECHANICS: (s, m, c) => layoutMechanics(s as never, sceneFrame(m, c)),
  ARCHITECTURE_SPATIAL_BLUEPRINT: (s, m, c) => layoutBlueprint(s as never, sceneFrame(m, c)),
  LAW_SOCIAL_FLOWCHART: (s, m, c) => layoutLawDecision(s as never, sceneFrame(m, c)),
  MATH_ALGORITHMIC_GRAPH: (s, m, c) => layoutMathGraph(s as never, sceneFrame(m, c)),
  DOCUMENT_FIGURE_SPOTLIGHT: (s, m, c) => layoutDocumentSpotlight(s as never, sceneFrame(m, c)),
};

const MODES: SceneMode[] = ["9:16", "16:9"];
const CHROMES: SceneChrome[] = ["video", "lesson"];
const DUMP = process.env.VISUAL_SCENES_DUMP;

function dump(name: string, html: string) {
  if (!DUMP) return;
  mkdirSync(DUMP, { recursive: true });
  writeFileSync(`${DUMP}/${name}.svg`, html);
}

describe("6 arketip × 2 mod render (Faz 1-B)", () => {
  for (const archetype of VISUAL_ARCHETYPES) {
    const scene = parseVisualScene(RAW[archetype]);
    for (const mode of MODES) {
      it(`${archetype} ${mode}: hatasız render, doğru viewBox, sıfır taşma ve çakışma`, () => {
        expect(scene, `${archetype} şeması`).not.toBeNull();
        for (const chrome of CHROMES) {
          const { container } = render(<VisualSceneRenderer scene={scene!} mode={mode} chrome={chrome} animate="none" />);
          const svg = container.querySelector("svg.cp-vs")!;
          expect(svg).not.toBeNull();
          expect(svg.getAttribute("data-archetype")).toBe(archetype);
          expect(svg.getAttribute("viewBox")).toBe(mode === "9:16" ? "0 0 360 640" : "0 0 640 360");
          expect(svg.getAttribute("data-safe-bottom")).toBe(String(SAFE_BOTTOM_MARGIN[chrome][mode]));
          expect(svg.querySelectorAll("text").length).toBeGreaterThan(4);
          // Düz metin kutusu değil: çizim öğeleri (çizgi/yol/daire) var.
          expect(svg.querySelectorAll("line, path, circle, polyline, polygon, ellipse").length).toBeGreaterThan(6);
          dump(`${archetype}-${mode.replace(":", "x")}-${chrome}`, container.innerHTML);
          cleanup();
          const issues = layoutIssues(ARCHETYPE_LAYOUTS[archetype](scene!, mode, chrome));
          expect(issues, `${archetype} ${mode} ${chrome}`).toEqual([]);
        }
      });
    }
  }

  it("animasyon: çizgiler stroke-dashoffset (pathLength=1), yazılar fade-in", () => {
    const scene = parseVisualScene(RAW.MEDICAL_BIOLOGY_PATHWAY)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="9:16" />);
    const svg = container.querySelector("svg")!;
    expect(svg.classList.contains("is-animated")).toBe(true);
    const drawn = svg.querySelectorAll(".cp-vs-draw");
    expect(drawn.length).toBeGreaterThan(4);
    drawn.forEach((node) => expect(node.getAttribute("pathLength")).toBe("1"));
    expect(svg.querySelectorAll(".cp-vs-fade").length).toBeGreaterThan(4);
  });

  it("tıp: aktivasyon yeşil parlayan ok, inhibisyonda kırmızı [X], TUS / Klinik Spotu rozeti", () => {
    const scene = parseVisualScene(RAW.MEDICAL_BIOLOGY_PATHWAY)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="16:9" />);
    expect(container.querySelectorAll('[data-effect="activate"]').length).toBe(3);
    expect(container.querySelectorAll('[data-barrier="x"]').length).toBe(1);
    // 19 Kasım 2026: rozet disipline bağlı (biyoloji öğrencisi "TUS" görmez); disiplinsiz sahnede "SPOT BİLGİ".
    expect(container.textContent).toContain("SPOT BİLGİ");
    expect(container.textContent).not.toContain("TUS");
    expect(container.querySelectorAll("[data-role]").length).toBe(5);
  });

  it("fizik: büyüklük kalınlığa ve uzunluğa yansır, çeldirici üstü çizili", () => {
    const scene = parseVisualScene(RAW.ENGINEERING_PHYSICS_MECHANICS)!;
    const layout = layoutMechanics(scene as never, sceneFrame("16:9", "lesson"));
    const [strong, , weak] = layout.vectors;
    const len = (v: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(v.x2 - v.x1, v.y2 - v.y1);
    expect(strong!.width).toBeGreaterThan(weak!.width);
    expect(len(strong!)).toBeGreaterThan(len(weak!));
    const { container } = render(<VisualSceneRenderer scene={scene} mode="16:9" />);
    expect(container.textContent).toContain("FORMÜLÜN MANTIĞI");
    expect(container.textContent).toContain("FORMÜLDE YOK");
    expect(container.querySelectorAll('[data-row="distractor"]').length).toBe(1);
    expect(container.querySelectorAll("[data-thickness]").length).toBe(3);
  });

  it("mimarlık: numaralı pinler, ölçü oku ve aks balonları", () => {
    const scene = parseVisualScene(RAW.ARCHITECTURE_SPATIAL_BLUEPRINT)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="9:16" />);
    expect(container.querySelectorAll("[data-pin]").length).toBe(4);
    expect(container.textContent).toContain("Aks aralığı");
    expect(container.textContent).toMatch(/A[\s\S]*B[\s\S]*C/);
  });

  it("hukuk: evet/hayır dalları, 3/5 = 360 ve 2/3 = 400 barometresi, zaman çizgisi, kural/istisna", () => {
    const scene = parseVisualScene(RAW.LAW_SOCIAL_FLOWCHART)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="16:9" />);
    expect(container.querySelector('[data-branch="yes"]')).not.toBeNull();
    expect(container.querySelector('[data-branch="no"]')).not.toBeNull();
    expect(container.textContent).toContain("3/5 = 360");
    expect(container.textContent).toContain("2/3 = 400");
    expect(container.querySelector('[data-ratio="0.600"]')).not.toBeNull();
    expect(container.querySelector('[data-section="timeline"]')).not.toBeNull();
    expect(container.textContent).toContain("GENEL KURAL");
    expect(container.textContent).toContain("İSTİSNA");
  });

  it("matematik: eğri, taranmış alan, geometri yay ve kenar eşleştirmesi", () => {
    const scene = parseVisualScene(RAW.MATH_ALGORITHMIC_GRAPH)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="9:16" />);
    expect(container.querySelector('[data-area="integral"]')).not.toBeNull();
    for (const family of ["linear", "cubic", "exponential", "logarithmic", "sine", "absolute"] as const) {
      const curve = parseVisualScene({ ...(RAW.MATH_ALGORITHMIC_GRAPH as object), mode: "function", curve: { family, expression: "f(x)", points: [{ kind: "root", label: "Kök" }, { kind: "max", label: "Maks" }] } })!;
      for (const mode of MODES) expect(layoutIssues(layoutMathGraph(curve as never, sceneFrame(mode, "video"))), `${family} ${mode}`).toEqual([]);
    }
    for (const kind of ["triangle", "right_triangle", "rectangle", "parallelogram", "circle"] as const) {
      const geo = parseVisualScene({
        archetype: "MATH_ALGORITHMIC_GRAPH",
        title: "Şekilde açı ve kenar eşleştirmesi",
        mode: "geometry",
        shape: { kind, angles: [{ label: "α", group: 1 }, { label: "β", group: 2 }, { label: "α", group: 1 }], sides: [{ label: "a", group: 1 }, { label: "b", group: 2 }] },
        steps: ["Eşit açıları işaretle", "Kenarları eşle"],
      })!;
      for (const mode of MODES) expect(layoutIssues(layoutMathGraph(geo as never, sceneFrame(mode, "video"))), `${kind} ${mode}`).toEqual([]);
      const { container: c2 } = render(<VisualSceneRenderer scene={geo} mode="16:9" />);
      expect(c2.querySelector(`[data-shape="${kind}"]`)).not.toBeNull();
      cleanup();
    }
  });

  it("belge: gerçek tablo hücreleri, spotlight halkası ve çağrı okları; görsel sayfa da çizilir", () => {
    const scene = parseVisualScene(RAW.DOCUMENT_FIGURE_SPOTLIGHT)!;
    const { container } = render(<VisualSceneRenderer scene={scene} mode="16:9" />);
    expect(container.querySelector('[data-table="source"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-spot]").length).toBe(2);
    expect(container.querySelectorAll("polyline").length).toBe(2);
    expect(container.textContent).toContain("Değer A");
    cleanup();
    const image = parseVisualScene({
      archetype: "DOCUMENT_FIGURE_SPOTLIGHT",
      title: "Yüklenen sayfadaki şekil",
      figure: { kind: "image", caption: "Şekil 2", href: "https://example.com/sayfa.webp", aspect: 0.75 },
      spots: [{ x: 0.3, y: 0.4, label: "Nokta", note: "Açıklama" }],
    })!;
    for (const mode of MODES) expect(layoutIssues(layoutDocumentSpotlight(image as never, sceneFrame(mode, "lesson")))).toEqual([]);
    const { container: c2 } = render(<VisualSceneRenderer scene={image} mode="9:16" />);
    expect(c2.querySelector("image")?.getAttribute("href")).toBe("https://example.com/sayfa.webp");
  });
});

const REEL: Record<string, unknown> = {
  hook: { kind: "hook", question: "Sınavda en çok hangi basamağın sonucu sorulur ve neden?", visualTitle: "Tek basamak, bütün zincir" },
  comparison: {
    kind: "comparison",
    title: "İki kavram yan yana",
    mode: "concept",
    left: "Birinci kavram",
    right: "İkinci kavram",
    rows: [
      { label: "Tanım", left: "Kısa tanım bir", right: "Kısa tanım iki", winner: "none" },
      { label: "Ayırt edici", left: LONG, right: "Belirgin fark", winner: "right" },
      { label: "Sınavda", left: "Sık sorulur", right: "Nadiren", winner: "left" },
    ],
  },
  exam_trap: { kind: "exam_trap", title: "En sık düşülen karışıklık", wrong: "İki kavram aynı şeydir sanmak", right: "Birinci kavram koşula, ikincisi sonuca bakar", tell: "Soru kökündeki koşul kelimesine bak" },
  memory_nail: {
    kind: "memory_nail",
    mnemonic: "TRİHK",
    keys: [
      { letter: "T", meaning: "Tetikleyici" },
      { letter: "R", meaning: "Reseptör" },
      { letter: "İ", meaning: "İkincil haberci" },
      { letter: "H", meaning: "Hedef" },
      { letter: "K", meaning: "Klinik bulgu" },
    ],
    summary: "Zinciri sırayla say: tetikleyiciden kliniğe beş basamak, blokaj nerede ise bulgu oradan sonra değişir.",
  },
};

const REEL_LAYOUTS = {
  hook: (v: ReelVisual, m: SceneMode) => layoutReelHook(v as never, sceneFrame(m, "video")),
  comparison: (v: ReelVisual, m: SceneMode) => layoutComparison(v as never, sceneFrame(m, "video")),
  exam_trap: (v: ReelVisual, m: SceneMode) => layoutExamTrap(v as never, sceneFrame(m, "video")),
  memory_nail: (v: ReelVisual, m: SceneMode) => layoutMemoryNail(v as never, sceneFrame(m, "video")),
} as const;

describe("sketch_reel 5 sahneli akış sahneleri", () => {
  for (const [kind, raw] of Object.entries(REEL)) {
    for (const mode of MODES) {
      it(`${kind} ${mode}: render ve sıfır taşma/çakışma`, () => {
        const visual = parseReelVisual(raw)!;
        expect(visual).not.toBeNull();
        const { container } = render(<ReelSceneRenderer visual={visual} mode={mode} animate="none" />);
        expect(container.querySelector("svg.cp-vs")).not.toBeNull();
        dump(`reel-${kind}-${mode.replace(":", "x")}`, container.innerHTML);
        expect(layoutIssues(REEL_LAYOUTS[kind as keyof typeof REEL_LAYOUTS](visual, mode))).toEqual([]);
      });
    }
  }

  it("ana çizim sahnesi arketip bileşenini video çerçevesinde çizer", () => {
    const visual = parseReelVisual({ kind: "archetype", scene: RAW.LAW_SOCIAL_FLOWCHART })!;
    const { container } = render(<ReelSceneRenderer visual={visual} mode="9:16" playing={false} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-archetype")).toBe("LAW_SOCIAL_FLOWCHART");
    expect(svg.getAttribute("data-safe-bottom")).toBe(String(SAFE_BOTTOM_MARGIN.video["9:16"]));
    expect(svg.classList.contains("is-paused")).toBe(true);
  });

  it("tuzak sahnesi kırmızı ✗ ve yeşil ✓ panelini yan yana gösterir", () => {
    const visual = parseReelVisual(REEL.exam_trap)!;
    const { container } = render(<ReelSceneRenderer visual={visual} mode="16:9" />);
    expect(container.querySelector('[data-panel="wrong"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="right"]')).not.toBeNull();
    expect(container.textContent).toContain("SAKIN BUNA DÜŞME!");
  });
});

describe("metin sığdırma ve sınıflandırıcı", () => {
  it("fitText kutuyu aşmaz; gerekince küçültür ve keser", () => {
    const fitted = fitText(LONG.repeat(3), { maxWidth: 120, maxLines: 2, fontSize: 14, minFontSize: 10 });
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(fitted.truncated).toBe(true);
    for (const line of fitted.lines) expect(measureText(line, fitted.fontSize)).toBeLessThanOrEqual(120);
    const word = fitText("Çokuzunbirtekkelimeolanbaşlıkbölünmeli", { maxWidth: 60, maxLines: 4, fontSize: 12 });
    for (const line of word.lines) expect(measureText(line, word.fontSize)).toBeLessThanOrEqual(60);
  });

  it("disiplini otomatik sınıflandırır ve arketipe bağlar", () => {
    expect(classifyAcademicDomain({ prepTitle: "TUS Hazırlık", topicLabel: "Reseptör ve enzim inhibisyonu" }).visualArchetype).toBe("MEDICAL_BIOLOGY_PATHWAY");
    expect(classifyAcademicDomain({ prepTitle: "Fizik vize", topicLabel: "Kuvvet ve basınç" }).visualArchetype).toBe("ENGINEERING_PHYSICS_MECHANICS");
    expect(classifyAcademicDomain({ prepTitle: "Mimarlık final", topicLabel: "Cephe ve kesit çizimi" }).visualArchetype).toBe("ARCHITECTURE_SPATIAL_BLUEPRINT");
    expect(classifyAcademicDomain({ prepTitle: "KPSS", topicLabel: "Anayasa ve yasama" }).visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    expect(classifyAcademicDomain({ prepTitle: "Matematik", topicLabel: "Türev ve integral" }).visualArchetype).toBe("MATH_ALGORITHMIC_GRAPH");
    const doc = classifyAcademicDomain({
      mode: "document",
      prepTitle: "Ara sınav",
      topicLabel: "Bölüm 3",
      pages: [{ text: "Başlık\nA | B | C\n1 | 2 | 3\n4 | 5 | 6\n7 | 8 | 9" }],
    });
    expect(doc.visualArchetype).toBe("DOCUMENT_FIGURE_SPOTLIGHT");
    expect(doc.sourceTable?.columns).toEqual(["A", "B", "C"]);
    expect(detectSourceTable([{ text: "düz paragraf metni\nikinci satır" }])).toBeNull();
    for (const archetype of VISUAL_ARCHETYPES) expect(ARCHETYPE_LABEL[archetype].length).toBeGreaterThan(3);
  });
});

describe("Faz 1-B denetimi (19 Kasım 2026)", () => {
  it("spot rozeti disipline bağlı: klinikte KLİNİK SPOTU, biyolojide SPOT BİLGİ", async () => {
    const { spotKicker } = await import("@/components/learning/visual-scenes/MedicalPathwayScene");
    expect(spotKicker("medicine")).toBe("KLİNİK SPOTU");
    expect(spotKicker("pharmacy")).toBe("KLİNİK SPOTU");
    expect(spotKicker("biology")).toBe("SPOT BİLGİ");
    expect(spotKicker()).toBe("SPOT BİLGİ");
  });

  it("azalan üstel e^(−x) eksenin üstünde (y > 0) ve azalır; aşağı açılan parabol y'de aynalanır", async () => {
    const { CURVE_FAMILY_DEFS, flippedFamily } = await import("@/components/learning/visual-scenes/MathGraphScene");
    const decay = flippedFamily(CURVE_FAMILY_DEFS.exponential, "exponential");
    for (const x of [-2, 0, 1, 2]) expect(decay.f(x)).toBeGreaterThan(0);
    expect(decay.f(-1)).toBeGreaterThan(decay.f(1));
    expect(decay.x[0]).toBeLessThan(decay.x[1]);
    expect(decay.y).toEqual(CURVE_FAMILY_DEFS.exponential.y);
    const down = flippedFamily(CURVE_FAMILY_DEFS.quadratic, "quadratic");
    expect(down.f(0.5)).toBeCloseTo(-CURVE_FAMILY_DEFS.quadratic.f(0.5));
  });
});

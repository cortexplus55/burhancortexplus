// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DOMAIN_ARCHETYPE, VISUAL_ARCHETYPES, type AcademicDomain, type VisualArchetype } from "@/lib/learning/visual-scenes/archetype";
import { sceneFrame, layoutIssues, type SceneChrome, type SceneLayout, type SceneMode } from "@/lib/learning/visual-scenes/layout";
import { parseReelVisual, parseVisualScene, type ReelVisual, type VisualScene } from "@/lib/learning/visual-scenes/schema";
import { layoutReelHook } from "@/components/learning/visual-scenes/ReelHookScene";
import { layoutComparison } from "@/components/learning/visual-scenes/ComparisonMatrixScene";
import { layoutExamTrap } from "@/components/learning/visual-scenes/ExamTrapScene";
import { layoutMemoryNail } from "@/components/learning/visual-scenes/MemoryNailScene";
import { layoutMedicalPathway } from "@/components/learning/visual-scenes/MedicalPathwayScene";
import { layoutMechanics } from "@/components/learning/visual-scenes/MechanicsVectorScene";
import { layoutBlueprint } from "@/components/learning/visual-scenes/ArchitecturalBlueprintScene";
import { layoutLawDecision } from "@/components/learning/visual-scenes/LawDecisionScene";
import { layoutMathGraph } from "@/components/learning/visual-scenes/MathGraphScene";
import { layoutDocumentSpotlight } from "@/components/learning/visual-scenes/DocumentSpotlightScene";

/*
  Faz 1-B düzeltmesi (19 Kasım 2026): orta uzunlukta (≈ 55 karakter) metinlerle hiçbir arketipte, hiçbir disiplin
  rozetiyle, iki oranda ve iki yüzeyde (video / ders) kesik yazı ("…") kalmaz; sarılır ya da yeniden yerleşir.
  Fikstürler visual-scenes.test.tsx'teki jenerik yapıların orta uzunluktaki sürümüdür.
*/
const LONG = "Bu açıklama orta uzunlukta yazıldı ve sarılarak sığmalı";

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

type Layout = (scene: VisualScene, mode: SceneMode, chrome: SceneChrome, domain?: AcademicDomain) => SceneLayout;
const LAYOUTS: Record<VisualArchetype, Layout> = {
  MEDICAL_BIOLOGY_PATHWAY: (s, m, c, d) => layoutMedicalPathway(s as never, sceneFrame(m, c), d),
  ENGINEERING_PHYSICS_MECHANICS: (s, m, c, d) => layoutMechanics(s as never, sceneFrame(m, c), d),
  ARCHITECTURE_SPATIAL_BLUEPRINT: (s, m, c, d) => layoutBlueprint(s as never, sceneFrame(m, c), d),
  LAW_SOCIAL_FLOWCHART: (s, m, c, d) => layoutLawDecision(s as never, sceneFrame(m, c), d),
  MATH_ALGORITHMIC_GRAPH: (s, m, c, d) => layoutMathGraph(s as never, sceneFrame(m, c), d),
  DOCUMENT_FIGURE_SPOTLIGHT: (s, m, c) => layoutDocumentSpotlight(s as never, sceneFrame(m, c)),
};

describe("kesik yazı yok (orta uzunlukta metin)", () => {
  for (const archetype of VISUAL_ARCHETYPES) {
    it(`${archetype}: her disiplin rozeti, 9:16 / 16:9, video / ders`, () => {
      const scene = parseVisualScene(RAW[archetype])!;
      const domains = (Object.keys(DOMAIN_ARCHETYPE) as AcademicDomain[]).filter((domain) => DOMAIN_ARCHETYPE[domain] === archetype);
      const problems: string[] = [];
      for (const domain of [undefined, ...domains]) {
        for (const mode of ["9:16", "16:9"] as SceneMode[]) {
          for (const chrome of ["video", "lesson"] as SceneChrome[]) {
            const layout = LAYOUTS[archetype](scene, mode, chrome, domain);
            const cut = layout.texts.filter((box) => box.truncated).map((box) => box.id);
            const issues = layoutIssues(layout).map((issue) => issue.detail);
            if (cut.length || issues.length) problems.push(`${domain ?? "-"} ${mode} ${chrome}: ${[...cut, ...issues].join(", ")}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }

  for (const [kind, raw] of Object.entries(REEL)) {
    it(`reel ${kind}: 9:16 / 16:9`, () => {
      const visual = parseReelVisual(raw)!;
      const problems: string[] = [];
      for (const mode of ["9:16", "16:9"] as SceneMode[]) {
        const layout = REEL_LAYOUTS[kind as keyof typeof REEL_LAYOUTS](visual, mode);
        const cut = layout.texts.filter((box) => box.truncated).map((box) => box.id);
        if (cut.length) problems.push(`${mode}: ${cut.join(", ")}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

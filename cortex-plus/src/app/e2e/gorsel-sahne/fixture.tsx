"use client";

import { VideoLessonPlayer } from "@/components/parity/video-lesson";
import { LessonVisualScene } from "@/components/learning/visual-scenes/LessonVisualScene";
import { VISUAL_ARCHETYPES, type AcademicDomain, type VisualArchetype } from "@/lib/learning/visual-scenes/archetype";
import { parseReelVisual, REEL_BEATS, type ReelBeat } from "@/lib/learning/visual-scenes/schema";

/*
  Yalnız test fikstürü (E2E_FIXTURE=1): içerik jeneriktir, öğrenciye gösterilmez. Yedi arketip (kavram yapısının altı biçimi) ders ekranında
  ve 5 sahneli akış oynatıcıda nasıl görünüyor, dar ve geniş ekranda göz kontrolü için.
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
  CONCEPT_STRUCTURE_VISUALIZER: {
    archetype: "CONCEPT_STRUCTURE_VISUALIZER",
    title: "Başlangıç koşulundan sonuca dört aşamalı süreç",
    structure: "process",
    items: [
      { id: "a", label: "Birinci aşama", detail: "Sürecin başladığı koşul" },
      { id: "b", label: "İkinci aşama", detail: LONG },
      { id: "c", label: "Üçüncü aşama", detail: "Ara sonuç belirginleşir" },
      { id: "d", label: "Sonuç", detail: "Sınavda en çok sorulan nokta" },
    ],
    takeaway: "Aşamaların sırası sorulur; ikinci aşama atlanırsa sonuç değişir.",
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


/** Eğilim sahnesi (kuvvet olmayan içerik): ok etiketle çelişik gelir, ayrıştırma onarır. */
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

const NARRATION: Record<ReelBeat, string> = {
  hook: "Bu soruyu bir düşün; cevabı sahnenin sonunda birlikte kuracağız.",
  main_diagram: "Şimdi ana çizime bak: her basamak bir sonrakini tetikliyor ve sınav sorusu tam buradan çıkıyor.",
  comparison: "İki kavramı yan yana koyalım; farkı tek satırda gör.",
  exam_trap: "Sakın buna düşme: iki kavramı karıştırmak en sık yapılan hata.",
  memory_nail: "Akılda tutmak için baş harfleri say ve tek cümlelik özeti hatırla.",
};

const ARCHETYPE_DOMAIN: Record<VisualArchetype, AcademicDomain> = {
  MEDICAL_BIOLOGY_PATHWAY: "medicine",
  ENGINEERING_PHYSICS_MECHANICS: "physics",
  ARCHITECTURE_SPATIAL_BLUEPRINT: "architecture",
  LAW_SOCIAL_FLOWCHART: "law",
  MATH_ALGORITHMIC_GRAPH: "mathematics",
  DOCUMENT_FIGURE_SPOTLIGHT: "document_figure",
  CONCEPT_STRUCTURE_VISUALIZER: "history",
};

/** Kavram yapısının öbür beş biçimi (süreç ana fikstürde): göz kontrolü için ayrı bölümler. */
const CONCEPT_EXTRA: { structure: string; domain: AcademicDomain; raw: unknown }[] = [
  {
    structure: "matrix",
    domain: "literature",
    raw: {
      archetype: "CONCEPT_STRUCTURE_VISUALIZER",
      title: "Üç dönemin ölçütlere göre karşılaştırması",
      structure: "matrix",
      columns: ["Birinci dönem", "İkinci dönem", "Üçüncü dönem"],
      comparisonRows: [
        { label: "Ana tema", values: ["Birinci tema", "İkinci tema", "Üçüncü tema"], highlight: 1 },
        { label: "Biçim", values: ["Kalıplı", "Serbest", "Karma"] },
        { label: "Dil", values: ["Ağır", "Sade", LONG] },
      ],
      takeaway: "Ayırt edici ölçüt temadır.",
    },
  },
  {
    structure: "pyramid",
    domain: "psychology",
    raw: {
      archetype: "CONCEPT_STRUCTURE_VISUALIZER",
      title: "Tepeden tabana beş katmanlı yapı",
      structure: "pyramid",
      items: [
        { label: "Tepe katman", detail: "En az öğe, en üst düzey" },
        { label: "Dördüncü katman" },
        { label: "Üçüncü katman", detail: "Ara düzey" },
        { label: "İkinci katman" },
        { label: "Taban katman", detail: "Bütün yapının dayanağı" },
      ],
    },
  },
  {
    structure: "timeline",
    domain: "history",
    raw: {
      archetype: "CONCEPT_STRUCTURE_VISUALIZER",
      title: "Dört durakta kronoloji",
      structure: "timeline",
      items: [
        { date: "Birinci dönem", label: "Başlangıç olayı", detail: "Sürecin ilk adımı" },
        { date: "İkinci dönem", label: "Gelişme" },
        { date: "Üçüncü dönem", label: "Dönüm noktası", detail: LONG },
        { date: "Dördüncü dönem", label: "Sonuç" },
      ],
    },
  },
  {
    structure: "cause_effect",
    domain: "geography",
    raw: {
      archetype: "CONCEPT_STRUCTURE_VISUALIZER",
      title: "İki nedenden sonuca uzanan ağ",
      structure: "cause_effect",
      items: [
        { id: "n1", label: "Birinci neden" },
        { id: "n2", label: "İkinci neden" },
        { id: "m", label: "Ara etki" },
        { id: "s", label: "Sonuç" },
      ],
      links: [
        { from: "n1", to: "m", effect: "increase" },
        { from: "n2", to: "m", effect: "decrease" },
        { from: "m", to: "s", effect: "increase" },
        { from: "n1", to: "s" },
      ],
    },
  },
  {
    structure: "supply_demand",
    domain: "economics",
    raw: {
      archetype: "CONCEPT_STRUCTURE_VISUALIZER",
      title: "Talep artınca yeni denge",
      structure: "supply_demand",
      market: { equilibrium: "Piyasa dengesi", shift: { curve: "demand", direction: "right", label: "Talep artar" } },
      pedagogicalLevel: 3,
    },
  },
];

function reelFor(beat: ReelBeat, archetype: VisualArchetype): unknown {
  return beat === "main_diagram" ? { kind: "archetype", scene: RAW[archetype] } : REEL[beat];
}

export function GorselSahneFixture({ mod, sahne, arketip }: { mod: string; sahne: number; arketip: string }) {
  const archetype = (VISUAL_ARCHETYPES as readonly string[]).includes(arketip) ? (arketip as VisualArchetype) : "MEDICAL_BIOLOGY_PATHWAY";
  if (mod === "video") {
    const beats = Number.isInteger(sahne) && sahne >= 0 && sahne < REEL_BEATS.length ? [REEL_BEATS[sahne]!] : [...REEL_BEATS];
    return (
      <VideoLessonPlayer
        prepId="fikstur"
        videoId="fikstur"
        title="Fikstür: 5 sahneli akış"
        topicLabel="Konu A"
        styleLabel="1 Dk Çizimli Video"
        completed={false}
        scenes={beats.map((beat) => ({
          narration: NARRATION[beat],
          durationMs: 9000,
          imageUrl: "",
          audioUrl: "",
          beat,
          reel: parseReelVisual(reelFor(beat, archetype), beat, archetype) ?? undefined,
          academicDomain: ARCHETYPE_DOMAIN[archetype],
        }))}
      />
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4" data-testid="gorsel-sahne-ders">
      {VISUAL_ARCHETYPES.map((item) => (
        <section key={item} data-fixture-archetype={item}>
          <LessonVisualScene id={`sahne-${item}`} block={{ scene: RAW[item], visualArchetype: item, academicDomain: ARCHETYPE_DOMAIN[item] }} />
        </section>
      ))}
      {CONCEPT_EXTRA.map((item) => (
        <section key={item.structure} data-fixture-concept={item.structure}>
          <LessonVisualScene id={`sahne-kavram-${item.structure}`} block={{ scene: item.raw, visualArchetype: "CONCEPT_STRUCTURE_VISUALIZER", academicDomain: item.domain }} />
        </section>
      ))}
      <section data-fixture-trend="1">
        <LessonVisualScene id="sahne-egilim" block={{ scene: TREND_RAW, visualArchetype: "ENGINEERING_PHYSICS_MECHANICS", academicDomain: "chemistry" }} />
      </section>
    </main>
  );
}

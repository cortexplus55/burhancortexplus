// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { VideoLessonPlayer } from "@/components/parity/video-lesson";
import { LessonVisualScene } from "@/components/learning/visual-scenes/LessonVisualScene";
import { LESSON_V3_FORMAT, lessonV3Schema, readLessonV2, readLessonV3, visualBlockText } from "@/lib/learning/lesson-v3";
import { readPlayLessonV3, sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { parseVisualSceneCompletion, visualSceneGrounded, visualSceneSystem, visualSceneUserPrompt } from "@/lib/learning/teacher-lesson";
import { isSketchStored, parseSketchScript, sketchStructureIssues, sketchSystem } from "@/lib/learning/video-lesson";
import { parseReelVisual, parseVisualScene } from "@/lib/learning/visual-scenes/schema";
import { classifyAcademicDomain } from "@/lib/learning/visual-scenes/archetype";

afterEach(cleanup);

/* Jenerik veri: gerçek konu, formül ya da hazırlık kimliği yok. */
const LAW_SCENE = {
  archetype: "LAW_SOCIAL_FLOWCHART",
  title: "Şart ve sonuç akışı",
  decision: { question: "Birinci şart sağlandı mı?", yes: "Birinci sonuç doğar", no: "İkinci yola geçilir" },
  majority: [{ label: "Nitelikli çoğunluk", fraction: "3/5", count: 360, total: 600 }],
  timeline: [],
  ruleVsException: { rule: ["Genel kural uygulanır"], exception: ["İstisna sayılan hâllerde"] },
};

function screenOf(concept: string, text: string) {
  return {
    heading: concept,
    concept,
    blocks: [
      { type: "text", text },
      {
        type: "check",
        check: { type: "mcq", prompt: `${concept} için hangisi doğrudur?`, options: ["Birinci", "İkinci", "Üçüncü", "Dördüncü"], answerIndex: 0, explanation: "Birinci doğrudur çünkü metinde öyle geçer." },
      },
    ],
  };
}

const LESSON = {
  format: LESSON_V3_FORMAT,
  title: "Şart ve sonuç",
  objective: "Şart ve sonucu ayırt etmek.",
  overview: "Şart, sonuç ve çoğunluk.",
  screens: [
    screenOf("Birinci kavram", "Birinci şart sağlandı ise birinci sonuç doğar. Nitelikli çoğunluk 3/5 yani 600 üyede 360 oydur."),
    screenOf("İkinci kavram", "Şart sağlanmazsa ikinci yola geçilir. Genel kural uygulanır; istisna sayılan hâllerde geçerlidir."),
  ],
};

describe("ders: visual_scene bloğu ve disiplin alanları", () => {
  it("eski ders (alan yok) aynen okunur; yeni alanlar ve blok şemadan geçer", () => {
    const old = readLessonV3(LESSON);
    expect(old).not.toBeNull();
    expect(old!.academicDomain).toBeUndefined();
    const withScene = {
      ...LESSON,
      academicDomain: "law",
      visualArchetype: "LAW_SOCIAL_FLOWCHART",
      screens: [LESSON.screens[0], { ...LESSON.screens[1], blocks: [LESSON.screens[1]!.blocks[0], { type: "visual_scene", academicDomain: "law", visualArchetype: "LAW_SOCIAL_FLOWCHART", scene: LAW_SCENE }, LESSON.screens[1]!.blocks[1]] }],
    };
    const parsed = lessonV3Schema.safeParse(withScene);
    expect(parsed.success).toBe(true);
    const block = parsed.data!.screens[1]!.blocks[1]!;
    expect(block.type).toBe("visual_scene");
    expect(visualBlockText(block)).toContain("3/5 = 360");
    // V2 görünümü sahneyi düz metin olarak kaybetmez; oynatma paketi bloğu ve alanları taşır.
    expect(JSON.stringify(readLessonV2(withScene))).toContain("Nitelikli çoğunluk");
    const play = readPlayLessonV3(sealLessonV3ForPlay(parsed.data!));
    expect(play?.screens[1]?.blocks.some((item) => item.type === "visual_scene")).toBe(true);
    expect((play as { visualArchetype?: string }).visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    // Bozuk sahne dersi düşürmez: yalnız blok atılır.
    const broken = { ...withScene, screens: [LESSON.screens[0], { ...LESSON.screens[1], blocks: [LESSON.screens[1]!.blocks[0], { type: "visual_scene", visualArchetype: "LAW_SOCIAL_FLOWCHART", scene: { title: "x" } }] }] };
    const brokenParsed = readLessonV3(broken);
    expect(brokenParsed?.screens[1]?.blocks.map((item) => item.type)).toEqual(["text"]);
  });

  it("tamamlama: temellenen sahne kavramın son ekranına, sorunun önüne girer; uydurma sayı reddedilir", () => {
    const lesson = readLessonV3(LESSON)!;
    const classification = classifyAcademicDomain({ prepTitle: "Hukuk vize", topicLabel: "Anayasa ve yasama", pages: [], mode: "topic" });
    expect(classification.visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    const system = visualSceneSystem(classification);
    expect(system).toContain("LAW_SOCIAL_FLOWCHART");
    expect(visualSceneUserPrompt(lesson, { pages: [], mode: "topic", topicLabel: "Konu", prepTitle: "Hazırlık" }, classification)).toContain("KAVRAMLAR");
    const added = parseVisualSceneCompletion(
      { type: "visual_scene", academicDomain: "law", visualArchetype: "LAW_SOCIAL_FLOWCHART", scene: LAW_SCENE, afterConcept: "İkinci kavram" },
      lesson,
      { pages: [], mode: "topic" },
      classification,
    );
    expect(added.verdict).toBe("added");
    const blocks = added.lesson!.screens[1]!.blocks.map((item) => item.type);
    expect(blocks).toEqual(["text", "visual_scene", "check"]);
    expect(added.lesson!.academicDomain).toBe("law");
    expect(added.lesson!.visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    const invented = parseVisualSceneCompletion(
      { scene: { ...LAW_SCENE, majority: [{ label: "Nitelikli çoğunluk", fraction: "2/3", count: 999, total: 600 }] } },
      lesson,
      { pages: [], mode: "topic" },
      classification,
    );
    expect(invented.verdict).toBe("ungrounded");
    expect(parseVisualSceneCompletion({ nothing: true }, lesson, { pages: [], mode: "topic" }, classification).verdict).toBe("unparsed");
    expect(visualSceneGrounded(parseVisualScene(LAW_SCENE)!, "tamamen ilgisiz bir metin")).toBe(false);
  });

  it("ders hattı: görsel sahne çağrısı yapılır, sahne derse girer, disiplin alanları yazılır", async () => {
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const systems: string[] = [];
    const result = await teacherLessonPipeline(
      {
        write: async (system, _user, onDelta) => {
          systems.push(system);
          const body = system.includes('"type":"visual_scene"')
            ? JSON.stringify({ type: "visual_scene", academicDomain: "law", visualArchetype: "LAW_SOCIAL_FLOWCHART", scene: LAW_SCENE, afterConcept: "İkinci kavram" })
            : systems.length === 1
              ? JSON.stringify(LESSON)
              : "";
          onDelta(body);
          return { text: body, finish: "stop" };
        },
      },
      { topicLabel: "Anayasa ve yasama", prepTitle: "Hukuk vize", pages: [], upcomingTopics: [], sanity: false, mode: "topic" },
    );
    expect(systems.some((system) => system.includes('"type":"visual_scene"'))).toBe(true);
    const lesson = result.lesson!;
    expect(lesson.screens.flatMap((screen) => screen.blocks).some((block) => block.type === "visual_scene")).toBe(true);
    expect(lesson.academicDomain).toBe("law");
    expect(lesson.visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    expect(info).toHaveBeenCalledWith("teacher_lesson_visual_scene", expect.objectContaining({ verdict: "added", archetype: "LAW_SOCIAL_FLOWCHART" }));
    info.mockRestore();
  });

  it("ders ekranı iki yerleşimi de çizer (16:9 geniş, 9:16 dar)", () => {
    const { container } = render(<LessonVisualScene id="s1" block={{ type: "visual_scene", visualArchetype: "LAW_SOCIAL_FLOWCHART", scene: LAW_SCENE } as never} />);
    expect(container.querySelector(".cp-vs-lesson-landscape svg")?.getAttribute("viewBox")).toBe("0 0 640 360");
    expect(container.querySelector(".cp-vs-lesson-portrait svg")?.getAttribute("viewBox")).toBe("0 0 360 640");
    cleanup();
    const { container: empty } = render(<LessonVisualScene id="s2" block={{ scene: { bozuk: true } }} />);
    expect(empty.innerHTML).toBe("");
  });
});

const REEL_SCENES = [
  { beat: "hook", sceneTitle: "Kilit soru", narration: "Sınavda en çok hangi şart sorulur, birlikte bakalım ve nedenini görelim hemen.", voice: "ada", visual: { kind: "hook", question: "Hangi şart sağlanınca birinci sonuç doğar?", visualTitle: "Tek şart, iki yol" } },
  { beat: "main_diagram", sceneTitle: "Karar akışı", narration: "Şart sağlanırsa birinci sonuç doğar, sağlanmazsa ikinci yola geçilir ve nitelikli çoğunluk aranır.", voice: "kerem", visual: { kind: "archetype", scene: LAW_SCENE } },
  { beat: "comparison", sceneTitle: "Kural ve istisna", narration: "Genel kural ilk durumda uygulanır, istisna ise yalnız sayılan hâllerde devreye girer, karıştırma.", voice: "ada", visual: { kind: "comparison", title: "Kural ve istisna", left: "Genel kural", right: "İstisna", rows: [{ label: "Ne zaman", left: "Her durumda", right: "Sayılan hâllerde", winner: "none" }, { label: "Sınavda", left: "Sık", right: "Çeldirici", winner: "left" }] } },
  { beat: "exam_trap", sceneTitle: "Sakın buna düşme", narration: "En sık hata istisnayı genel kural sanmaktır; doğrusu istisnanın yalnız sayılan hâllerde geçerli olmasıdır.", voice: "kerem", visual: { kind: "exam_trap", title: "Kural ile istisna", wrong: "İstisna her durumda uygulanır", right: "İstisna yalnız sayılan hâllerde uygulanır", tell: "Soru kökündeki sayılan hâl ifadesine bak" } },
  { beat: "memory_nail", sceneTitle: "Hafıza çivisi", narration: "Şart, sonuç, istisna diye üç adımı say; sınav sabahı bu sırayı hatırlaman yeterli olacak.", voice: "ada", visual: { kind: "memory_nail", mnemonic: "ŞSİ", keys: [{ letter: "Ş", meaning: "Şart" }, { letter: "S", meaning: "Sonuç" }, { letter: "İ", meaning: "İstisna" }], summary: "Önce şartı sor, sonra sonucu yaz, istisnayı yalnız sayılan hâlde uygula." } },
];

describe("sketch_reel: 5 sahneli akış", () => {
  it("istem arketip şemasını taşır; senaryo 5 sahneyle yapı denetiminden geçer", () => {
    const domain = classifyAcademicDomain({ prepTitle: "KPSS", topicLabel: "Anayasa ve yasama", pages: [], mode: "topic" });
    expect(sketchSystem("topic", domain)).toContain("LAW_SOCIAL_FLOWCHART");
    const script = parseSketchScript({ title: "Şart", academicDomain: "law", visualArchetype: "LAW_SOCIAL_FLOWCHART", scenes: REEL_SCENES }, "Şart", domain);
    expect(script?.scenes.map((item) => item.beat)).toEqual(["hook", "main_diagram", "comparison", "exam_trap", "memory_nail"]);
    expect(script?.scenes.map((item) => item.reel?.kind)).toEqual(["hook", "archetype", "comparison", "exam_trap", "memory_nail"]);
    expect(script?.visualArchetype).toBe("LAW_SOCIAL_FLOWCHART");
    expect(script?.academicDomain).toBe("law");
    expect(sketchStructureIssues(script!).filter((issue) => issue.severity === "high")).toEqual([]);
    // Sıra bozuksa (tuzak sahnesi yok) yüksek sorun.
    const missing = parseSketchScript({ title: "Şart", scenes: REEL_SCENES.filter((item) => item.beat !== "exam_trap") }, "Şart", domain);
    expect(sketchStructureIssues(missing!).some((issue) => issue.severity === "high")).toBe(true);
    // Belgeli videoda ana çizimin sayısı kaynakta yoksa yüksek sorun.
    expect(sketchStructureIssues(script!, "ilgisiz kaynak metni").some((issue) => /ana çizimde/.test(issue.problem))).toBe(true);
    expect(isSketchStored("whiteboard", [{ imagePath: "", reel: { kind: "hook" } }])).toBe(true);
  });

  it("oynatıcı yeni sahneyi tam kare SVG olarak çizer, oran değişince viewBox değişir; eski şemalı sahne tahtada kalır", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const scenes = REEL_SCENES.map((item) => ({
      narration: item.narration,
      durationMs: 4000,
      imageUrl: "",
      audioUrl: "/a.mp3",
      sceneTitle: item.sceneTitle,
      beat: item.beat as never,
      reel: parseReelVisual(item.visual, item.beat as never)!,
      academicDomain: "law" as const,
    }));
    const { container } = render(
      <VideoLessonPlayer prepId="p" videoId="v" title="Şart" topicLabel="Şart" styleLabel="1 Dk Çizimli Video" completed={false} scenes={scenes} />,
    );
    const frame = container.querySelector(".cp-video-frame")!;
    expect(frame.className).toContain("is-reel");
    expect(container.querySelector(".cp-video-reel svg")?.getAttribute("viewBox")).toBe("0 0 360 640");
    // İlk oynatmadan önce kapak tam çizili (animasyon yok).
    expect(container.querySelector(".cp-video-reel svg")?.classList.contains("is-static")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Yatay \(16:9\)/ }));
    expect(container.querySelector(".cp-video-reel svg")?.getAttribute("viewBox")).toBe("0 0 640 360");
    expect(container.querySelector(".cp-video-reel svg")?.getAttribute("data-safe-bottom")).toBe("84");
    expect(container.querySelector(".cp-video-fact")).toBeNull();
  });
});

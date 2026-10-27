// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { ExamPrepHome } from "@/components/parity/exam-prep-home";
import { VideoLessonPlayer } from "@/components/parity/video-lesson";
import { freeActivityPick, studySketchVideoHref } from "@/lib/learning/study-tools";
import {
  parseSketchScript,
  sketchStructureIssues,
  sketchSystem,
  type SketchDiagramKind,
} from "@/lib/learning/video-lesson";

afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8");

function narration(seed: string): string {
  return Array.from({ length: 18 }, (_, index) => `${seed}${index}`).join(" ");
}

function scene(kind: SketchDiagramKind, index: number) {
  return {
    sceneTitle: `Sahne ${index + 1}`,
    narration: narration(`k${index}`),
    formula: "F_1 d_1 = F_2 d_2",
    keyFact: "Moment dengesi",
    voice: index % 2 === 0 ? "ada" : "kerem",
    diagram: {
      diagramKind: kind,
      title: "Terazi",
      items: [
        { label: "Sol", value: 2, highlight: true },
        { label: "Sağ", value: 2 },
      ],
    },
  };
}

describe("paket 2 çizimli video", () => {
  it("sketch_reel şema ve formül üretir, resim modeli istemez", () => {
    const system = sketchSystem("document");
    expect(system).toContain("number_line");
    expect(system).toContain("balance_scale");
    expect(system).toContain("function_curve");
    expect(system).toContain("timeline");
    expect(system).toContain("process_network");
    expect(system).not.toContain("gpt-image");
    expect(system).not.toContain("images.generate");

    const script = parseSketchScript(
      {
        title: "Moment",
        scenes: (["balance_scale", "number_line", "function_curve", "process_network"] as const).map((kind, index) => scene(kind, index)),
      },
      "Moment",
    );
    expect(script?.scenes).toHaveLength(4);
    expect(script?.scenes[0]?.diagram.diagramKind).toBe("balance_scale");
    expect(script?.scenes[0]?.formula).toContain("F_1");
    expect(script?.scenes.map((item) => item.voice)).toEqual(["ada", "kerem", "ada", "kerem"]);
    expect(sketchStructureIssues(script!)).toEqual([]);
    expect(parseSketchScript({ scenes: [{ narration: "Kısa cümle yeter.", sceneTitle: "Boş", visual: "a photo" }] }, "Konu")).toBeNull();

    const source = read("src/lib/learning/video-run.ts");
    const body = source.slice(source.indexOf("async function synthesizeSketchReel"), source.indexOf("export async function runVideoLesson"));
    expect(body).toContain("Promise.all");
    expect(body).toContain("synthesizeLine");
    expect(body).not.toContain("sceneImage");
    expect(body).not.toContain("images.generate");
    expect(body).not.toContain("gpt-image");
    expect(source).toContain('renderMode === "sketch_reel"');
    expect(source).toContain('style: "sketch_reel"');
  });

  it("oynatıcı çizimli sahneyi 9:16 ve 16:9 arasında değiştirir", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(
      <VideoLessonPlayer
        prepId="prep-1"
        videoId="video-1"
        title="Moment"
        topicLabel="Moment"
        styleLabel="1 Dk Çizimli Video"
        completed={false}
        scenes={[
          {
            narration: "İki kefe eşitlenince terazi dengededir.",
            durationMs: 4000,
            imageUrl: "",
            audioUrl: "/a.mp3",
            sceneTitle: "Denge",
            formula: "F_1 d_1 = F_2 d_2",
            diagram: {
              diagramKind: "balance_scale",
              title: "Terazi",
              items: [
                { label: "F d", value: 4, highlight: true },
                { label: "F d", value: 4 },
              ],
            },
          },
        ]}
      />,
    );
    const frame = container.querySelector(".cp-video-frame");
    expect(frame?.className).toContain("is-portrait");
    expect(frame?.getAttribute("data-ratio")).toBe("9:16");
    expect(container.querySelector("[data-diagram='balance_scale']")).toBeTruthy();
    expect(container.querySelector("[data-sketch='reel']")).toBeTruthy();
    expect(container.querySelector(".cp-sketch-formula")?.innerHTML).toContain("katex");
    expect(container.querySelector(".cp-video-image")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Yatay \(16:9\)/ }));
    expect(container.querySelector(".cp-video-frame")?.className).toContain("is-landscape");
    expect(container.querySelector(".cp-video-frame")?.getAttribute("data-ratio")).toBe("16:9");
    fireEvent.click(screen.getByRole("button", { name: /Dikey \(9:16\)/ }));
    expect(container.querySelector(".cp-video-frame")?.className).toContain("is-portrait");
  });

  it("hazırlık kartı ve serbest menü çizimli videoyu doğrudan açar", () => {
    expect(studySketchVideoHref("prep-1", "Moment", [{ id: "topic-1", label: "Moment" }])).toBe(
      "/deneme-sinavlari/prep-1/video?topicId=topic-1&mode=sketch_reel",
    );
    const pick = freeActivityPick([], "prep-1", { id: "topic-1", label: "Moment" }, "video", [
      { id: "topic-1", label: "Moment" },
    ]);
    expect(pick).toEqual({
      ok: true,
      kind: "video",
      href: "/deneme-sinavlari/prep-1/video?topicId=topic-1&mode=sketch_reel",
    });

    render(
      <ExamPrepHome
        prepId="prep-1"
        title="Fizik"
        examType="Okul"
        examDate={null}
        daysLabel=""
        progressPct={0}
        nodes={[
          {
            id: "lesson-1",
            kind: "lesson",
            title: "Moment",
            dayIndex: 1,
            sortOrder: 0,
            status: "ready",
            sessionMeta: { topicTitle: "Moment", topicId: "topic-1" },
          },
        ]}
        hasTopic
        needsIntro={false}
        startHref="/deneme-sinavlari/prep-1/sonraki"
        topicCount={1}
        topicsDone={0}
        topicLabels={["Moment"]}
        topicOptions={[{ id: "topic-1", label: "Moment" }]}
        materials={[]}
      />,
    );
    const link = screen.getByRole("link", { name: /1 Dk Çizimli Video Özeti/ });
    expect(link.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/video?topicId=topic-1&mode=sketch_reel");
  });
});

// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { PodcastKaraokeLine } from "@/components/parity/podcast-karaoke";
import { karaokeWordIndex } from "@/lib/learning/podcast-script";
import {
  FABRICATED_MEMORY,
  NO_FABRICATED_MEMORY_RULE,
  PODCAST_TTS_CONCURRENCY,
  mapWithConcurrency,
  podcastDuoBrief,
} from "@/lib/learning/podcast-formats";
import { podcastScriptSystem } from "@/lib/learning/podcast-script-writer";
import { podcastLineProblems, podcastSystem } from "@/lib/learning/teacher-podcast";

const read = (path: string) => readFileSync(path, "utf8");

describe("paket 2 podcast karaoke ve hız", () => {
  it("aktif satırda kelimeyi currentTime / duration oranıyla vurgular", () => {
    const text = "alfa beta gama";
    const words = text.split(/\s+/);
    expect(words).toEqual(["alfa", "beta", "gama"]);
    expect(karaokeWordIndex(text, 0, 3)).toBe(0);
    expect(karaokeWordIndex(text, 1, 3)).toBe(Math.floor((1 / 3) * words.length));
    expect(karaokeWordIndex(text, 1, 3)).toBe(1);
    expect(karaokeWordIndex(text, 2.9, 3)).toBe(2);

    const { container } = render(<PodcastKaraokeLine text={text} currentTime={1} duration={3} />);
    expect(container.querySelector(".is-current-word")?.textContent).toContain("beta");
    expect(container.querySelector(".is-spoken")?.textContent).toContain("alfa");
    expect(container.querySelectorAll(".cp-pod-word")).toHaveLength(3);
    expect(container.querySelector("[data-karaoke='word']")).toBeTruthy();

    const player = read("src/components/parity/exam-podcast-player.tsx");
    const studio = read("src/components/learning/studio/podcast-studio.tsx");
    expect(player).toContain("PodcastKaraokeLine");
    expect(player).toContain("karaokeWordIndex");
    expect(studio).toContain("PodcastKaraokeLine");
    expect(studio).toContain("lineClock.offsetMs");
    expect(read("src/styles/parity-shell.css")).toContain(".cp-pod-word.is-current-word");
    expect(read("src/styles/learning-studio.css")).toContain(".is-current-word");
  });

  it("senaryo istemi uydurma kişisel anıyı yasaklar ve satır taraması düşürür", () => {
    for (const phrase of ["geçen gün denemede", "lisedeyken", "ben sınava girerken", "arkadaşım"]) {
      expect(NO_FABRICATED_MEMORY_RULE).toContain(phrase);
      expect(podcastScriptSystem("document", "diyalog")).toContain(phrase);
      expect(podcastDuoBrief()).toContain(phrase);
      expect(podcastSystem("document", "diyalog")).toContain(phrase);
      expect(podcastSystem("document", "basit")).toContain(phrase);
    }
    expect(podcastScriptSystem("document", "diyalog")).not.toContain("kendi yaşadığı küçük bir anla");
    expect(podcastDuoBrief()).not.toContain("kendi yaşadığı küçük bir anla");
    expect(FABRICATED_MEMORY.test("Geçen gün denemede bu çıktı.")).toBe(true);
    expect(FABRICATED_MEMORY.test("Moment kol uzunluğuyla çarpılır.")).toBe(false);

    const problems = podcastLineProblems({
      title: "Moment",
      length: "diyalog",
      chapters: [
        {
          title: "Denge",
          lines: [
            { speaker: "kerem", text: "Geçen gün denemede terazi sordular." },
            { speaker: "ada", text: "Moment, kuvvetle kolun çarpımıdır." },
          ],
        },
      ],
    });
    expect(problems).toEqual([{ chapter: 0, line: 0, reason: "uydurma kişisel anı" }]);
  });

  it("ses satırları altı şeritte Promise.all ile üretilir", async () => {
    expect(PODCAST_TTS_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(PODCAST_TTS_CONCURRENCY).toBeLessThanOrEqual(6);
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 8 }, (_, index) => index), PODCAST_TTS_CONCURRENCY, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
      seen.push(item);
    });
    expect(peak).toBe(PODCAST_TTS_CONCURRENCY);
    expect(seen).toHaveLength(8);

    const audio = read("src/lib/learning/audio-cache.ts");
    expect(audio).toContain("mapWithConcurrency(missing, PODCAST_TTS_CONCURRENCY");
    expect(audio).not.toContain("for (const line of lines)");
    expect(audio).not.toContain("const concurrency = 8");
    expect(read("src/lib/learning/podcast-episode.ts")).toContain("PODCAST_TTS_CONCURRENCY");
    expect(read("src/lib/learning/podcast-episode.ts")).toContain("mapWithConcurrency");
    expect(read("src/lib/learning/teacher-podcast-run.ts")).toContain("ttsConcurrency: PODCAST_TTS_CONCURRENCY");
    expect(read("src/lib/learning/podcast-formats.ts")).toContain("await Promise.all");
  });
});

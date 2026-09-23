import { describe, expect, it } from "vitest";
import { flattenLines, normalizeChapters } from "@/lib/learning/podcast-script";
import { validatePodcastAudio } from "@/lib/learning/podcast-audio-contract";

const chapters = normalizeChapters(Array.from({ length: 8 }, (_, c) => ({
  title: `Kavram ${c}`, lines: Array.from({ length: 14 }, (_, i) => ({ speaker: i % 2 ? "kerem" : "ada", text: `Açıklama ${c}-${i}.` })),
})));
const tracks = flattenLines(chapters).map((line) => ({ ...line, url: "https://storage.test/signed.mp3", durationMs: 1200 }));

describe("complete podcast contract", () => {
  it("accepts all 112 verified lines", () => expect(validatePodcastAudio(chapters, tracks)).toHaveLength(112));
  it("rejects the former 60-line truncated response", () => expect(validatePodcastAudio(chapters, tracks.slice(0, 60))).toBeNull());
  it.each([
    { text: "Başka bir podcast" }, { chapterIndex: 77 }, { speaker: "kerem" },
    { durationMs: 0 }, { durationMs: NaN }, { url: "javascript:alert(1)" },
  ])("rejects mismatched or invalid audio %j", (patch) => {
    expect(validatePodcastAudio(chapters, [{ ...tracks[0], ...patch }, ...tracks.slice(1)])).toBeNull();
  });
});

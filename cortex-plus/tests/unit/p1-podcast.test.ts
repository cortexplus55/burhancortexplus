import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { podcastLengthSpec, PODCAST_FORMAT_OPTIONS, type PodcastLength } from "@/lib/learning/podcast-formats";
import {
  durationMovesToward,
  durationRoundNeeded,
  durationWithinPromise,
  estimatedMinutes,
  honestFormatLabel,
  keremShareIssue,
  PODCAST_DURATION_ROUND_MS,
  stampEstimatedDurations,
  wordBand,
} from "@/lib/learning/podcast-duration";
import { cleanSpeechChapters, hasExamInstruction, hasPraise, hasTeacherLabel, stripPraise } from "@/lib/learning/praise-filter";
import { scriptToDraft } from "@/lib/learning/podcast-script-writer";
import { podcastStructureIssues } from "@/lib/learning/teacher-podcast";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";

const LENGTHS = PODCAST_FORMAT_OPTIONS.map((format) => format.id);

function line(speaker: "ada" | "kerem", text: string) {
  return { speaker, text };
}

function episode(length: PodcastLength, lines: { speaker: "ada" | "kerem"; text: string }[]): PodcastEpisode {
  return {
    title: "Anlatım",
    length,
    chapters: [{ title: "Bölüm", lines }],
  };
}

describe("podcast süresi ve dil", () => {
  it("beş formatın kelime bandı söz verilen sürenin yüzde yirmi penceresindedir", () => {
    for (const length of LENGTHS) {
      const spec = podcastLengthSpec(length);
      const band = wordBand(length);
      expect(band).not.toBeNull();
      const mid = estimatedMinutes((band!.min + band!.max) / 2, spec.speakers);
      expect(durationWithinPromise(mid, spec.minutes)).toBe(true);
      expect(honestFormatLabel(length)).toBe(`~${spec.minutes} dk`);
    }
    expect(durationWithinPromise(8, 10)).toBe(true);
    expect(durationWithinPromise(10, 10)).toBe(true);
    expect(durationWithinPromise(12, 10)).toBe(true);
    expect(durationWithinPromise(7.9, 10)).toBe(false);
    expect(durationWithinPromise(12.1, 10)).toBe(false);
    expect(honestFormatLabel("derin", 9)).toBe("~9 dk");
    expect(honestFormatLabel("derin", 6)).toBe("");
    expect(PODCAST_DURATION_ROUND_MS).toBe(20_000);
  });

  it("bandın altı bir tur genişler, tur ancak belirgin adımda kabul edilir", () => {
    const short = episode("ozet", [line("ada", "Kısa bir cümle yeterli değildir.")]);
    expect(durationRoundNeeded(short)).toBe("expand");
    const words = 20;
    expect(durationMovesToward(words, words + 11, "expand")).toBe(false);
    expect(durationMovesToward(words, words + 12, "expand")).toBe(true);
    const stamped = stampEstimatedDurations(short);
    expect(stamped.chapters[0]?.durationMs).toBeGreaterThan(0);
  });

  it("övgü varyantları ve sınav talimatı boşalır", () => {
    expect(stripPraise("Bu cümle bilgi taşır, muazzam bir özet oldu.")).toBe("Bu cümle bilgi taşır.");
    expect(stripPraise("Harika oldu.")).toBe("");
    expect(stripPraise("Mükemmel bir anlatım.")).toBe("");
    expect(hasPraise("şahane")).toBe(true);
    expect(hasPraise("muhteşem")).toBe(true);
    expect(hasPraise("efsanevi")).toBe(true);
    const cleaned = cleanSpeechChapters([
      {
        title: "Bölüm",
        lines: [
          { speaker: "ada", text: "Bu cümle bilgi taşır, muazzam bir özet oldu." },
          { speaker: "kerem", text: "Şıkları işaretle ve kalemi bırak." },
          { speaker: "ada", text: "ÖĞRETMEN: Kural iki durumda uygulanır." },
          { speaker: "ada", text: "Harika oldu." },
        ],
      },
    ]);
    const speech = cleaned.flatMap((chapter) => chapter.lines.map((item) => item.text)).join("\n");
    expect(hasPraise(speech)).toBe(false);
    expect(hasExamInstruction(speech)).toBe(false);
    expect(speech).not.toMatch(/ÖĞRETMEN\s*:/);
    expect(speech).toContain("Bu cümle bilgi taşır");
    expect(speech).toContain("Kural iki durumda uygulanır");
  });

  it("diyaloğda Kerem payı yüzde otuz beş ile elli arasındadır ve öğretmen etiketi ada olur", () => {
    const keremWords = "bir iki üç dört beş altı yedi sekiz".split(" ").join(" ");
    const adaWords = "dokuz on bir iki üç dört beş altı yedi sekiz dokuz on".split(" ").join(" ");
    const low = episode("diyalog", [line("kerem", keremWords), line("ada", `${adaWords} ${adaWords}`)]);
    const share = keremShareIssue(low);
    expect(share).toContain("Kerem'in payı");
    expect(podcastStructureIssues(low).some((issue) => issue.startsWith("Kerem'in payı"))).toBe(true);
    const evenWords = "bir iki üç dört beş altı yedi sekiz dokuz on".split(" ").join(" ");
    const even = episode("diyalog", [line("kerem", evenWords), line("ada", evenWords)]);
    expect(keremShareIssue(even)).toBeNull();
    expect(keremShareIssue(episode("basit", [line("ada", evenWords)]))).toBeNull();
    const praised = episode("diyalog", [line("ada", "Bu cümle bilgi taşır, muazzam bir özet oldu."), line("kerem", evenWords)]);
    expect(podcastStructureIssues(praised).some((issue) => issue === "Boş övgü var.")).toBe(true);
    const instructed = episode("basit", [line("ada", "Şıkları işaretle.")]);
    expect(podcastStructureIssues(instructed).some((issue) => issue === "Sınav talimatı var.")).toBe(true);
    expect(hasTeacherLabel("öğretmen anlattı")).toBe(false);
    expect(hasTeacherLabel("ÖĞRETMEN: kural")).toBe(true);
    const draft = scriptToDraft({
      title: "Anlatım",
      script: "## Bölüm\nÖĞRETMEN: Kural iki durumda uygulanır.\nKerem: Bu ayrım nerede işler?",
    });
    expect(draft?.chapters[0]?.lines.map((item) => item.speaker)).toEqual(["ada", "kerem"]);
    expect(JSON.stringify(draft)).not.toContain("ÖĞRETMEN");
  });

  it("süre turu dinleme kontrolünden önce ve tek seferlik bütçeyle bağlanır", () => {
    const run = readFileSync("src/lib/learning/teacher-podcast-run.ts", "utf8");
    const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
    const picker = readFileSync("src/components/parity/podcast-format-picker.tsx", "utf8");
    expect(run).toContain("alignPodcastDuration");
    expect(run.indexOf("alignPodcastDuration(ask, loop.episode")).toBeLessThan(
      run.indexOf("await podcastListeningCheck(ask, loop.episode, input, started)"),
    );
    expect(run).toContain("PODCAST_DURATION_ROUND_MS");
    expect(run).toContain('reason: "podcast_duration"');
    expect(player).toContain("formatClock");
    expect(player).toContain("chapter.durationMs");
    expect(player).toContain("endMs");
    expect(picker).toContain("honestFormatLabel");
  });
});

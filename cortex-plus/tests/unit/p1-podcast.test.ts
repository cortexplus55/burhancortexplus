import { describe, expect, it } from "vitest";
import {
  KEREM_SHARE_MAX,
  KEREM_SHARE_MIN,
  PODCAST_FORMAT_OPTIONS,
  podcastLengthSpec,
  speakerIdOf,
  spokenSentence,
} from "@/lib/learning/podcast-formats";
import { balanceKerem, coercePodcastDraft, keremShare, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import { SPEAKER_LABEL } from "@/lib/learning/podcast-script";
import { scriptToDraft, usesScriptWriter } from "@/lib/learning/podcast-script-writer";
import { podcastStructureIssues, salvagePodcast } from "@/lib/learning/teacher-podcast";

function episode(length: PodcastEpisode["length"], speakers: ("ada" | "kerem")[][]): PodcastEpisode {
  return {
    title: "Büyüme izlemi",
    length,
    chapters: speakers.map((chapter, chapterIndex) => ({
      title: `Kavram ${chapterIndex + 1}`,
      lines: chapter.map((speaker, lineIndex) => ({
        speaker,
        text: `Bölüm ${chapterIndex + 1} cümle ${lineIndex + 1} bilgiyi nedeniyle anlatır.`,
      })),
    })),
  };
}

describe("P1-3 iki ses: Diyalog, Soru-Cevap, Derinlemesine", () => {
  it("üç tür iki sesli ve senarist yazarla yazılır", () => {
    for (const length of ["diyalog", "soru_cevap", "derin"] as const) {
      expect(podcastLengthSpec(length).speakers).toBe("duo");
      expect(usesScriptWriter(length)).toBe(true);
    }
    expect(podcastLengthSpec("basit").speakers).toBe("single");
  });

  it("Derinlemesine 8-10 dakikalık kelime bandında (88 kelime/dk)", () => {
    const spec = podcastLengthSpec("derin");
    expect(spec.words).toEqual({ min: 750, max: 880 });
    expect(spec.words.min / 88).toBeGreaterThanOrEqual(8);
    expect(spec.words.max / 88).toBeLessThanOrEqual(10.1);
    expect(spec.brief).toContain("750-880");
    expect(PODCAST_FORMAT_OPTIONS.find((option) => option.id === "derin")?.blurb).toMatch(/Ada ile Kerem/);
  });

  it("Soru-Cevap'ta Kerem artık yalnız soru sormaz", () => {
    expect(podcastLengthSpec("soru_cevap").style).not.toContain("yalnızca soru sorar");
  });

  it("kısa Derinlemesine genişletme turu açar ama yayını durdurmaz", () => {
    const short = episode("derin", Array.from({ length: 6 }, () => ["ada", "kerem", "ada"]));
    const issues = podcastStructureIssues(short);
    const expand = issues.find((issue) => issue.startsWith("Metin kısa"));
    expect(expand).toBeTruthy();
    expect(salvagePodcast(short, [expand!])).not.toBeNull();
  });
});

describe("P1-3 Kerem payı kodda", () => {
  it("bandın dışındaki pay düzeltme turuna gider", () => {
    const solo = episode("diyalog", Array.from({ length: 4 }, () => ["ada", "ada", "ada", "ada"]));
    expect(podcastStructureIssues(solo).some((issue) => issue.startsWith("Konuşma payı"))).toBe(true);
    const fair = episode("diyalog", Array.from({ length: 4 }, () => ["ada", "kerem", "ada", "kerem"]));
    expect(podcastStructureIssues(fair).some((issue) => issue.startsWith("Konuşma payı"))).toBe(false);
  });

  it("tek sesli taslak dengelenir; açılış ve kapanış Ada'da", () => {
    const solo = episode("derin", Array.from({ length: 6 }, () => ["ada", "ada", "ada", "ada", "ada"]));
    const balanced = balanceKerem(solo);
    const share = keremShare(balanced);
    expect(share).toBeGreaterThanOrEqual(KEREM_SHARE_MIN);
    expect(share).toBeLessThanOrEqual(KEREM_SHARE_MAX);
    const lines = balanced.chapters.flatMap((chapter) => chapter.lines);
    expect(lines[0]!.speaker).toBe("ada");
    expect(lines[lines.length - 1]!.speaker).toBe("ada");
    expect(lines.map((line) => line.text)).toEqual(solo.chapters.flatMap((chapter) => chapter.lines.map((line) => line.text)));
  });

  it("az Kerem'li taslakta sıranın ilk cümlesi (cevap) Ada'da kalır", () => {
    const draft = episode("diyalog", Array.from({ length: 4 }, () => ["kerem", "ada", "ada", "ada", "ada"]));
    const balanced = balanceKerem(draft);
    expect(keremShare(balanced)).toBeGreaterThanOrEqual(KEREM_SHARE_MIN);
    for (const chapter of balanced.chapters) expect(chapter.lines[1]!.speaker).toBe("ada");
  });

  it("Kerem'e adıyla seslenen cümle Kerem'e taşınmaz; tek sesli tür dokunulmaz", () => {
    const draft = episode("diyalog", [["ada", "ada", "ada"]]);
    draft.chapters[0]!.lines[1]!.text = "Kerem, bunu bir örnekle düşünelim.";
    expect(balanceKerem(draft).chapters[0]!.lines[1]!.speaker).toBe("ada");
    const single = episode("basit", [["ada", "ada", "ada", "ada"]]);
    expect(balanceKerem(single)).toBe(single);
  });
});

describe("P1-3 ADA / KEREM etiketleri", () => {
  it("etiketler büyük harfle ADA ve KEREM", () => {
    expect(SPEAKER_LABEL).toEqual({ ada: "ADA", kerem: "KEREM" });
  });

  it("öğretmen / sunucu konuşmacı alanı Ada, öğrenci Kerem olur", () => {
    expect(speakerIdOf("Öğretmen")).toBe("ada");
    expect(speakerIdOf("SUNUCU")).toBe("ada");
    expect(speakerIdOf("öğrenci")).toBe("kerem");
    const draft = scriptToDraft({
      title: "T",
      script: "## Persentil\nÖğretmen: Çocuğun kendi eğrisi önemlidir.\nÖğrenci: Yani tek ölçüm yetmez mi?\nSunucu: Yetmez, çünkü eğilim gerekir.",
    });
    expect(draft?.chapters[0]!.lines.map((line) => line.speaker)).toEqual(["ada", "kerem", "ada"]);
  });

  it("oynatıcıda tek sesli metin için 'Öğretmen' etiketi yok", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
    expect(source).not.toContain('"Öğretmen"');
    expect(source).not.toContain("soloTeacher");
  });
});

describe("P1-3 kâğıt talimatı ve boş övgü süzgeci", () => {
  it("yazılı sınav talimatı taşıyan cümle düşer", () => {
    expect(spokenSentence("Şimdi şıkları eleyerek doğru cevabı işaretle.")).toBeNull();
    expect(spokenSentence("Cevabını kâğıda yaz ve sonra dinlemeye devam et.")).toBeNull();
    expect(spokenSentence("Boşluğu doldurarak ilerleyelim.")).toBeNull();
  });

  it("baştaki boş övgü silinir, yalnız övgü olan cümle düşer", () => {
    expect(spokenSentence("Harika değindin, Kerem; kilo boydan önce etkilenir.")).toBe("Kilo boydan önce etkilenir.");
    expect(spokenSentence("Çok güzel soru!")).toBeNull();
    expect(spokenSentence("Aferin.")).toBeNull();
    expect(spokenSentence("Güzel bir örnek: 9 aylık bebek desteksiz oturur.")).toBe("Güzel bir örnek: 9 aylık bebek desteksiz oturur.");
  });

  it("taslaktan gelen övgü ve talimat satırları konuşmaya girmez", () => {
    const parsed = coercePodcastDraft(
      {
        title: "Persentil",
        chapters: Array.from({ length: 4 }, (_, index) => ({
          title: `Kavram ${index + 1}`,
          lines: [
            { speaker: "kerem", text: "Tek ölçüm neden yetmez?" },
            { speaker: "ada", text: "Harika değindin. Çocuğun kendi eğrisi önemlidir, çünkü büyüme bir eğilimdir." },
            { speaker: "ada", text: "Şıkları eleyerek ilerle." },
            { speaker: "kerem", text: "Yani iki ölçüm arası çizgi bakılır." },
          ],
        })),
      },
      { length: "diyalog", topicLabel: "Persentil" },
    );
    const texts = parsed!.chapters.flatMap((chapter) => chapter.lines.map((line) => line.text)).join(" ");
    expect(texts).not.toMatch(/Harika değindin|Şıkları eleyerek/);
    expect(texts).toContain("Çocuğun kendi eğrisi önemlidir");
  });
});

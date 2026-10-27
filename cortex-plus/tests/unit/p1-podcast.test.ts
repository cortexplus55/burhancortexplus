import { describe, expect, it } from "vitest";
import {
  KEREM_SHARE_MAX,
  KEREM_SHARE_MIN,
  PODCAST_FORMAT_OPTIONS,
  podcastLengthSpec,
  speakerIdOf,
  spokenSentence,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import {
  closerToBand,
  deliverableMinutes,
  durationRoundFor,
  durationVerdict,
  estimatedDurationMs,
  promisedMs,
  stampChapterDurations,
} from "@/lib/learning/podcast-duration";
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

  // Paket A (28 Ekim 2026): uzunluk konunun yoğunluğuna göre; taban var, tavan ~10 dakika, sabit bant yok.
  it("Derinlemesine tabanı ~6 dakika, tavanı ~10 dakika (88 kelime/dk)", () => {
    const spec = podcastLengthSpec("derin");
    expect(spec.words.min / 88).toBeGreaterThanOrEqual(6);
    expect(spec.words.max / 88).toBeLessThanOrEqual(10.1);
    expect(spec.brief).toContain("Uzunluğu konunun yoğunluğu belirler");
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

  // Paket A (28 Ekim 2026): V6'da Ada'nın açıklaması cümle ortasında Kerem'in sesine geçti. Kod artık bir
  // konuşma sırasını bölmez; tek sesli taslak dokunulmadan kalır, pay sorunu düzeltme turuna gider.
  it("tek sesli taslak bölünmez; pay sorunu düzeltme turuna gider", () => {
    const solo = episode("derin", Array.from({ length: 6 }, () => ["ada", "ada", "ada", "ada", "ada"]));
    const balanced = balanceKerem(solo);
    expect(balanced.chapters.flatMap((chapter) => chapter.lines.map((line) => line.speaker))).toEqual(
      solo.chapters.flatMap((chapter) => chapter.lines.map((line) => line.speaker)),
    );
    expect(podcastStructureIssues(solo).some((issue) => issue.startsWith("Konuşma payı"))).toBe(true);
  });

  it("az Kerem'li taslakta yalnız bütün sıra taşınır; açılış ve kapanış Ada'da", () => {
    const draft = episode("diyalog", Array.from({ length: 4 }, () => ["kerem", "ada", "ada", "ada", "ada"]));
    draft.chapters[0]!.lines.unshift({ speaker: "ada", text: "Bugün büyüme izlemini konuşacağız." });
    const balanced = balanceKerem(draft);
    const share = keremShare(balanced);
    expect(share).toBeGreaterThanOrEqual(KEREM_SHARE_MIN);
    expect(share).toBeLessThanOrEqual(KEREM_SHARE_MAX);
    const lines = balanced.chapters.flatMap((chapter) => chapter.lines);
    expect(lines[0]!.speaker).toBe("ada");
    expect(lines[lines.length - 1]!.speaker).toBe("ada");
    expect(lines.map((line) => line.text)).toEqual(draft.chapters.flatMap((chapter) => chapter.lines.map((line) => line.text)));
    // Her bölümdeki dört cümlelik Ada sırası ya bütünüyle Ada'da kalır ya bütünüyle Kerem'e geçer.
    for (const chapter of balanced.chapters) {
      const turn = chapter.lines.slice(-4).map((line) => line.speaker);
      expect(new Set(turn).size).toBe(1);
    }
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
    // Ayraçsız kuyruk silinmez: "Kuralın özeti" yarım cümle olurdu (Paket A, 28 Ekim 2026).
    expect(spokenSentence("Kuralın özeti muazzam bir özet oldu")).toBe("Kuralın özeti muazzam bir özet oldu");
    expect(spokenSentence("Oran sabit, muazzam bir özet oldu.")).toBe("Oran sabit.");
    expect(spokenSentence("Great job, the ratio stays 2:1.")).toBe("The ratio stays 2:1.");
    expect(spokenSentence("Well done.")).toBeNull();
    expect(spokenSentence("Good morning, the ratio stays 2:1.")).toBe("Good morning, the ratio stays 2:1.");
    expect(spokenSentence("ÖĞRETMEN: Oran sabit kaldı.")).toBe("Oran sabit kaldı.");
    expect(spokenSentence("İş 59,7 kJ, oran 0,287 kalır.")).toBe("İş 59,7 kJ, oran 0,287 kalır.");
    expect(spokenSentence("Bu öğretmen anlatır ve oran sabit kalır.")).toBe("Bu öğretmen anlatır ve oran sabit kalır.");
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

describe("süre sözü her türde aynı kapı", () => {
  const formats = ["diyalog", "ozet", "soru_cevap", "basit", "derin"] as const satisfies readonly PodcastLength[];

  it("kelime bandının iki ucu söz verilen sürenin ±%20'sinde kalır", () => {
    for (const length of formats) {
      const spec = podcastLengthSpec(length);
      for (const words of [spec.words.min, spec.words.max]) {
        expect(durationVerdict(estimatedDurationMs(words, spec.speakers), length)).toBe("ok");
      }
      expect(durationRoundFor({ length, words: spec.words.min - 1 })).toBe("expand");
      expect(durationRoundFor({ length, words: spec.words.max + 1 })).toBe("shorten");
      expect(durationRoundFor({ length, words: Math.round((spec.words.min + spec.words.max) / 2) })).toBeNull();
      expect(deliverableMinutes(length)).toBe(spec.minutes);
    }
  });

  it("ölçülen süre kelime bandını ezer; banda yaklaşan tur kabul edilir", () => {
    expect(durationRoundFor({ length: "diyalog", words: 440, measuredMs: promisedMs("diyalog") * 0.5 })).toBe("expand");
    // Tavan ~10 dakika: tipik sürenin 1,4 katı artık uzun değil; tavanın %20 üstü uzun.
    expect(durationRoundFor({ length: "basit", words: 470, measuredMs: promisedMs("basit") * 1.4 })).toBeNull();
    const basitCeiling = estimatedDurationMs(podcastLengthSpec("basit").words.max, "single");
    expect(durationRoundFor({ length: "basit", words: 470, measuredMs: basitCeiling * 1.3 })).toBe("shorten");
    expect(durationVerdict(promisedMs("derin"), "derin")).toBe("ok");
    expect(closerToBand(80, 95, "ozet")).toBe(true);
    expect(closerToBand(95, 40, "ozet")).toBe(false);
    const stamped = stampChapterDurations([{ title: "A", lines: [{ durationMs: 1000 }, { durationMs: 500 }] }]);
    expect(stamped[0]?.durationMs).toBe(1500);
  });

  it("satır başındaki konuşmacı etiketi işaretlenir, cümle içindeki rol sözü değil", () => {
    const labeled = episode("basit", [["ada", "ada", "ada", "ada"]]);
    labeled.chapters[0]!.lines[0]!.text = "ÖĞRETMEN: Oran sabit kaldı.";
    expect(podcastStructureIssues(labeled).some((issue) => issue.startsWith("Konuşmacı adı"))).toBe(true);
    const inline = episode("basit", [["ada", "ada", "ada", "ada"]]);
    inline.chapters[0]!.lines[0]!.text = "Bu öğretmen anlatır ve oran sabit kalır.";
    expect(podcastStructureIssues(inline).some((issue) => issue.startsWith("Konuşmacı adı"))).toBe(false);
  });

  it("süre turu döngünün dışında, dinleme kontrolünden önce, tek tur", async () => {
    const { readFileSync } = await import("node:fs");
    const run = readFileSync("src/lib/learning/teacher-podcast-run.ts", "utf8");
    const loop = run.indexOf("export async function teacherPodcastLoop");
    const inner = run.indexOf("const episode = await ensurePodcastDuration");
    const check = run.indexOf("podcastListeningCheck(ask, episode");
    expect(loop).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(loop);
    expect(check).toBeGreaterThan(inner);
    expect(run).toContain("SÜRE TURU. Bu bir denetim değil.");
    expect(run).toContain("DURATION_ROUND_TIMEOUT_MS");
    const picker = readFileSync("src/components/parity/podcast-format-picker.tsx", "utf8");
    expect(picker).toContain("podcastMinutesLabel(option.id)");
    const audio = readFileSync("src/app/api/learning/podcast/audio/route.ts", "utf8");
    expect(audio).toContain("durationVerdict");
    expect(audio).not.toContain("ensurePodcastDuration");
  });
});

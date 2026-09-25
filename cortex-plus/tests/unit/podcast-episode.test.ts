import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("@/lib/ai/generate", () => ({ generateJson: mocks.generateJson }));

import {
  coercePodcastDraft,
  generatePodcastEpisode,
  mergePodcastSource,
  podcastQuantIssues,
  podcastScriptText,
  podcastSyllabusLines,
  readPodcastCache,
  repairPodcastEpisode,
  speakFormulas,
  turkishDecimalComma,
  writePodcastCache,
  type PodcastEpisode,
} from "@/lib/learning/podcast-episode";
import {
  describeGenerationFailure,
  generationFailureCode,
} from "@/lib/learning/generation-failure";

function lines(texts: string[]) {
  return texts.map((text) => ({ speaker: "ada" as const, text }));
}

const historySource =
  "Bastille baskını 1789 yılında oldu. Paris halkı kaleye yürüdü ve monarşi sarsıldı.";

describe("podcast episode", () => {
  it("keeps a long single-teacher line the 180-character schema used to reject", () => {
    const long = `Mol kavramı ${"öğrencinin notundaki örneği bağlar ".repeat(8)}`.trim();
    expect(long.length).toBeGreaterThan(180);
    const episode = coercePodcastDraft(
      {
        title: "Mol kavramı",
        chapters: [
          { title: "Tanım", lines: [{ speaker: "Ada", text: long }, ...lines(["İkinci cümle kavramı yerleştirir."])] },
          { title: "Hesap", lines: lines(["Bir mol tanecik sayısıdır.", "Kütle ile sayı burada bağlanır."]) },
          { title: "Tekrar", lines: lines(["Mol sayı ile kütleyi bağlar.", "Formül kütlesi gram cinsindendir."]) },
        ],
      },
      { length: "ozet", topicLabel: "Mol kavramı" },
    );
    expect(episode).not.toBeNull();
    expect(episode?.chapters[0]?.lines[0]?.speaker).toBe("ada");
    expect(episode?.chapters[0]?.lines[0]?.text.length).toBeGreaterThan(180);
    expect(episode?.chapters[0]?.title).not.toBe("Tanım");
    expect(episode?.chapters.every((chapter) => chapter.lines.every((line) => line.speaker === "ada"))).toBe(true);
  });

  it("repairs a wrong quotient before the episode is spoken", () => {
    const episode: PodcastEpisode = {
      title: "Oran",
      length: "ozet",
      chapters: [
        {
          title: "Hesap",
          lines: lines(["Pay paydadan küçüktür.", "14 / 28 = 0,6 kalır."]),
        },
      ],
    };
    const source = "Karışımda 14 mol ve 28 mol var.";
    expect(podcastQuantIssues(episode, source).join(" ")).toMatch(/0,6|hesap/i);
    const repaired = repairPodcastEpisode(episode, source);
    expect(podcastScriptText(repaired)).toContain("0,5");
    expect(podcastScriptText(repaired)).not.toContain("0,6");
  });

  it("speaks formulas in Turkish and keeps the decimal comma", () => {
    const spoken = speakFormulas("Su H2O, karbondioksit CO2.");
    expect(spoken).toContain("H iki O");
    expect(spoken).toContain("C O iki");
    expect(speakFormulas("H iki O")).toBe("H iki O");
    expect(turkishDecimalComma("0.5 mol ve 9. sınıf")).toBe("0,5 mol ve 9. sınıf");
  });

  it("accepts a history episode whose year matches the source", () => {
    const episode = coercePodcastDraft(
      {
        title: "Fransız Devrimi",
        chapters: [
          {
            title: "Baskın",
            lines: lines(["Bastille baskını 1789 yılında oldu.", "Paris halkı kaleye yürüdü."]),
          },
          {
            title: "Sonuç",
            lines: lines(["Bu olay monarşinin sarsıldığını gösterdi.", "Devrim bundan sonra hızlandı."]),
          },
          {
            title: "Tekrar",
            lines: lines(["Bastille 1789 yazında düştü.", "Tarih sorusu yılı sorar."]),
          },
        ],
      },
      { length: "ozet", topicLabel: "Fransız Devrimi" },
    );
    expect(episode).not.toBeNull();
    expect(podcastQuantIssues(episode!, historySource)).toEqual([]);
    const wrong: PodcastEpisode = {
      ...episode!,
      chapters: episode!.chapters.map((chapter, index) =>
        index === 0
          ? {
              ...chapter,
              lines: lines(["Bastille baskını 1804 yılında oldu.", "Paris halkı kaleye yürüdü."]),
            }
          : chapter,
      ),
    };
    expect(podcastQuantIssues(wrong, historySource).length).toBeGreaterThan(0);
  });

  it("regenerates when a number is outside the source, then drops that line", async () => {
    const draft = {
      title: "Mol kavramı",
      chapters: [
        {
          title: "Hesap",
          lines: lines([
            "Kaynakta duran cümle burada.",
            "İkinci cümle de kaynakta.",
            "99 sayısı kaynakta yok.",
          ]),
        },
        {
          title: "Bağlam",
          lines: lines(["Üçüncü bölüm sade duruyor.", "Başka sayı yok bu satırda."]),
        },
        {
          title: "Kapanış",
          lines: lines(["Konu burada biter.", "Tekrar kısa tutulur."]),
        },
      ],
    };
    mocks.generateJson.mockImplementation(async (input: { parse: (raw: unknown) => unknown }) => {
      let data = input.parse(draft);
      if (!data) data = input.parse(draft);
      if (!data) return { ok: false, status: 422, error: "invalid_ai_response" };
      return { ok: true, data };
    });

    const outcome = await generatePodcastEpisode({
      service: {} as never,
      userId: "user",
      isPremium: true,
      prepTitle: "Kimya",
      topicLabel: "Mol kavramı",
      sourceBlock: "Kaynakta duran cümle burada. İkinci cümle de kaynakta.",
      length: "ozet",
      requestId: "req-podcast-1",
      rederive: async () => ({ ok: true, note: "" }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(podcastScriptText(outcome.data)).not.toContain("99");
    expect(mocks.generateJson).toHaveBeenCalled();
  });
});

describe("prep-wide podcast grounding", () => {
  it("names exam weight and exclusions from the shared syllabus reader", () => {
    const lines = podcastSyllabusLines("Mol kavramı", {
      weighted: [
        { topic: "Mol kavramı", documentName: "not.pdf", note: "ağırlık 30", weight: 30 },
      ],
      excluded: [
        {
          topic: "Organik adlandırma",
          quote: "Organik adlandırma sınav kapsamı dışındadır",
          documentName: "not.pdf",
          pageNumber: 2,
        },
      ],
    });
    expect(lines).toContain("bu konu sınavda ağırlıklı");
    expect(lines).toContain("Organik adlandırma");
  });

  it("keeps the page source and adds the other document's excerpt", () => {
    const merged = mergePodcastSource(
      "Sayfa 4: mol tanımı.",
      "[kimya-2.pdf · s.2] sınırlayıcı bileşen",
    );
    expect(merged).toContain("Sayfa 4");
    expect(merged).toContain("kimya-2.pdf");
  });

  it("does not throw when the cache table is not created yet", async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: null,
        error: { code: "PGRST205", message: "exam_prep_podcasts schema cache" },
      }),
      upsert: async () => ({
        error: { code: "42P01", message: "relation exam_prep_podcasts does not exist" },
      }),
    };
    const service = { from: () => builder } as never;
    await expect(readPodcastCache(service, "prep", "Mol", "standart")).resolves.toBeNull();
    await expect(
      writePodcastCache(service, {
        prepId: "prep",
        userId: "user",
        topicLabel: "Mol",
        episode: { title: "Mol", length: "ozet", chapters: [] },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("podcast failure copy", () => {
  it("reads the machine code, not the Turkish sentence the client used to pass", () => {
    const code = generationFailureCode({
      error: "Seçili belge kaynağı okunamadı. Belgeyi yeniden işle veya başka kaynak seç.",
      code: "source_unavailable",
    });
    expect(code).toBe("source_unavailable");
    expect(describeGenerationFailure(code).message).toContain("kaynak sayfaları okunamadı");
    expect(describeGenerationFailure("invalid_ai_response", undefined, "podcast").message).toContain(
      "doğrulanamadı",
    );
  });
});

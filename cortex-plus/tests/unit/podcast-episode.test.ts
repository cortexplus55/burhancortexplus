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
  unfinishedExampleGaps,
  withoutUnfinishedExamples,
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

  it("shows powers as symbols and speaks them as üzeri", () => {
    const episode = coercePodcastDraft(
      {
        title: "Mol kavramı",
        chapters: [
          { title: "Sayı", lines: lines(["Mol 6,02 × 10²³ tanecik içerir.", "Formül CO2 ile yazılır."]) },
          { title: "Kütle", lines: lines(["Mol kütlesi elementin atomik kütlesi ile aynıdır.", "Birim g/mol diye okunur."]) },
          { title: "Tekrar", lines: lines(["Sayı 10²³ ile anılır.", "Formül CO2 olarak kalır."]) },
        ],
      },
      { length: "ozet", topicLabel: "Mol kavramı" },
    );
    expect(episode).not.toBeNull();
    const script = podcastScriptText(episode!);
    expect(script).toContain("10²³");
    expect(script).toContain("CO₂");
    expect(script).not.toMatch(/kare küp/);
    const spoken = episode!.chapters.flatMap((chapter) => chapter.lines).map((line) => line.spoken ?? "").join(" ");
    expect(spoken).toMatch(/on üzeri yirmi üç/);
    expect(spoken).toMatch(/C O iki/);
    const repaired = repairPodcastEpisode(episode!, "Mol 6,02 × 10²³ tanecik içerir. Formül CO2.");
    expect(podcastScriptText(repaired)).toContain("g/mol");
    expect(podcastScriptText(repaired)).not.toMatch(/atomik kütlesi ile aynıdır/);
    expect(repaired.chapters.flatMap((chapter) => chapter.lines)).toHaveLength(
      episode!.chapters.flatMap((chapter) => chapter.lines).length,
    );
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

  it("flags a worked example that never reaches its result and keeps a finished one", () => {
    const hollow: PodcastEpisode = {
      title: "Mol kavramı",
      length: "ozet",
      chapters: [
        {
          title: "Uygulamalı Örnek: H₂SO₄ Hesaplaması",
          lines: lines([
            "0,25 mol H₂SO₄'nin gram cinsinden kütlesini bulmak için m = n × M formülünü kullanırız.",
            "H atom sayısını bulmak için önce tanecik sayısı hesaplanır: N = 0,25 × 6,02 × 10²³.",
            "Molekül başına düşen atom sayısı ile molekül sayısı çarpılır.",
          ]),
        },
      ],
    };
    expect(unfinishedExampleGaps(hollow).join(" ")).toMatch(/Örnek yarım/);
    const finished: PodcastEpisode = {
      ...hollow,
      chapters: [
        {
          title: "Uygulamalı Örnek: H₂SO₄ Hesaplaması",
          lines: lines([
            "0,25 mol H₂SO₄ için kütlesini bulmak üzere m = n × M = 0,25 mol × 98 g/mol = 24,5 g.",
            "Tanecik sayısı N = 0,25 × 6,02 × 10²³ = 1,505 × 10²³.",
            "H atom sayısı 2 × 1,505 × 10²³ = 3,01 × 10²³.",
          ]),
        },
      ],
    };
    expect(unfinishedExampleGaps(finished)).toEqual([]);
    const weight: PodcastEpisode = {
      title: "Mol kavramı",
      length: "ozet",
      chapters: [
        {
          title: "Yanılgı",
          lines: lines([
            "Mol kütlesi sadece 1 mol maddenin gram cinsinden ağırlığıdır, tanecik sayısını içermez.",
            "Sayı ile kütle ayrı büyüklüktür.",
          ]),
        },
      ],
    };
    const repaired = repairPodcastEpisode(weight, "Mol kütlesi gram cinsinden kütledir.");
    const script = podcastScriptText(repaired);
    expect(script).toContain("kütlesidir");
    expect(script).toContain("tanecik sayısını içermez");
    expect(script).not.toMatch(/ağırlığ/);
  });

  it("drops the unfinished example on the retry and does not invent the missing mass", async () => {
    const hollowChapter = {
      title: "Uygulamalı Örnek: H₂SO₄ Hesaplaması",
      lines: lines([
        "0,25 mol H₂SO₄'nin gram cinsinden kütlesini bulmak için m = n × M formülünü kullanırız.",
        "H atom sayısını bulmak için önce tanecik sayısı hesaplanır: N = 0,25 × 6,02 × 10²³.",
        "Molekül başına düşen atom sayısı ile molekül sayısı çarpılır.",
      ]),
    };
    const kept = [
      { title: "Tanım", lines: lines(["Mol, tanecik sayısıdır.", "Avogadro sayısı bunu bağlar."]) },
      {
        title: "Yanılgı",
        lines: lines([
          "Mol kütlesi sadece 1 mol maddenin gram cinsinden ağırlığıdır, tanecik sayısını içermez.",
          "Sayı ile kütle ayrı büyüklüktür.",
        ]),
      },
      { title: "Tekrar", lines: lines(["Mol sayı birimidir.", "Kütle gram ile ölçülür.", "Tanecik sayısı ayrıdır."]) },
    ];
    const draft = { title: "Mol kavramı", chapters: [hollowChapter, ...kept] };
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
      sourceBlock: "Mol, tanecik sayısıdır. Avogadro sayısı bunu bağlar. Mol kütlesi gram cinsinden kütledir.",
      length: "ozet",
      requestId: "req-podcast-example",
      rederive: async () => ({ ok: true, note: "" }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const script = podcastScriptText(outcome.data);
    expect(script).not.toMatch(/H₂SO₄|n × M|98/);
    expect(script).toContain("kütlesidir");
    expect(script).toContain("tanecik sayısını içermez");
    expect(withoutUnfinishedExamples(outcome.data)).not.toBeNull();

    const tooShort = { title: "Mol kavramı", chapters: [hollowChapter, kept[0], kept[1]] };
    mocks.generateJson.mockImplementation(async (input: { parse: (raw: unknown) => unknown }) => {
      let data = input.parse(tooShort);
      if (!data) data = input.parse(tooShort);
      if (!data) return { ok: false, status: 422, error: "invalid_ai_response" };
      return { ok: true, data };
    });
    const dropped = await generatePodcastEpisode({
      service: {} as never,
      userId: "user",
      isPremium: true,
      prepTitle: "Kimya",
      topicLabel: "Mol kavramı",
      sourceBlock: "Mol, tanecik sayısıdır.",
      length: "ozet",
      requestId: "req-podcast-example-short",
      rederive: async () => ({ ok: true, note: "" }),
    });
    expect(dropped.ok).toBe(false);
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

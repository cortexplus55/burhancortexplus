import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("@/lib/ai/generate", () => ({ generateJson: mocks.generateJson }));

import { coercePodcastDraft, mergePodcastSource, podcastSyllabusLines, readPodcastCache, writePodcastCache } from "@/lib/learning/podcast-episode";
import {
  describeGenerationFailure,
  generationFailureCode,
} from "@/lib/learning/generation-failure";

function lines(texts: string[]) {
  return texts.map((text) => ({ speaker: "ada" as const, text }));
}

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
    expect(
      describeGenerationFailure(code, undefined, undefined, {
        reason: "documents_processing",
      }).message,
    ).toContain("kaynak sayfaları okunamadı");
    expect(describeGenerationFailure("invalid_ai_response", undefined, "podcast").message).toContain(
      "doğrulanamadı",
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateJson: vi.fn() }));
vi.mock("@/lib/ai/generate", () => ({ generateJson: mocks.generateJson }));

import {
  coercePodcastDraft,
  mergePodcastSource,
  podcastGroundingBrief,
  podcastSyllabusLines,
  readPodcastCache,
  writePodcastCache,
} from "@/lib/learning/podcast-episode";
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

/*
  20 Ekim 2026 kör kıyas: Kerem bir podcast'te dört kez "Notlarındaki örnekte …" dedi. Kök neden
  kodun kendisiydi: kapsam satırı yazara '"notlarındaki örnek" de' diyordu.
*/
describe("podcast kapsam satırı kaynağa gönderme istemez", () => {
  it("örnek kalır, 'notlarındaki örnek de' talimatı yok", () => {
    const brief = podcastGroundingBrief({ priority: null, examples: ["9 ayda desteksiz oturur"], excludedTopics: [] });
    expect(brief).toContain("9 ayda desteksiz oturur");
    expect(brief).toContain("kaynağı anmadan");
    expect(brief).not.toMatch(/"notlarındaki örnek" de/);
    expect(brief).not.toContain("Öğrencinin notlarındaki örnek");
  });
});

/*
  Dinleme kontrolü önbellekte (20 Ekim 2026, göç 20261020150000). Kod göçten önce de çalışır:
  okuma `select("*")`, yazma sütun yoksa sütunsuz bir kez yeniden dener.
*/
describe("podcast önbelleği ve dinleme kontrolü", () => {
  const check = [
    { text: "Kilo neyi hızlı yansıtır?", options: ["Akut beslenme", "Kronik süreç"], correct: ["Akut beslenme"], multi: false },
    { text: "Baş çevresi neyi gösterir?", options: ["Beyin büyümesi", "Kas gücü"], correct: ["Beyin büyümesi"], multi: false },
  ];
  const episode = { title: "Büyüme", length: "diyalog" as const, chapters: [{ title: "Persentil", lines: [{ speaker: "ada" as const, text: "Tek ölçüm yetmez." }] }] };

  it("okuma sütun listesi değil * ister ve kontrolü döndürür", async () => {
    const selects: string[] = [];
    const builder = {
      select: (columns: string) => {
        selects.push(columns);
        return builder;
      },
      eq: () => builder,
      maybeSingle: async () => ({ data: { ...episode, listening_check: check }, error: null }),
    };
    const cached = await readPodcastCache({ from: () => builder } as never, "prep", "Büyüme", "diyalog");
    expect(selects).toEqual(["*"]);
    expect(cached?.check.map((question) => question.text)).toEqual(check.map((question) => question.text));
    expect(cached?.check[0]?.correct).toEqual(["Akut beslenme"]);
  });

  it("eski satırda (sütun boş) kontrol boş dizi", async () => {
    const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { ...episode }, error: null }) };
    const cached = await readPodcastCache({ from: () => builder } as never, "prep", "Büyüme", "diyalog");
    expect(cached?.check).toEqual([]);
    expect(cached?.chapters).toHaveLength(1);
  });

  it("yazma: sütun yoksa (PGRST204) bir kez sütunsuz yeniden dener", async () => {
    const bodies: Record<string, unknown>[] = [];
    const builder = {
      upsert: async (body: Record<string, unknown>) => {
        bodies.push(body);
        return bodies.length === 1 ? { error: { code: "PGRST204", message: "Could not find the 'listening_check' column" } } : { error: null };
      },
    };
    await writePodcastCache({ from: () => builder } as never, { prepId: "p", userId: "u", topicLabel: "Büyüme", episode, check });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.listening_check).toEqual(check);
    expect("listening_check" in (bodies[1] ?? {})).toBe(false);
    expect(bodies[1]?.chapters).toEqual(episode.chapters);
  });

  it("yazma: kontrol yoksa sütun boş; başka hata yeniden denenmez", async () => {
    const bodies: Record<string, unknown>[] = [];
    const builder = {
      upsert: async (body: Record<string, unknown>) => {
        bodies.push(body);
        return { error: { code: "23505", message: "conflict" } };
      },
    };
    await writePodcastCache({ from: () => builder } as never, { prepId: "p", userId: "u", topicLabel: "Büyüme", episode });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.listening_check).toBeNull();
  });

  it("göç yalnız boş olabilen sütunu ekler", () => {
    const sql = readFileSync("supabase/migrations/20261020150000_podcast_listening_check.sql", "utf8");
    expect(sql).toContain("ALTER TABLE public.exam_prep_podcasts ADD COLUMN IF NOT EXISTS listening_check jsonb;");
    expect(sql).not.toMatch(/DROP|schema_migrations/i);
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

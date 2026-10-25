import { describe, expect, it } from "vitest";
import { readLessonV2, type LessonV3 } from "@/lib/learning/lesson-v3";
import { lessonQuizContext, loadTopicLessons, pointTaught } from "@/lib/learning/lesson-quiz-context";

/*
  Konu testi dersi bilir (20 Ekim 2026): kaydedilmiş dersten yazara giden sorular ve terimler;
  dersin düz metni hangi "Sınavda sorulur" maddesinin işlendiğini söyler. Ders V3 kaydında da
  V2 görünümünden okunur (ekran i = bölüm i; ekranın sorusu bölümün sorusu).
*/
const lesson: LessonV3 = {
  format: 3,
  title: "Bronşiolit ve Krup",
  overview: "İki hışıltılı çocuk; biri için antibiyotik, öteki için destek tedavisi.",
  screens: [
    {
      heading: "Bronşiolit",
      concept: "Bronşiolit",
      blocks: [
        {
          type: "text",
          text: "**Bronşiolit** küçük hava yollarının viral enfeksiyonudur. Tedavinin temeli **destek tedavisi**dir; her hastaya rutin antibiyotik ya da bronkodilatör verilmez.",
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Bronşiolitte tedavinin temeli hangisidir?",
            options: ["Destek tedavisi", "Rutin antibiyotik", "Rutin bronkodilatör", "Steroid"],
            answerIndex: 0,
            explanation: "Destek tedavisi esastır; rutin antibiyotik ve bronkodilatör doğru değildir.",
            review: { prompt: "Bronşiolitli bebekte rutin antibiyotik verilir mi?" },
          },
        },
      ],
    },
    {
      heading: "Krup",
      concept: "Krup",
      blocks: [
        { type: "text", text: "**Krup** subglottik ödemle **inspiratuvar stridor** ve havlar öksürük yapar." },
        {
          type: "check",
          check: {
            type: "trueFalse",
            prompt: "Krupta stridor ekspiratuvardır.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Subglottik daralma inspiratuvar stridor yapar.",
          },
        },
      ],
    },
  ],
  summary: ["Bronşiolit: destek tedavisi.", "Krup: inspiratuvar stridor."],
  nextFocus: [],
};

describe("dersten test bağlamı", () => {
  it("V3 ders V2 görünümünden: ekran soruları sırayla (tekrar sorusu dahil), koyu terimler", () => {
    const context = lessonQuizContext([readLessonV2(lesson)!])!;
    expect(context.checks).toEqual([
      "Bronşiolitte tedavinin temeli hangisidir?",
      "Bronşiolitli bebekte rutin antibiyotik verilir mi?",
      "Krupta stridor ekspiratuvardır.",
    ]);
    expect(context.terms).toEqual(["Bronşiolit", "destek tedavisi", "Krup", "inspiratuvar stridor"]);
    expect(context.text).toContain("rutin antibiyotik ya da bronkodilatör verilmez");
    expect(context.key).toMatch(/^L[0-9a-z]{1,6}$/);
  });

  it("aynı ders iki kez: tekrarlar bir kez; ders yoksa null; anahtar sabit, soru değişince değişir", () => {
    const v2 = readLessonV2(lesson)!;
    const twice = lessonQuizContext([v2, v2])!;
    expect(twice.checks).toHaveLength(3);
    expect(twice.terms).toHaveLength(4);
    expect(lessonQuizContext([])).toBeNull();
    expect(lessonQuizContext([v2])!.key).toBe(lessonQuizContext([readLessonV2(lesson)!])!.key);
    const changed = structuredClone(lesson);
    const check = changed.screens[1].blocks[1];
    if (check.type === "check") check.check.prompt = "Krupta stridor hangi evrede duyulur?";
    expect(lessonQuizContext([readLessonV2(changed)!])!.key).not.toBe(lessonQuizContext([v2])!.key);
  });

  it("madde derste işlendi mi: köklerinin çoğu ders metninde", () => {
    const text = lessonQuizContext([readLessonV2(lesson)!])!.text;
    expect(pointTaught("Bronşiolitte rutin antibiyotik ya da bronkodilatör önerilmez; destek tedavisi esastır.", text)).toBe(true);
    expect(pointTaught("Astım atağında sessiz akciğer, siyanoz ve bilinç değişikliği ciddi uyarı bulgusudur.", text)).toBe(false);
    expect(pointTaught("", text)).toBe(false);
  });
});

describe("konunun kaydedilmiş dersleri", () => {
  const service = (rows: unknown[] | null, error: unknown = null) =>
    ({
      from() {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "eq", "not", "order"]) chain[name] = () => chain;
        chain.limit = () => Promise.resolve({ data: rows, error });
        return chain;
      },
    }) as never;

  it("aynı başlıktan en yenisi, eskiden yeniye; bozuk kayıt atlanır; en yeni kaydın zamanı", async () => {
    const older = { ...lesson, title: "Ders 1/2" };
    const newer = { ...lesson, title: "Ders 2/2" };
    const rows = [
      { title: "Ders 2/2", content_json: newer, created_at: "2026-10-20T10:05:00Z" },
      { title: "Ders 2/2", content_json: { ...newer, overview: "eski sürüm" }, created_at: "2026-10-20T10:00:00Z" },
      { title: "Bozuk", content_json: { nope: true }, created_at: "2026-10-20T09:59:00Z" },
      { title: "Ders 1/2", content_json: older, created_at: "2026-10-20T09:00:00Z" },
    ];
    const loaded = await loadTopicLessons(service(rows), "t1");
    expect(loaded.lessons.map((item) => item.title)).toEqual(["Ders 1/2", "Ders 2/2"]);
    expect(loaded.lessons[1].overview).toBe(lesson.overview);
    expect(loaded.savedAt).toBe("2026-10-20T10:05:00Z");
  });

  it("okuma düşerse ya da ders yoksa boş: test bugünkü gibi dersi bilmeden yazılır", async () => {
    expect(await loadTopicLessons(service(null, { message: "x" }), "t1")).toEqual({ lessons: [], savedAt: null, missing: [] });
    expect(await loadTopicLessons(service([]), "t1")).toEqual({ lessons: [], savedAt: null, missing: [] });
  });
});

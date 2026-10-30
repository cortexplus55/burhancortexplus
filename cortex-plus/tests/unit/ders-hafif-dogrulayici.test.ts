import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LessonBlock, LessonScreen, LessonV3 } from "@/lib/learning/lesson-v3";
import {
  applyLessonSanity,
  lessonSanityUserPrompt,
  removableBlock,
  runLessonSanity,
  LESSON_SANITY_MAX_DROPS_PER_SCREEN,
} from "@/lib/learning/lesson-sanity";

/*
  30 Ekim 2026, Astra ile yan yana tur (aynı Makroekonomi notu, kör yargı): dersin öğrenci gözü Astra'nın gerisinde
  kaldı. İki yargıç da aynı iki kusuru gösterdi: "hangi endeks ölçer?" sorusunun beş şıkkından üçü endeks değildi
  (Stagflasyon, Deflasyon, Dezenflasyon) ve aynı ekranda "%60'tan %40'a" örneği yedi kez geçiyordu. Ürün sahibinin
  kararları: hafif doğrulayıcı bütün kavramlara; aynı çağrı ekranda üçüncü kez tekrar eden süs kutusunu çıkarır.
*/

const ENDEX = ["Stagflasyon", "Deflasyon", "TÜFE", "Dezenflasyon", "Yİ-ÜFE"];
const endexCheck: LessonBlock = {
  type: "check",
  check: {
    type: "mcq",
    prompt: "Hanehalkının satın aldığı mal ve hizmetlerin fiyat değişimini hangi endeks ölçer?",
    options: ENDEX,
    answerIndex: 2,
    explanation: "TÜFE hanehalkının satın aldığı mal ve hizmetleri ölçer; diğer seçenekler endeks değildir.",
    optionWhy: ENDEX.map((option) => `${option} için gerekçe.`),
    whyWrong: "Stagflasyon bir endeks değildir.",
    whyRight: "TÜFE hanehalkı sepetidir.",
    review: {
      prompt: "Üreticilerin sattığı malların fiyat değişimini izleyen endeks hangisidir?",
      options: ENDEX,
      answerIndex: 4,
      explanation: "Yİ-ÜFE üreticinin sattığı malları ölçer.",
    },
  },
} as LessonBlock;
const tfCheck: LessonBlock = {
  type: "check",
  check: {
    type: "trueFalse",
    prompt: "Bir malın fiyatının artması tek başına enflasyondur.",
    options: ["Doğru", "Yanlış"],
    answerIndex: 1,
    explanation: "Enflasyon genel fiyat düzeyinin sürekli artmasıdır.",
  },
} as LessonBlock;
const note = (title: string, tone?: string): LessonBlock =>
  ({ type: "note", note: { title, body: "Enflasyon %60'tan %40'a inerse bu dezenflasyondur; fiyatlar düşmüş değildir.", ...(tone ? { tone } : {}) } }) as LessonBlock;
const carousel: LessonBlock = {
  type: "comparison_carousel",
  carousel: {
    mode: "compare",
    title: "Fiyat düşüşü mü, artış hızında düşüş mü?",
    slides: [
      { title: "Deflasyon", body: "Genel fiyat düzeyi sürekli düşer.", points: ["Fiyatlar düşer"] },
      { title: "Dezenflasyon", body: "Enflasyon oranı düşer.", points: ["%60'tan %40'a"] },
    ],
  },
} as LessonBlock;
const text = (value: string): LessonBlock => ({ type: "text", text: value }) as LessonBlock;
const table: LessonBlock = {
  type: "table",
  table: { columns: ["Kavram", "Anlam"], rows: [["Deflasyon", "Fiyatlar düşer"], ["Dezenflasyon", "Oran düşer"]] },
} as LessonBlock;

const screens = (): LessonScreen[] => [
  {
    heading: "Enflasyonun ölçülmesi",
    concept: "Enflasyonun ölçülmesi",
    blocks: [text("TÜİK TÜFE ve Yİ-ÜFE'yi hesaplar."), table, endexCheck],
  } as LessonScreen,
  {
    heading: "Enflasyonla ilgili kavramlar",
    concept: "Enflasyonla ilgili kavramlar",
    blocks: [
      text("Dezenflasyonda oran düşer, fiyatlar artmayı sürdürür."),
      note("Sınav ipucu: Dezenflasyon ile deflasyon", "exam"),
      carousel,
      note("Örnek vaka: Enflasyon oranının gerilemesi", "info"),
      note("Neden böyle?: Oran ile düzey neden farklı?", "general"),
      tfCheck,
    ],
  } as LessonScreen,
];

const INDEX_OPTIONS = ["Yİ-ÜFE", "İhracat Fiyat Endeksi", "TÜFE", "İthalat Fiyat Endeksi", "Konut Fiyat Endeksi"];
const goodPatch = {
  screen: 0,
  block: 2,
  options: INDEX_OPTIONS,
  answerIndex: 2,
  optionWhy: INDEX_OPTIONS.map((option) => `${option} için yeni gerekçe.`),
  explanation: "TÜFE hanehalkının satın aldığı mal ve hizmetlerin fiyat değişimini ölçer; öbürleri başka fiyatları izler.",
  why: "Kavram şıkları endeks değildi; endekslerle değiştirildi.",
};

describe("ders doğrulayıcısı: soruyu düzeltir, metin yazmaz, soru silmez", () => {
  it("türü uymayan şıklar aynı türden gerçek terimlerle değişir; kök, şık sayısı ve anahtar yerinde kalır", () => {
    const result = applyLessonSanity(screens(), { checks: [goodPatch], drop: [] });
    const block = result.screens[0]!.blocks[2]!;
    expect(block.type).toBe("check");
    if (block.type !== "check") return;
    expect(block.check.prompt).toBe((endexCheck as Extract<LessonBlock, { type: "check" }>).check.prompt);
    expect(block.check.options).toEqual(INDEX_OPTIONS);
    expect(block.check.answerIndex).toBe(2);
    expect(block.check.optionWhy).toEqual(goodPatch.optionWhy);
    // Eski şıklara bağlı yanlış gerekçesi ve eski şıklı ikinci soru kalmaz (çalışma anı yeni şıklarla kurar).
    expect(block.check.whyWrong).toBeUndefined();
    expect(block.check.review).toBeUndefined();
    expect(block.check.whyRight).toBe("TÜFE hanehalkı sepetidir.");
    expect(result).toMatchObject({ patched: 1, keyChanged: 0, dropped: 0, rejected: 0 });
    // Ekran ve blok sayısı aynı.
    expect(result.screens.map((screen) => screen.blocks.length)).toEqual([3, 6]);
  });

  it("anahtar değişince doğru cevaba bağlı metinler de düşer", () => {
    const moved = { ...goodPatch, options: ENDEX, answerIndex: 4, optionWhy: undefined, explanation: "Yİ-ÜFE üreticinin sattığı malları ölçer, hanehalkı sepeti TÜFE'dir." };
    const result = applyLessonSanity(screens(), { checks: [moved] });
    const block = result.screens[0]!.blocks[2]!;
    if (block.type !== "check") throw new Error("check");
    expect(block.check.answerIndex).toBe(4);
    expect(block.check.whyRight).toBeUndefined();
    expect(block.check.optionWhy).toBeUndefined();
    expect(result.keyChanged).toBe(1);
  });

  it("eksik ya da tutarsız yama alınmaz", () => {
    const broken = [
      { ...goodPatch, options: INDEX_OPTIONS.slice(0, 4) },
      { ...goodPatch, options: ["TÜFE", "tüfe.", "Yİ-ÜFE", "A", "B"] },
      { ...goodPatch, answerIndex: 5 },
      { ...goodPatch, explanation: "kısa" },
      { ...goodPatch, optionWhy: ["tek"] },
      { ...goodPatch, block: 1 }, // tablo
      { ...goodPatch, screen: 1, block: 5 }, // doğru/yanlış
      { ...goodPatch, screen: 9 },
    ];
    const result = applyLessonSanity(screens(), { checks: broken });
    expect(result.screens).toEqual(screens());
    expect(result).toMatchObject({ patched: 0, rejected: broken.length });
  });
});

describe("ders doğrulayıcısı: ekranda üçüncü kez tekrar eden süs kutusunu çıkarır", () => {
  it("yalnız süs kutuları çıkabilir; sınav ipucu, Neden böyle, metin, tablo, soru kalır", () => {
    const [first, second] = screens();
    expect(second!.blocks.map(removableBlock)).toEqual([false, false, true, true, false, false]);
    expect(first!.blocks.map(removableBlock)).toEqual([false, false, false]);
    const result = applyLessonSanity(screens(), {
      drop: [
        { screen: 1, block: 2, why: "Kaydırma üçüncü kez aynı ayrımı veriyor." },
        { screen: 1, block: 3, why: "Örnek vaka aynı sayıları dördüncü kez veriyor." },
        { screen: 1, block: 1 }, // sınav ipucu: kalır
        { screen: 1, block: 4 }, // Neden böyle: kalır
        { screen: 1, block: 5 }, // soru: kalır
        { screen: 0, block: 1 }, // tablo: kalır
      ],
    });
    expect(result.screens[1]!.blocks.map((block) => block.type)).toEqual(["text", "note", "note", "check"]);
    expect(result.screens[0]!.blocks).toHaveLength(3);
    expect(result).toMatchObject({ dropped: 2, rejected: 4 });
  });

  it("bir ekrandan en çok üç kutu çıkar", () => {
    const many: LessonScreen = {
      heading: "Tekrar",
      concept: "Tekrar",
      blocks: [text("Asıl anlatım."), ...Array.from({ length: 5 }, (_, index) => note(`Örnek vaka ${index}`, "info")), tfCheck],
    } as LessonScreen;
    const result = applyLessonSanity([many], { drop: [1, 2, 3, 4, 5].map((block) => ({ screen: 0, block })) });
    expect(result.dropped).toBe(LESSON_SANITY_MAX_DROPS_PER_SCREEN);
    expect(result.screens[0]!.blocks).toHaveLength(7 - LESSON_SANITY_MAX_DROPS_PER_SCREEN);
  });

  it("istem çıkarılabilir kutuları işaretler, soruyu şıklarıyla ve anahtarıyla gösterir", () => {
    const user = lessonSanityUserPrompt({ mode: "document", topicLabel: "Enflasyon", source: "Kaynak metni", screens: screens() });
    expect(user).toContain("EKRAN 0: Enflasyonun ölçülmesi");
    expect(user).toContain("[2] check: SORU (mcq): Hanehalkının");
    expect(user).toContain("0) Stagflasyon | 1) Deflasyon | 2) TÜFE");
    expect(user).toContain("ANAHTAR: 2");
    expect(user).toContain("[2] comparison_carousel [çıkarılabilir]");
    expect(user).toContain("[3] note [çıkarılabilir]");
    expect(user).not.toContain("[1] note [çıkarılabilir]");
    expect(user).not.toContain("[4] note [çıkarılabilir]");
  });
});

describe("ders doğrulayıcısı: tek çağrı, süre tavanı", () => {
  const input = { mode: "document" as const, topicLabel: "Enflasyon", source: "Kaynak", screens: screens() };

  it("süre aşılır ya da çağrı düşerse ekranlar aynen döner; boş kavramda çağrı yok", async () => {
    const slow = await runLessonSanity(() => new Promise<string>(() => undefined), input, JSON.parse, 20);
    expect(slow.timedOut).toBe(true);
    expect(slow.screens).toEqual(screens());
    const failed = await runLessonSanity(async () => Promise.reject(new Error("429")), input, JSON.parse);
    expect(failed.screens).toEqual(screens());
    const ask = vi.fn(async () => "{}");
    await runLessonSanity(ask, { ...input, screens: [] }, JSON.parse);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("ders hattı doğrulayıcıyı her kavram için (ilki dahil) yayımdan önce koşar", () => {
  const lesson: LessonV3 = {
    format: 3,
    title: "Enflasyonun Tanımı ve Ölçülmesi",
    overview: "Tek malın fiyatı mı, genel fiyat düzeyi mi?",
    screens: screens(),
    summary: ["TÜFE hanehalkını, Yİ-ÜFE üreticiyi ölçer.", "Dezenflasyonda oran düşer."],
    nextFocus: [],
  } as LessonV3;

  it("ilk kavramın sorusu düzeltilmiş, ikinci kavramın tekrar kutusu çıkmış olarak yayımlanır", async () => {
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const sanityCalls: string[] = [];
    const published: LessonScreen[][] = [];
    const result = await teacherLessonPipeline(
      {
        write: async (system, user, onDelta) => {
          if (system.startsWith("Sen hızlı bir ders editörü")) {
            sanityCalls.push(user);
            const body = user.includes("EKRAN 0: Enflasyonun ölçülmesi")
              ? { checks: [goodPatch], drop: [] }
              : { checks: [], drop: [{ screen: 0, block: 3, why: "Örnek vaka aynı sayıları yeniden veriyor." }] };
            return { text: JSON.stringify(body), finish: "stop" };
          }
          const textBody = JSON.stringify(lesson);
          for (let at = 0; at < textBody.length; at += 97) onDelta(textBody.slice(at, at + 97));
          return { text: textBody, finish: "stop" };
        },
      },
      { topicLabel: "Enflasyonun Tanımı ve Ölçülmesi", prepTitle: "KPSS", pages: [{ page: 1, text: "TÜFE, Yİ-ÜFE, dezenflasyon." }], upcomingTopics: [] },
      { onPublish: (item) => void published.push(item.lesson.screens) },
    );
    expect(sanityCalls).toHaveLength(2);
    const final = result.lesson!;
    const firstCheck = final.screens[0]!.blocks.find((block) => block.type === "check");
    if (!firstCheck || firstCheck.type !== "check") throw new Error("check");
    // Şıklar yayımlanırken karıştırılır: küme aynı, endeks olmayan şık yok.
    expect([...firstCheck.check.options!].sort()).toEqual([...INDEX_OPTIONS].sort());
    expect(firstCheck.check.options![firstCheck.check.answerIndex!]).toBe("TÜFE");
    expect(final.screens[1]!.blocks.some((block) => block.type === "note" && block.note.title.startsWith("Örnek vaka"))).toBe(false);
    expect(final.screens[1]!.blocks.some((block) => block.type === "note" && block.note.title.startsWith("Sınav ipucu"))).toBe(true);
    // İlk yayımda bile soru düzeltilmiş hâliyle gider.
    const firstPublished = published[0]?.[0]?.blocks.find((block) => block.type === "check");
    if (firstPublished?.type === "check") expect(firstPublished.check.options).not.toContain("Stagflasyon");
    expect(info).toHaveBeenCalledWith("lesson_sanity", expect.objectContaining({ patched: 1 }));
    expect(info).toHaveBeenCalledWith("lesson_sanity", expect.objectContaining({ dropped: 1 }));
    info.mockRestore();
  });

  it("sanity: false hiç çağrı yapmaz", async () => {
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const systems: string[] = [];
    await teacherLessonPipeline(
      {
        write: async (system, _user, onDelta) => {
          systems.push(system);
          const textBody = JSON.stringify(lesson);
          onDelta(textBody);
          return { text: textBody, finish: "stop" };
        },
      },
      { topicLabel: "Enflasyon", prepTitle: "KPSS", pages: [{ page: 1, text: "TÜFE" }], upcomingTopics: [], sanity: false },
    );
    expect(systems.filter((system) => system.startsWith("Sen hızlı bir ders editörü"))).toHaveLength(0);
  });
});

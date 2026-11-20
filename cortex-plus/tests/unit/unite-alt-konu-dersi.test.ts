import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  coverageCompletionScreens,
  coverageCompletionUserPrompt,
  inputBackbone,
  lessonCoverageGaps,
  lessonLevelStructureIssues,
  teacherUserPrompt,
  verifyPartUserPrompt,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";
import {
  SUBTOPIC_COVERAGE_CONTRACT,
  resolveLessonSubtopicScope,
  subtopicPlanBlock,
  uncoveredSubtopics,
} from "@/lib/learning/lesson-subtopics";
import { lessonDepthForSubtopics, parseSubtopicList, subtopicListFingerprint } from "@/lib/learning/subtopic-list";
import { lessonScreenCap } from "@/lib/learning/lesson-key-facts";
import { narrowPagesToTopic } from "@/lib/learning/topic-section";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { LESSON_SCREEN_HARD_CAP, type LessonScreen, type LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Ünite dersi (20 Kasım 2026, ürün sahibinin kararı): yeni hazırlık birkaç tam ana üniteden kurulur; her ünite konu
  haritasının bulduğu ince konuları alt konu olarak taşır ve tek derin dersle öğretilir. Bu dosya ders motorunun
  tarafını sınar: zorunlu plan ve sözleşme, alt konu sayısından derinlik, kapanışta eksik alt konu bekçisi ve yalnız
  eksikleri isteyen tamamlama, kardeş ünite sınırı ve alt konusuz (eski) girdilerde birebir aynı istem. Model çağrısı
  yok: yazar sahte. Adlar yapay ("topic-alpha", "subtopic-1"; bekçinin kök ölçüsü için "Alfa evresi", "Beta evresi").
*/

const SUBTOPICS_5 = ["subtopic-1", "subtopic-2", "subtopic-3", "subtopic-4", "subtopic-5"];

const BASE: TeacherLessonInput = {
  topicLabel: "topic-alpha",
  prepTitle: "exam-x",
  pages: [{ page: 1, text: "Kaynak metni: birinci kısım anlatılır.\n\nİkinci kısım da anlatılır." }],
  upcomingTopics: [],
  sanity: false,
  visualScene: false,
};

describe("derinlik: alt konu sayısından ekran aralığı", () => {
  it("1-2 → 4-5, 3-4 → 6-8, 5 ve üstü → 8-11; alt konu yoksa null", () => {
    const table = [1, 2, 3, 4, 5, 7].map((n) => {
      const depth = lessonDepthForSubtopics(n)!;
      return [n, depth.minScreens, depth.maxScreens, depth.maxConcepts];
    });
    expect(table).toEqual([
      [1, 4, 5, 6],
      [2, 4, 5, 6],
      [3, 6, 8, 6],
      [4, 6, 8, 6],
      [5, 8, 11, 6],
      [7, 8, 11, 7],
    ]);
    expect(lessonDepthForSubtopics(0)).toBeNull();
    // Hiçbir derinlik sert tavanı (16) aşmaz; çok alt konulu ünitede kavram sınırı ekran sınırında durur.
    expect(lessonDepthForSubtopics(30)).toEqual({ subtopics: 30, minScreens: 8, maxScreens: 11, maxConcepts: 11 });
    for (const n of [1, 3, 5, 12, 30]) expect(lessonScreenCap(0, n)).toBeLessThanOrEqual(LESSON_SCREEN_HARD_CAP);
  });

  it("yapı denetimi istemle aynı sayıyı okur: ekran ve kavram tavanı derinlikten", () => {
    expect(lessonScreenCap(0, 2)).toBe(9);
    expect(lessonScreenCap(0, 4)).toBe(12);
    expect(lessonScreenCap(8, 5)).toBe(15);
    // 11 ekranlı, 7 kavramlı ünite dersi "fazla ekran / fazla kavram" diye geri çevrilmez.
    const screens = Array.from({ length: 11 }, (_, i) => ({
      heading: `Kısım ${i + 1}`,
      concept: `concept-${Math.min(i, 6)}`,
      blocks: [{ type: "text", text: `Kısım ${i + 1} anlatılır.` }],
    })) as LessonScreen[];
    const lesson = { format: 3, title: "topic-alpha", screens, summary: ["a", "b", "c"] } as LessonV3;
    const unit = { ...BASE, mode: "topic" as const, subtopics: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"] };
    const lows = lessonLevelStructureIssues(lesson, unit).filter((issue) => issue.severity === "low").map((issue) => issue.problem);
    expect(lows.some((problem) => problem.includes("ekran; kavramı daha az"))).toBe(false);
    expect(lows.some((problem) => problem.includes("kavram; kısa alt başlıkları"))).toBe(false);
  });
});

describe("zorunlu plan: yazar ve denetçi aynı sözleşmeyi okur", () => {
  it("5 alt konulu ünite: istem beşini numaralı listeler, derinlik 8-11 ekran (3 ekranlık özet değil)", () => {
    const prompt = teacherUserPrompt({ ...BASE, subtopics: SUBTOPICS_5 });
    expect(prompt).toContain("ÜNİTENİN ALT KONULARI (bu dersin zorunlu planı, sırayla):");
    SUBTOPICS_5.forEach((subtopic, index) => expect(prompt).toContain(`${index + 1}) ${subtopic}`));
    expect(prompt).toContain("DERİNLİK: 5 alt konu → bu ders 8-11 ekran");
    expect(prompt).toContain(SUBTOPIC_COVERAGE_CONTRACT);
    expect(SUBTOPIC_COVERAGE_CONTRACT).toMatch(/Hiçbir alt konuyu atlama/);
    expect(SUBTOPIC_COVERAGE_CONTRACT).toMatch(/formülü, istisna kuralını,\s+sayısal eşiği ya da öğretmenin notunu/);
    expect(SUBTOPIC_COVERAGE_CONTRACT).toMatch(/'check' bloğu/);
    // Plan kaynağın önünde: yazar önce planı okur.
    expect(prompt.indexOf("ÜNİTENİN ALT KONULARI")).toBeLessThan(prompt.indexOf("KAYNAK:\n"));
  });

  it("kapsamı yargılayan denetçi yazarla aynı metni okur (kapanış kısmında)", () => {
    const lesson = { format: 3, title: "topic-alpha", screens: [{ heading: "a", blocks: [{ type: "text", text: "a" }] }] } as LessonV3;
    const unit = { ...BASE, subtopics: SUBTOPICS_5 };
    const closing = verifyPartUserPrompt(lesson, { from: 0, to: 0, header: true, closing: true }, unit);
    expect(closing).toContain(subtopicPlanBlock(unit));
    const middle = verifyPartUserPrompt(lesson, { from: 0, to: 0, header: true, closing: false }, unit);
    expect(middle).not.toContain(SUBTOPIC_COVERAGE_CONTRACT);
  });

  it("belgesiz ünite dersinde de plan var; çok alt konulu ünitede ekran paylaşımı söylenir", () => {
    const topic = teacherUserPrompt({ ...BASE, mode: "topic", pages: [], subtopics: ["s1", "s2"] });
    expect(topic).toContain("DERİNLİK: 2 alt konu → bu ders 4-5 ekran");
    const many = subtopicPlanBlock({ subtopics: Array.from({ length: 13 }, (_, i) => `subtopic-${i + 1}`) });
    expect(many).toContain("yakın iki alt konu aynı ekranı paylaşabilir");
  });

  it("'Farklı anlat' ve belgesiz derinlik açığı alt konu derinliğini okur; alt konusuzda eski 6 ekran", () => {
    const rewrite = { ...BASE, mode: "topic" as const, pages: [], alternativeOf: "Önceki anlatım metni." };
    expect(teacherUserPrompt(rewrite)).toContain("Ders en az 6 ekran olsun (6-8)");
    const unitRewrite = teacherUserPrompt({ ...rewrite, subtopics: ["s1", "s2", "s3"] });
    expect(unitRewrite).toContain("Ders alt konu planının derinliğinde olsun (6-8 ekran): her alt konuya kendi ekranı.");
    expect(unitRewrite).not.toContain("Ders en az 6 ekran olsun");
    const screens = (count: number) =>
      ({ format: 3, title: "t", screens: Array.from({ length: count }, (_, i) => ({ heading: `s${i + 1}`, concept: `s${i + 1}`, blocks: [text(`s${i + 1} anlatılır.`)] })) }) as LessonV3;
    const small = { ...BASE, mode: "topic" as const, pages: [], subtopics: ["s1", "s2"] };
    expect(lessonCoverageGaps(screens(4), small)).toEqual({ headings: [], facts: [], subtopics: [] });
    expect(lessonCoverageGaps(screens(3), small).headings).toEqual([expect.stringContaining("en az 4 olmalı")]);
  });
});

describe("eski girdiler: alt konu yoksa her şey birebir aynı", () => {
  it("istem, denetçi istemi, kapsam açığı, tamamlama istemi ve ekran tavanı değişmez", () => {
    const empty = { ...BASE, subtopics: [] as string[], excludedSubtopics: [] as string[] };
    expect(teacherUserPrompt(empty)).toBe(teacherUserPrompt(BASE));
    expect(teacherUserPrompt(BASE)).not.toContain("ALT KONU");
    const lesson = { format: 3, title: "topic-alpha", screens: [{ heading: "a", blocks: [{ type: "text", text: "a" }] }] } as LessonV3;
    const part = { from: 0, to: 0, header: true, closing: true };
    expect(verifyPartUserPrompt(lesson, part, empty)).toBe(verifyPartUserPrompt(lesson, part, BASE));
    const gaps = lessonCoverageGaps(lesson, BASE);
    expect("subtopics" in gaps).toBe(false);
    expect(lessonCoverageGaps(lesson, empty)).toEqual(gaps);
    expect(lessonCoverageGaps(lesson, { ...BASE, mode: "topic" })).toEqual({ headings: [expect.stringContaining("en az 6")], facts: [] });
    const completion = coverageCompletionUserPrompt(lesson, BASE, { headings: ["Bir başlık"], facts: [] });
    expect(completion).toContain("Yalnız bunları öğreten en çok 2 YENİ ekran yaz. Bilgi kaynaktaki yazımıyla gelir");
    expect(completion).not.toContain("Alt konu");
    expect(coverageCompletionScreens({ headings: ["x"], facts: [] }, 4)).toBe(2);
    expect([lessonScreenCap(0), lessonScreenCap(8), lessonScreenCap(40)]).toEqual([12, 14, 16]);
    expect(lessonLevelStructureIssues(lesson, empty)).toEqual(lessonLevelStructureIssues(lesson, BASE));
    expect(inputBackbone(empty)).toEqual(inputBackbone(BASE));
  });

  it("oturum metası: eski düğümde alan yok; liste temizlenir, tekrar ve boşluk düşer", () => {
    expect(parseSessionMeta({ topicTitle: "topic-alpha" })?.lessonSubtopics).toBeUndefined();
    expect(parseSessionMeta({ lessonSubtopics: [" subtopic-1 ", "subtopic-1", "", 7, "subtopic-2"] })?.lessonSubtopics).toEqual([
      "subtopic-1",
      "subtopic-2",
    ]);
    expect(parseSubtopicList("subtopic-1")).toEqual([]);
    expect(parseSubtopicList(null)).toEqual([]);
  });
});

/* ───────────── Kapsam bekçisi ve tamamlama (sahte yazar) ───────────── */

const GREEK = ["Alfa evresi", "Beta evresi", "Gama evresi", "Delta evresi", "Epsilon evresi"];

const text = (value: string) => ({ type: "text" as const, text: value });
const check = (prompt: string, options: string[], answerIndex: number, explanation: string) => ({
  type: "check" as const,
  check: { type: "mcq" as const, prompt, options, answerIndex, explanation },
});

// Ders içi soru tekrarı yayımdan önce düşer (`dropRepeatedChecks`): her ekranın sorusu ayrı bir kalıpla sorulur.
const ASKS: Record<string, string> = {
  Alfa: "Hangi kural ilk aşamada geçerlidir?",
  Beta: "İkinci aşamayı öbürlerinden ayıran ölçüt nedir?",
  Gama: "Üçüncü aşamada sonucu belirleyen etken hangisidir?",
  Delta: "Dördüncü aşamanın istisnası hangi durumda ortaya çıkar?",
  Epsilon: "Son aşamada süreci tamamlayan adım hangisidir?",
};

function unitScreen(name: string, word: string): LessonScreen {
  const options = [`${word} kuralı`, "Birinci karşıt", "İkinci karşıt", "Üçüncü karşıt"];
  return {
    heading: name,
    concept: name,
    blocks: [
      text(`**${name}**: ${word} kısmının tanımı ve işleyişi burada anlatılır.`),
      { type: "cards", cards: [{ title: `${word} kuralı`, body: `${word} kısmının kuralı kısa anlatılır.` }, { title: "Karşıt", body: "Karışan kısım." }] },
      { type: "example", example: { prompt: `${word} kısmında örnek durum nedir?`, solution: `${word} kuralı uygulanır.`, result: `${word} kuralı` } },
      check(ASKS[word] ?? `${word} için hangisi doğrudur?`, options, 0, `Doğrusu ${word} kuralıdır; öbürleri karşıt durumlardır.`),
    ],
  } as LessonScreen;
}

const diagramBlock = {
  type: "diagram_card" as const,
  diagramKind: "process_network" as const,
  title: "Evrelerin sırası",
  items: [{ label: "Alfa" }, { label: "Beta" }, { label: "Gama" }],
};

const SOURCE = GREEK.map((name) => `${name} kısmı ayrıntılı anlatılır ve sınavda sorulur`).join(".\n") + ".";

const unitInput: TeacherLessonInput = {
  ...BASE,
  topicLabel: "topic-alpha",
  pages: [{ page: 1, text: SOURCE }],
  subtopics: GREEK,
};

function skippingDraft(skip: string): LessonV3 {
  const screens = GREEK.filter((name) => name !== skip).map((name) => unitScreen(name, name.split(" ")[0]!));
  screens[1] = { ...screens[1]!, blocks: [...screens[1]!.blocks.slice(0, 3), diagramBlock, ...screens[1]!.blocks.slice(3)] };
  return { format: 3, title: "topic-alpha", overview: "Evreler sırayla anlatılır.", screens, summary: ["Bir.", "İki.", "Üç."], nextFocus: [] } as LessonV3;
}

async function runPipeline(input: TeacherLessonInput, drafts: string[]) {
  const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
  const writes: { system: string; user: string }[] = [];
  const queue = [...drafts];
  const result = await teacherLessonPipeline(
    {
      write: async (system, user, onDelta) => {
        writes.push({ system, user });
        const body = queue.shift() ?? "";
        onDelta(body);
        return { text: body, finish: "stop" };
      },
    },
    input,
  );
  return { result, writes };
}

afterEach(() => vi.restoreAllMocks());

describe("kapsam bekçisi: işlenmeyen alt konu", () => {
  it("atlanan alt konuyu bulur; ortak çerçeve sözcüğü ve ünite adı kanıt sayılmaz", () => {
    const draft = skippingDraft("Delta evresi");
    expect(uncoveredSubtopics(draft.screens, GREEK, "topic-alpha")).toEqual(["Delta evresi"]);
    // "evresi" bütün alt konularda ortak: yalnız o sözcüğü taşıyan ekran Delta'yı işlemiş sayılmaz.
    const passing = [{ heading: "Genel", blocks: [text("Her evresi sırayla gelir.")] }] as LessonScreen[];
    expect(uncoveredSubtopics(passing, GREEK)).toEqual(GREEK);
    expect(uncoveredSubtopics(skippingDraft("").screens, GREEK)).toEqual([]);
  });

  it("eksik alt konu kapsam açığıdır; yapı denetimi yüksek önemle yazar, kavram düşmez", () => {
    const draft = skippingDraft("Delta evresi");
    expect(lessonCoverageGaps(draft, unitInput)).toEqual({ headings: [], facts: [], formulas: [], subtopics: ["Delta evresi"] });
    const issue = lessonLevelStructureIssues(draft, unitInput).find((item) => item.problem.includes("Delta evresi"));
    expect(issue).toMatchObject({ severity: "high" });
    expect(issue!.problem.startsWith("[kapsam]")).toBe(true);
  });

  it("tamamlama yalnız eksik alt konuyu ister; dönen ekran sona eklenir, ders beşini de kapsar", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const completion = JSON.stringify({ title: "topic-alpha", screens: [unitScreen("Delta evresi", "Delta")] });
    const { result, writes } = await runPipeline(unitInput, [JSON.stringify(skippingDraft("Delta evresi")), completion]);
    expect(writes).toHaveLength(2);
    // İlk yazımın istemi beş alt konuyu ve derinliği taşır.
    expect(writes[0]!.user).toContain("5) Epsilon evresi");
    expect(writes[0]!.user).toContain("DERİNLİK: 5 alt konu → bu ders 8-11 ekran");
    const missingPart = writes[1]!.user.slice(writes[1]!.user.indexOf("Kaynağın şu kısımları derste işlenmedi:"));
    expect(missingPart).toContain("- Alt konu (ünitenin zorunlu planında; kendi ekranında eksiksiz anlat): Delta evresi");
    for (const covered of ["Alfa evresi", "Beta evresi", "Gama evresi", "Epsilon evresi"]) {
      expect(missingPart).not.toContain(`Alt konu (ünitenin zorunlu planında; kendi ekranında eksiksiz anlat): ${covered}`);
    }
    expect(result.lesson!.screens.map((screen) => screen.heading)).toEqual([
      "Alfa evresi",
      "Beta evresi",
      "Gama evresi",
      "Epsilon evresi",
      "Delta evresi",
    ]);
    expect(uncoveredSubtopics(result.lesson!.screens, GREEK)).toEqual([]);
    expect(result.done).toBe(true);
    expect(info).toHaveBeenCalledWith(
      "teacher_lesson_subtopic_coverage",
      expect.objectContaining({ total: 5, before: 1, after: 0, missing: [], verdict: "added" }),
    );
  });

  it("tamamlama düşerse ders yine yayımlanır; eksik kayda geçer, ders bitmiş sayılmaz", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { result } = await runPipeline(unitInput, [JSON.stringify(skippingDraft("Delta evresi")), "{ bozuk"]);
    expect(result.lesson!.screens).toHaveLength(4);
    expect(result.done).toBe(false);
    expect(info).toHaveBeenCalledWith(
      "teacher_lesson_subtopic_coverage",
      expect.objectContaining({ before: 1, after: 1, missing: ["Delta evresi"], verdict: "unparsed" }),
    );
  });

  it("izin eksik alt konu sayısı kadar (en az 2), sert tavanda durur; yer yoksa çağrı yapılmaz", async () => {
    const gaps = { headings: [], facts: [], subtopics: ["a", "b", "c", "d"] };
    expect(coverageCompletionScreens(gaps, 5)).toBe(4);
    expect(coverageCompletionScreens({ ...gaps, subtopics: ["a"] }, 5)).toBe(2);
    expect(coverageCompletionScreens(gaps, LESSON_SCREEN_HARD_CAP - 1)).toBe(1);
    expect(coverageCompletionScreens(gaps, LESSON_SCREEN_HARD_CAP)).toBe(0);
    expect(coverageCompletionUserPrompt(skippingDraft("Delta evresi"), unitInput, gaps)).toContain("en çok 4 YENİ ekran yaz.");
    const { completeLessonCoverage } = await import("@/lib/learning/teacher-lesson-run");
    const full = { ...skippingDraft("Delta evresi"), screens: Array.from({ length: LESSON_SCREEN_HARD_CAP }, () => unitScreen("Alfa evresi", "Alfa")) };
    const write = vi.fn(async () => ({ text: "", finish: "stop" }));
    expect((await completeLessonCoverage({ write }, full, unitInput, gaps)).verdict).toBe("no_room");
    // Ünite dersinde süre bütçesi bittiyse çağrı yapılmaz (rota sınırı).
    expect((await completeLessonCoverage({ write }, skippingDraft("Delta evresi"), unitInput, gaps, { deadlineAt: Date.now() - 1 })).verdict).toBe(
      "no_time",
    );
    expect(write).not.toHaveBeenCalled();
  });
});

describe("sınır: öbür ünitelerin ve ünitenin öbür derslerinin alt konuları dışarıda", () => {
  it("kapsam: düğümün kısmı önce; ünitenin kalanı dışarıda, öbür ünitelerden aynı ad çıkar", () => {
    expect(
      resolveLessonSubtopicScope({
        lessonSubtopics: ["subtopic-1", "subtopic-2"],
        unitSubtopics: SUBTOPICS_5,
        otherUnitSubtopics: ["other-1", "subtopic-3", "other-2"],
      }),
    ).toEqual({ subtopics: ["subtopic-1", "subtopic-2"], excluded: ["subtopic-3", "subtopic-4", "subtopic-5"], otherUnits: ["other-1", "other-2"] });
    expect(resolveLessonSubtopicScope({ unitSubtopics: SUBTOPICS_5 }).subtopics).toEqual(SUBTOPICS_5);
    expect(resolveLessonSubtopicScope({ otherUnitSubtopics: ["other-1"] })).toEqual({ subtopics: [], excluded: [], otherUnits: [] });
  });

  it("bölünmüş ünite: istem kalan alt konuları dışarıda tutar, kapsam satırı onları ayrı adım sayar", () => {
    const prompt = teacherUserPrompt({ ...BASE, subtopics: ["subtopic-1", "subtopic-2"], excludedSubtopics: ["subtopic-3", "subtopic-4"] });
    expect(prompt).toContain("BU DERSİN DIŞINDA: ünitenin şu alt konuları ayrı bir derste anlatılıyor");
    expect(prompt).toContain("«subtopic-3», «subtopic-4»");
    expect(prompt).toContain("Hazırlıktaki şu konular ayrı adımlarda anlatılıyor: «subtopic-3», «subtopic-4»");
    // Planda yalnız bu dersin kısmı.
    expect(prompt).toContain("2) subtopic-2");
    expect(prompt).not.toContain("3) subtopic-3");
  });

  it("omurga: kendi alt konusu planda, kardeş ünitenin ve dersin dışındaki alt konu omurgada değil", () => {
    const pages = [
      {
        page: 1,
        text: [
          "## Alfa evresi",
          "Alfa kısmı anlatılır.",
          "## Kappa evresi",
          "Kappa kısmı başka ünitenindir.",
          "## Gama evresi",
          "Gama kısmı ünitenin öbür dersindedir.",
          "## Ara kontrol noktası",
          "Bu ünitenin kendi ara başlığı.",
        ].join("\n"),
      },
    ];
    const input = {
      ...BASE,
      pages,
      siblingTopics: ["Kappa evresi"],
      subtopics: ["Alfa evresi", "Beta evresi"],
      excludedSubtopics: ["Gama evresi"],
    };
    expect(inputBackbone(input)).toEqual(["Ara kontrol noktası"]);
    // Eski girdi (alt konusuz): kardeş başlık yine çıkar, öbürleri omurgada kalır.
    expect(inputBackbone({ ...BASE, pages, siblingTopics: ["Kappa evresi"] })).toEqual(["Alfa evresi", "Gama evresi", "Ara kontrol noktası"]);
  });

  it("daraltma: öbür ünitenin bölümü kaynaktan çıkar, kendi alt konusunun bölümü kalır", () => {
    // Daraltma konunun kendi metni en az 120 karakter kalınca uygulanır (`TOPIC_SECTION_MIN_CHARS`).
    const filler =
      "Bu bölüm kendi kuralını, istisnasını ve örneğini ayrıntılı biçimde anlatır; sınavda sorulan noktaları sırayla verir.";
    const pages = [
      {
        page: 1,
        text: ["## topic-alpha", filler, "## Kappa evresi", `Kappa ${filler}`, "## Alfa evresi", `Alfa ${filler}`].join("\n"),
      },
    ];
    // Eski davranış: ünitenin adı başlıkta varken adsız alt konu bölümü öbürünün sahibinde kalırdı.
    const old = narrowPagesToTopic(pages, "topic-alpha", ["Kappa evresi"]);
    expect(old.pages[0]!.text).not.toContain("Alfa ");
    const scoped = narrowPagesToTopic(pages, "topic-alpha", ["Kappa evresi"], { selfNames: ["Alfa evresi"] });
    expect(scoped.narrowed).toBe(true);
    expect(scoped.pages[0]!.text).toContain(`Alfa ${filler}`);
    expect(scoped.pages[0]!.text).not.toContain("Kappa ");
    expect(scoped.dropped).toEqual(["Kappa evresi"]);
  });
});

/* ───────────── Okuma: hazırlığın konu satırları (göç öncesi sütun yok) ───────────── */

function topicsService(result: { data?: unknown; error?: unknown } | (() => never)) {
  const calls: string[] = [];
  const chain = {
    select: (columns: string) => (calls.push(`select ${columns}`), chain),
    eq: (column: string, value: unknown) => (calls.push(`eq ${column}=${String(value)}`), chain),
    order: () => chain,
    limit: () => (typeof result === "function" ? result() : Promise.resolve({ data: null, error: null, ...result })),
  };
  return { service: { from: (table: string) => (calls.push(`from ${table}`), chain) } as never, calls };
}

describe("alt konu okuması: tek sorgu, hiçbir durumda fırlatmaz", () => {
  it("etkin ünitenin listesi kimlikle, yoksa adla; öbür ünitelerinki ayrı", async () => {
    const { loadUnitSubtopics } = await import("@/lib/learning/unit-subtopics-load");
    const rows = [
      { id: "t1", label: "topic-alpha", subtopics: ["subtopic-1", "subtopic-2"] },
      { id: "t2", label: "topic-beta", subtopics: ["other-1"] },
      { id: "t3", label: "topic-gamma", subtopics: null },
    ];
    const { service, calls } = topicsService({ data: rows });
    expect(await loadUnitSubtopics(service, { prepId: "p1", topicId: "t1", topicLabel: "x" })).toEqual({
      unit: ["subtopic-1", "subtopic-2"],
      others: ["other-1"],
    });
    expect(calls).toEqual(["from exam_prep_topics", "select id, label, subtopics", "eq exam_prep_id=p1"]);
    expect(await loadUnitSubtopics(topicsService({ data: rows }).service, { prepId: "p1", topicId: null, topicLabel: "Topic-Beta" })).toEqual({
      unit: ["other-1"],
      others: ["subtopic-1", "subtopic-2"],
    });
  });

  it("göç öncesi (sütun yok), boş hazırlık, alt konusuz satırlar ve atılan hata: null", async () => {
    const { loadUnitSubtopics } = await import("@/lib/learning/unit-subtopics-load");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = { prepId: "p1", topicId: "t1", topicLabel: "topic-alpha" };
    const missing = { code: "42703", message: "column exam_prep_topics.subtopics does not exist" };
    expect(await loadUnitSubtopics(topicsService({ error: missing }).service, input)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(await loadUnitSubtopics(topicsService({ data: [] }).service, input)).toBeNull();
    expect(await loadUnitSubtopics(topicsService({ data: [{ id: "t1", label: "topic-alpha", subtopics: [] }] }).service, input)).toBeNull();
    expect(
      await loadUnitSubtopics(
        topicsService(() => {
          throw new Error("down");
        }).service,
        input,
      ),
    ).toBeNull();
  });
});

describe("önceden yazılan ders: alt konu kümesi seçim anahtarında", () => {
  it("eski düğümde anahtar 'lesson'; bölünmüş ünitede küme izini taşır", async () => {
    const { prefetchVariant } = await import("@/lib/learning/lesson-prefetch");
    expect(prefetchVariant("lesson", { topicLabel: "topic-alpha" })).toBe("lesson");
    expect(prefetchVariant("lesson", { topicLabel: "topic-alpha", lessonSubtopics: [] })).toBe("lesson");
    const first = prefetchVariant("lesson", { topicLabel: "topic-alpha", lessonSubtopics: ["subtopic-1", "subtopic-2"] });
    expect(first).toBe(`lesson:s${subtopicListFingerprint(["subtopic-1", "subtopic-2"])}`);
    expect(prefetchVariant("lesson", { topicLabel: "topic-alpha", lessonSubtopics: [" Subtopic-1", "subtopic-2 "] })).toBe(first);
    expect(prefetchVariant("lesson", { topicLabel: "topic-alpha", lessonSubtopics: ["subtopic-3"] })).not.toBe(first);
  });
});

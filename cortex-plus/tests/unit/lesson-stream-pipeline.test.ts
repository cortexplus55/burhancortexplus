import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { LessonStreamReader } from "@/lib/learning/lesson-stream";
import { lessonStructureIssues } from "@/lib/learning/teacher-lesson";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Akışlı ders motoru (18 Ekim 2026). 17 Ekim canlı ölçümü: ders ~4 dk sürdü ve tek bir eşik
  itirazıyla atıldı ("ders oluşturulamadı"). Ürün sahibinin kararı: ilk ekran ~10 sn'de, kalite
  aynı. Yazar akışla yazar, her kavram biter bitmez denetlenir, yalnız sorunlu kavram düzeltilir,
  yazar haksız itiraza gerekçe yazabilir, düzelmeyen kavram atılır.
*/

const opener = {
  type: "check",
  check: {
    type: "trueFalse",
    prompt: "Hukuk kurallarını diğer kurallardan ayıran şey yalnızca hapis cezasıdır.",
    options: ["Doğru", "Yanlış"],
    answerIndex: 1,
    explanation: "Ayıran şey yaptırımın maddi olmasıdır.",
    corrected: "Hukuk kurallarını ayıran şey maddi yaptırımdır; hapis yalnızca biridir.",
    review: {
      prompt: "Haciz bir hukuk kuralının yaptırımı sayılmaz, çünkü kimse hapse girmez.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Haciz de devletin zorla uygulattığı maddi yaptırımdır.",
      corrected: "Haciz de maddi yaptırımdır.",
    },
  },
};
// Yanlıştan sonraki ikinci soru tam öğe (20 Ekim 2026): kendi şıkları, aynı doğru şık, kendi açıklaması.
const mcq = (prompt: string) => ({
  type: "check",
  check: {
    type: "mcq",
    prompt,
    options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"],
    answerIndex: 0,
    explanation: "Kurucu unsur yoksa işlem doğmaz; ötekiler doğmuş ama sakat işlemlerdir.",
    optionWhy: ["Kurucu unsur yok.", "Emredici kurala aykırı.", "İrade sakatlığı.", "Onay eksik."],
    review: {
      prompt: "Taraflardan hiçbirinin iradesini açıklamadığı bir işlem hangi türdür?",
      options: ["Mutlak butlan", "Yokluk", "Nispi butlan", "Bağlamazlık"],
      answerIndex: 1,
      explanation: "İrade açıklaması kurucu unsurdur; yoksa işlem hiç doğmaz. Mutlak butlanda unsurlar vardır.",
    },
  },
});

const lesson: LessonV3 = {
  format: 3,
  title: "Hukukun Yaptırımları",
  overview: "Devlet bir kurala uyulmasını zorla sağlayabiliyorsa o kural hukuktur.",
  objective: "Yaptırım türlerini ayırt etmek.",
  screens: [
    {
      heading: "Maddi Yaptırım",
      concept: "Maddi Yaptırım",
      lead: "Hukuku öteki kurallardan ayıran şey",
      blocks: [
        opener,
        { type: "text", text: "Hukuku diğer sosyal kurallardan ayıran şey **maddi yaptırım**dır; devlet zorlar." },
        { type: "note", note: { title: "Örnek vaka: Ceza ve tazminat", body: "Kırmızıda geçip çarparsan devlete ödediğin ceza, hasarı ödemen tazminattır.", tone: "info" } },
      ],
    },
    {
      heading: "Yokluk",
      concept: "Yokluk",
      lead: "Hiç doğmamış işlem",
      blocks: [{ type: "text", text: "Kurucu unsuru hiç olmayan işlem **yokluk** ile sakattır." }, mcq("Nikâh memuru önünde yapılmayan evlilik hangi türdür?")],
    },
    {
      heading: "Mutlak Butlan",
      concept: "Mutlak Butlan",
      lead: "Doğmuş ama sakat işlem",
      blocks: [
        { type: "text", text: "Kurucu unsurları olup emredici kurala aykırı işlem **mutlak butlan** ile geçersizdir." },
        {
          type: "memory_hook_card",
          hook: {
            kind: "analogy",
            title: "Doğmuş ama düşmüş bina",
            body: "Mutlak butlan, temeli atılmış ama taşıyıcı kuralı çiğnenmiş bir bina gibi: duruyor görünür, hüküm doğurmaz.",
          },
        },
        {
          type: "comparison_carousel",
          carousel: {
            title: "Yokluk ve mutlak butlan",
            mode: "compare",
            slides: [
              { title: "Yokluk", body: "Kurucu unsur hiç yoktur.", points: ["İşlem doğmaz"] },
              { title: "Mutlak butlan", body: "Unsurlar vardır, emredici kural çiğnenir.", points: ["Herkes ileri sürer"] },
            ],
          },
        },
        {
          type: "diagram",
          diagram: {
            layout: "flow",
            caption: "Sakat işlem türlerinin sırası",
            nodes: [
              { id: "yok", label: "Yokluk" },
              { id: "but", label: "Butlan" },
            ],
          },
        },
        {
          type: "diagram_card",
          diagramKind: "process_network",
          title: "Sakat işlem",
          items: [
            { label: "Yokluk", detail: "doğmaz" },
            { label: "Butlan", detail: "sakat" },
          ],
        },
        mcq("Amca ile yeğen arasındaki evlilik hangi türdür?"),
        // Derste en az bir "Neden böyle?" kutusu (23 Ekim 2026); yoksa kapanış bir öğretim turu açar.
        { type: "note", note: { title: "Neden böyle?: Mutlak butlanı neden herkes ileri sürebilir?", body: "Emredici kural kamu düzenini korur; aykırılık yalnız tarafları ilgilendirmez.", tone: "general" } },
      ],
    },
  ],
  summary: ["Hukuku ayıran maddi yaptırımdır.", "Kurucu unsur yoksa yokluk.", "Emredici kurala aykırılık mutlak butlan."],
  nextFocus: [],
} as LessonV3;

const input = { topicLabel: "Hukukun yaptırımları", prepTitle: "KPSS", pages: [{ page: 5, text: "Maddi yaptırım, yokluk, mutlak butlan." }], upcomingTopics: [] };

/** Metni rastgele boyda parçalarla akıtır: okuyucu parça sınırına takılmamalı. */
function chunks(text: string, seed = 7): string[] {
  const out: string[] = [];
  let state = seed;
  for (let at = 0; at < text.length; ) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const size = 1 + (state % 23);
    out.push(text.slice(at, at + size));
    at += size;
  }
  return out;
}

async function run(options: {
  verify?: (user: string, round: number) => unknown;
  fix?: (user: string) => unknown;
  drafts?: string[];
  started?: number;
  pages?: { page: number; text: string }[];
  coverageBudget?: "student" | "prefetch";
}) {
  const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
  const drafts = options.drafts ?? [JSON.stringify(lesson)];
  const writes: string[] = [];
  const published: { screens: number; done: boolean; upcoming: string[] }[] = [];
  const result = await teacherLessonPipeline(
    {
      write: async (_system, user, onDelta) => {
        writes.push(user);
        const text = drafts.shift() ?? "";
        for (const piece of chunks(text)) onDelta(piece);
        return { text, finish: "stop" };
      },
    },
    {
      ...input,
      ...(options.pages ? { pages: options.pages } : {}),
      ...(options.coverageBudget ? { coverageBudget: options.coverageBudget } : {}),
    },
    {
      started: options.started,
      onPublish: (item) => void published.push({ screens: item.lesson.screens.length, done: item.done, upcoming: item.upcoming }),
    },
  );
  return { result, calls: [] as { role: string; user: string }[], published, writes };
}

describe("akış okuyucu", () => {
  it("ekranları biter bitmez, sırayla çıkarır; dizgideki parantez ve tırnak sayılmaz", () => {
    const tricky = {
      ...lesson,
      overview: 'Kanca: "tırnak" ve {süslü} [köşeli] parantez, kaçış \\ işareti.',
      screens: lesson.screens.map((screen, index) => ({ ...screen, heading: index === 1 ? 'Yokluk "{ }"' : screen.heading })),
    };
    const text = JSON.stringify(tricky);
    const reader = new LessonStreamReader();
    const seen: number[] = [];
    for (const piece of chunks(text, 3)) {
      const found = reader.feed(piece);
      if (found.length) seen.push(reader.screens.length);
    }
    expect(reader.screens).toHaveLength(3);
    expect(seen.at(-1)).toBe(3);
    expect((reader.screens[1] as { heading: string }).heading).toBe('Yokluk "{ }"');
    expect(reader.header).toMatchObject({ title: lesson.title, overview: tricky.overview });
    expect(reader.broken).toBe(0);
  });

  it("fikstür yapı denetiminden temiz geçer", () => {
    expect(lessonStructureIssues(lesson, {})).toEqual([]);
  });
});

describe("kavram kavram denetim ve yayım", () => {
  it("ayrışan taslak sırayla yayımlanır; denetçi ve düzeltme çağrısı yok", async () => {
    const { result, calls, published } = await run({
      verify: () => ({ issues: [{ where: "screens[1]", severity: "high", problem: "Yanlış bilgi." }] }),
      fix: () => ({ screens: [], disputes: [] }),
    });
    expect(result.lesson?.screens.map((screen) => screen.heading)).toEqual(["Maddi Yaptırım", "Yokluk", "Mutlak Butlan"]);
    expect(result.lesson?.summary).toEqual(lesson.summary);
    expect(result.dropped).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(published[0]).toMatchObject({ screens: 1, done: false });
    expect(published.map((item) => item.screens)).toEqual([1, 2]);
    const { firstScreenMs, firstPartMs, firstPublishMs, writeMs } = result.timing;
    expect([firstScreenMs, firstPartMs, firstPublishMs, writeMs].every((v) => typeof v === "number" && v >= 0)).toBe(true);
    expect(firstScreenMs!).toBeLessThanOrEqual(firstPartMs!);
    expect(firstPartMs!).toBeLessThanOrEqual(firstPublishMs!);
  });

  it("taslak okunamazsa nedeni kaydedilir ve ikinci kez yazılmaz", async () => {
    const { result, writes } = await run({ drafts: ['{"error": "konu çok geniş"}', JSON.stringify(lesson)] });
    expect(result.lesson).toBeNull();
    expect(writes).toHaveLength(1);
    expect(result.draftNote).toContain("0 ekran okundu");
    expect(result.draftNote).toContain("konu çok geniş");
  });
});

describe("motor ayarları", () => {
  const run = readSource("src/lib/learning/teacher-lesson-run.ts");
  it("yazar akışla ve düşük düşünmeyle; denetçi varsayılan düşünmeyle; öğrenci beklerken hızlı işlem", () => {
    expect(run).toContain("stream: true");
    expect(run).toMatch(/reasoning_effort: "low",\s*\.\.\.tier/);
    expect(run).not.toContain('role === "fix"');
    expect(run).toContain('const tier = options.fast ? ({ service_tier: "fast" } as const) : {};');
    expect(run).toContain('const fast = Boolean(input.fast) && (await fastAllowedFor(service, input.userId));');
    // Öğrenci beklerken hızlı işlem; ısınma 23 Ekim 2026'dan beri normal işlemde.
    expect(readSource('src/app/api/learning/exam-prep/node/route.ts')).toContain('fast: input.charge !== false || input.firstLesson === true,');
    expect(run).toContain("`${model}-fast`");
  });

  it("denetçi eksik ayrıntıyı ciddi saymaz; eşdeğer söyleyiş sorun değildir", async () => {
    const { VERIFY_SYSTEM, TOPIC_VERIFY_SYSTEM } = await import("@/lib/learning/teacher-lesson");
    for (const system of [VERIFY_SYSTEM, TOPIC_VERIFY_SYSTEM]) {
      expect(system).toContain("tek başına 'low'dur");
      expect(system).toContain("Emin olmadığın bir şeyi 'high' yazma");
    }
  });
});

describe("düzeltilen kısım", () => {
  it("model yalnız değiştirdiği ekranı döndürürse öbür ekran (tablonun durduğu) kaybolmaz", async () => {
    const { mergePartScreens } = await import("@/lib/learning/teacher-lesson-run");
    const [a, b] = [lesson.screens[1]!, lesson.screens[2]!];
    const fixedB = { ...b, blocks: [{ type: "text" as const, text: "Düzeltilmiş metin." }, ...b.blocks.slice(1)] };
    expect(mergePartScreens([a, b], [fixedB])).toEqual([a, fixedB]);
    // Başlık tutmuyorsa model kısmı bilerek birleştirmiştir.
    const merged = { ...a, heading: "Yokluk ve Butlan" };
    expect(mergePartScreens([a, b], [merged])).toEqual([merged]);
    expect(mergePartScreens([a], [b, a])).toEqual([b, a]);
  });
});

describe("tek geçiş yayımlar", () => {
  it("denetçi itirazı kavramı silmez ve ikinci model turu açmaz", async () => {
    const { result, calls } = await run({
      verify: () => ({ issues: [{ where: "screens[0]", severity: "high", problem: "Yanlış bilgi." }] }),
      fix: () => ({ screens: [], disputes: [] }),
    });
    expect(result.dropped).toEqual([]);
    expect(result.lesson?.screens).toHaveLength(3);
    expect(calls).toHaveLength(0);
  });
});

describe("ezber kodu ve öğretim kuralları istemde kalır", () => {
  it("yazar ve denetçi aynı ezber kodu örneklerini görür", async () => {
    const { verifySystem, teacherSystem, MNEMONIC_EXAMPLES } = await import("@/lib/learning/teacher-lesson");
    expect(MNEMONIC_EXAMPLES).toContain("C ile Ç");
    expect(teacherSystem("document")).toContain(MNEMONIC_EXAMPLES);
    expect(verifySystem("document")).toContain(MNEMONIC_EXAMPLES);
  });

  it("yazar ve denetçi aynı Neden böyle kuralını okur", async () => {
    const { teacherSystem, verifySystem, lessonStructureIssues, TOPIC_TEACHER_SYSTEM } = await import("@/lib/learning/teacher-lesson");
    const { WHY_NOTE_RULE } = await import("@/lib/learning/teaching-rubric");
    expect(teacherSystem("document")).toContain(WHY_NOTE_RULE);
    expect(verifySystem("document")).toContain(WHY_NOTE_RULE);
    expect(TOPIC_TEACHER_SYSTEM).not.toContain(WHY_NOTE_RULE);
    const why = (title: string) => ({ type: "note", note: { title, body: "İnek sütündeki demir az emilir ve bağırsakta kan kaybı yapabilir.", tone: "general" } });
    const withWhy = {
      ...lesson,
      screens: lesson.screens.map((screen, i) => ({ ...screen, blocks: [...screen.blocks, ...(i < 3 ? [why("Neden böyle?: İnek sütü neden erken verilmez?")] : [])] })),
    } as LessonV3;
    const issues = lessonStructureIssues(withWhy, { runningHeaders: [] });
    expect(issues.some((issue) => /Genel bilgi/.test(issue.problem))).toBe(false);
  });

  it("belgeli derste kutu yoksa kapanışta istenir; belgesiz derste istenmez", async () => {
    const { lessonStructureIssues } = await import("@/lib/learning/teacher-lesson");
    const without = { ...lesson, screens: lesson.screens.map((screen) => ({ ...screen, blocks: screen.blocks.filter((block) => block.type !== "note" || block.note.tone !== "general") })) } as LessonV3;
    const asked = lessonStructureIssues(without, { runningHeaders: [], pages: input.pages }).filter((issue) => /Neden böyle\?' kutusu yok/.test(issue.problem));
    expect(asked.map((issue) => [issue.where, issue.severity])).toEqual([["screens[2]", "medium"]]);
    expect(lessonStructureIssues(without, { runningHeaders: [], pages: [] }).some((issue) => /Neden böyle\?' kutusu yok/.test(issue.problem))).toBe(false);
  });

  it("döngüsel kutu ve eksik kutu ayırt edilir; yayım ikinci tur açmaz", async () => {
    const { isCircularWhyIssue, isMissingWhyIssue } = await import("@/lib/learning/teacher-lesson");
    expect(isCircularWhyIssue({ where: "screens[2].blocks[2]", severity: "medium", problem: "[öğretim] Döngüsel Neden böyle?: kutu başlığı yeniden söylüyor." })).toBe(true);
    expect(isMissingWhyIssue({ where: "screens[2]", severity: "medium", problem: "[yapı kuralı] Derste 'Neden böyle?' kutusu yok: …" })).toBe(true);
    const { calls, result } = await run({
      verify: () => ({ issues: [{ where: "screens[1]", severity: "medium", problem: "Döngüsel Neden böyle?: kendini tekrar ediyor." }] }),
    });
    expect(calls.filter((call) => call.role === "fix-careful")).toHaveLength(0);
    expect(result.dropped).toEqual([]);
  });
});

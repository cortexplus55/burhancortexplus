import { readFileSync } from "node:fs";
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
  },
};
const mcq = (prompt: string) => ({
  type: "check",
  check: {
    type: "mcq",
    prompt,
    options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Bağlamazlık"],
    answerIndex: 0,
    explanation: "Kurucu unsur yoksa işlem doğmaz; ötekiler doğmuş ama sakat işlemlerdir.",
    optionWhy: ["Kurucu unsur yok.", "Emredici kurala aykırı.", "İrade sakatlığı.", "Onay eksik."],
    review: { prompt: "Kurucu unsuru tam ama emredici kurala aykırı işlem hangisidir?" },
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
        { type: "note", note: { title: "Günlük hayattan: Ceza ve tazminat", body: "Kırmızıda geçip çarparsan devlete ödediğin ceza, hasarı ödemen tazminattır.", tone: "info" } },
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
      blocks: [{ type: "text", text: "Kurucu unsurları olup emredici kurala aykırı işlem **mutlak butlan** ile geçersizdir." }, mcq("Amca ile yeğen arasındaki evlilik hangi türdür?")],
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

type Call = { role: "verify" | "fix" | "fix-careful"; user: string };

async function run(options: {
  verify: (user: string, round: number) => unknown;
  fix?: (user: string) => unknown;
  drafts?: string[];
}) {
  const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
  const drafts = options.drafts ?? [JSON.stringify(lesson)];
  const calls: Call[] = [];
  const published: { screens: number; done: boolean; upcoming: string[] }[] = [];
  const verifyRounds = new Map<string, number>();
  const result = await teacherLessonPipeline(
    {
      write: async (_system, _user, onDelta) => {
        const text = drafts.shift() ?? "";
        for (const piece of chunks(text)) onDelta(piece);
        return { text, finish: "stop" };
      },
      ask: async (_system, user, role) => {
        calls.push({ role, user });
        if (role !== "verify") return options.fix?.(user) ?? null;
        const key = /DENETLENECEK: yalnız (screens\[\d+\])/.exec(user)?.[1] ?? "?";
        const round = verifyRounds.get(key) ?? 0;
        verifyRounds.set(key, round + 1);
        return options.verify(user, round);
      },
    },
    input,
    { onPublish: (item) => void published.push({ screens: item.lesson.screens.length, done: item.done, upcoming: item.upcoming }) },
  );
  return { result, calls, published };
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
    expect(lessonStructureIssues(lesson, {}).filter((issue) => issue.severity === "high")).toEqual([]);
  });
});

describe("kavram kavram denetim ve yayım", () => {
  it("her kavram ayrı denetlenir ve sırayla yayımlanır; düzeltme çağrısı yok", async () => {
    const { result, calls, published } = await run({ verify: () => ({ issues: [] }) });
    expect(result.lesson?.screens.map((screen) => screen.heading)).toEqual(["Maddi Yaptırım", "Yokluk", "Mutlak Butlan"]);
    expect(result.lesson?.summary).toEqual(lesson.summary);
    expect(calls.filter((call) => call.role === "verify")).toHaveLength(3);
    expect(calls.some((call) => call.role !== "verify")).toBe(false);
    // İlk yayım giriş kartı + ilk kavram; son kavram dersin bütünüyle (çağıran kaydeder).
    expect(published[0]).toMatchObject({ screens: 1, done: false });
    expect(published.map((item) => item.screens)).toEqual([1, 2]);
    // Denetçi yalnız kendi kısmını denetler; ilk kısım giriş alanlarını, son kısım özeti taşır.
    const verifies = calls.filter((call) => call.role === "verify").map((call) => call.user);
    expect(verifies[0]).toContain("DENETLENECEK: yalnız screens[0], title, overview, objective");
    expect(verifies[2]).toContain("DENETLENECEK: yalnız screens[2], commonMistake, summary");
    // Zaman çizgisi kayda gidiyor (19 Ekim 2026): ilk ekran ≤ ilk kavram ≤ ilk yayım; akış sonu dolu.
    const { firstScreenMs, firstPartMs, firstPublishMs, writeMs } = result.timing;
    expect([firstScreenMs, firstPartMs, firstPublishMs, writeMs].every((v) => typeof v === "number" && v >= 0)).toBe(true);
    expect(firstScreenMs!).toBeLessThanOrEqual(firstPartMs!);
    expect(firstPartMs!).toBeLessThanOrEqual(firstPublishMs!);
  });

  it("sorunlu kavram yalnız kendisi düzeltilir; dersin tamamı yeniden yazılmaz", async () => {
    const fixedScreen = { ...lesson.screens[1], blocks: [{ type: "text", text: "Kurucu unsuru hiç olmayan işlem **yokluk**tur; hiç doğmamıştır." }, mcq("Nikâh memuru önünde yapılmayan evlilik hangi türdür?")] };
    const { result, calls } = await run({
      verify: (user, round) =>
        user.includes("yalnız screens[1]") && round === 0
          ? { issues: [{ where: "screens[1].blocks[0]", severity: "high", problem: "Yokluğun sonucu söylenmiyor, yanıltıcı." }] }
          : { issues: [] },
      fix: () => ({ screens: [fixedScreen], disputes: [] }),
    });
    expect(result.lesson?.screens[1]!.blocks[0]).toMatchObject({ text: expect.stringContaining("hiç doğmamıştır") });
    expect(result.fixTriggers).toHaveLength(1);
    const fix = calls.find((call) => call.role !== "verify")!.user;
    // İlk kavramdan sonrası öğrenci okurken düzelir: dikkatli düzeltme.
    expect(calls.find((call) => call.role !== "verify")!.role).toBe("fix-careful");
    expect(fix).toContain("DÜZELTİLECEK KISIM: screens[1]");
    expect(fix).toContain("Dersin tamamını DEĞİL");
  });

  it("yazar haksız itiraza gerekçe yazar; denetçi gerekçeyi görür ve ders düşmez", async () => {
    const { result, calls } = await run({
      verify: (user, round) =>
        user.includes("yalnız screens[0]") && round === 0
          ? { issues: [{ where: "screens[0].blocks[1]", severity: "high", problem: "Eşik ACOG'a göre farklı." }] }
          : { issues: [] },
      fix: () => ({ screens: [], disputes: [{ where: "screens[0].blocks[1]", reason: "ACOG: normalin 2 katı; ders aynısını söylüyor." }] }),
    });
    expect(result.lesson?.screens[0]).toEqual(expect.objectContaining({ heading: "Maddi Yaptırım" }));
    const second = calls.filter((call) => call.role === "verify" && call.user.includes("yalnız screens[0]"))[1]!.user;
    expect(second).toContain("YAZARIN İTİRAZLARI");
    expect(second).toContain("ACOG: normalin 2 katı");
  });

  it("düzelmeyen ara kavram baştan yazılır; o da geçmezse atılır, ders kalanla gider; ilk kavram düzelmezse ders yazılmaz", async () => {
    const stuck = (target: string) => (user: string) =>
      user.includes(`yalnız ${target}`) ? { issues: [{ where: target, severity: "high", problem: "Yanlış bilgi." }] } : { issues: [] };
    const middle = await run({ verify: stuck("screens[1]"), fix: () => ({ screens: [lesson.screens[1]], disputes: [] }) });
    expect(middle.result.dropped).toEqual(["Yokluk"]);
    expect(middle.result.lesson?.screens.map((screen) => screen.heading)).toEqual(["Maddi Yaptırım", "Mutlak Butlan"]);
    // Ara kavrama bir tur fazla hak (3), sonra bir kez baştan yazım ve bir düzeltme daha.
    const careful = middle.calls.filter((call) => call.role === "fix-careful");
    expect(careful).toHaveLength(5);
    expect(careful.filter((call) => call.user.includes("YENİDEN YAZILACAK KISIM: screens[1]"))).toHaveLength(1);

    const first = await run({ verify: stuck("screens[0]"), fix: () => ({ screens: [lesson.screens[0]], disputes: [] }) });
    expect(first.result.lesson).toBeNull();
    expect(first.result.failure[0]!.problem).toBe("Yanlış bilgi.");
    expect(first.published).toEqual([]);
  });

  // 18 Ekim 2026, Pediatri: aynı taslağı yamalayan üç tur aynı yerde takıldı, sınavın en önemli
  // kavramı (gelişim basamakları) atıldı. Ürün sahibi: "arkada yeniden yazılsın".
  it("baştan yazılan kavram denetimden geçerse derste yerinde kalır", async () => {
    const rewritten = { ...lesson.screens[1]!, heading: "Yokluk: hiç doğmamış işlem", blocks: [{ type: "text", text: "Kurucu unsuru eksik işlem hukuken **hiç doğmamıştır**: yokluk." }, mcq("Nikâh memuru önünde yapılmayan evlilik hangi türdür?")] };
    const { result, calls, published } = await run({
      verify: (user) =>
        user.includes("yalnız screens[1]") && !user.includes("hiç doğmamıştır")
          ? { issues: [{ where: "screens[1]", severity: "high", problem: "Tablo yok." }] }
          : { issues: [] },
      fix: (user) => (user.includes("YENİDEN YAZILACAK KISIM") ? { screens: [rewritten] } : { screens: [lesson.screens[1]], disputes: [] }),
    });
    expect(result.dropped).toEqual([]);
    expect(result.lesson?.screens.map((screen) => screen.heading)).toEqual(["Maddi Yaptırım", "Yokluk: hiç doğmamış işlem", "Mutlak Butlan"]);
    // Kavram adı korunur: giriş kartı ve yayım sırası bozulmaz.
    expect(result.lesson?.screens[1]?.concept).toBe("Yokluk");
    expect(calls.filter((call) => call.user.includes("YENİDEN YAZILACAK KISIM"))).toHaveLength(1);
    // Beklerken kavram "hazırlanıyor" olarak duyurulur, ilk kavram yalnız başına yayımlanmıştı.
    expect(published[0]).toEqual(expect.objectContaining({ screens: 1, upcoming: ["Yokluk", "Mutlak Butlan"] }));
  });

  it("taslak okunamazsa nedeni kaydedilir ve bir kez baştan yazılır", async () => {
    const { result } = await run({ verify: () => ({ issues: [] }), drafts: ['{"error": "konu çok geniş"}', JSON.stringify(lesson)] });
    expect(result.lesson?.screens).toHaveLength(3);
    expect(result.draftNote).toContain("0 ekran okundu");
    expect(result.draftNote).toContain("konu çok geniş");
  });
});

describe("motor ayarları", () => {
  const run = readFileSync("src/lib/learning/teacher-lesson-run.ts", "utf8");
  it("yazar akışla ve düşük düşünmeyle; denetçi varsayılan düşünmeyle; öğrenci beklerken hızlı işlem", () => {
    expect(run).toContain("stream: true");
    expect(run).toMatch(/reasoning_effort: "low",\s*\.\.\.tier/);
    expect(run).toContain('...(role === "fix" ? { reasoning_effort: "low" as const } : {})');
    expect(run).toContain('const tier = options.fast ? ({ service_tier: "fast" } as const) : {};');
    expect(run).toContain('fast: input.fast,');
    expect(readFileSync('src/app/api/learning/exam-prep/node/route.ts', 'utf8')).toContain('fast: input.charge !== false,');
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

describe("ilk kavramın erken denetimi", () => {
  async function slowRun(draft: LessonV3) {
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const events: string[] = [];
    const result = await teacherLessonPipeline(
      {
        write: async (_system, _user, onDelta) => {
          const text = JSON.stringify(draft);
          // Akış gerçekteki gibi parça parça ve zamana yayılı gelsin.
          for (const piece of chunks(text)) {
            onDelta(piece);
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          events.push("yazım bitti");
          return { text, finish: "stop" };
        },
        ask: async (_system, user) => {
          events.push(/DENETLENECEK: yalnız ([^.]*)\./.exec(user)?.[1] ?? "?");
          return { issues: [] };
        },
      },
      input,
    );
    return { result, events };
  }

  it("tek ekranlı ilk kavram yazım bitmeden denetlenir; fazladan çağrı yok", async () => {
    const { result, events } = await slowRun(lesson);
    expect(result.lesson?.screens).toHaveLength(3);
    const first = events.findIndex((event) => event.startsWith("screens[0],"));
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(events.indexOf("yazım bitti"));
    expect(events.filter((event) => event !== "yazım bitti")).toHaveLength(3);
  });

  it("ilk kavram iki ekranlıysa erken denetim atılır, iki ekran birlikte denetlenir", async () => {
    const second = { ...lesson.screens[0]!, heading: "Maddi Yaptırım: türleri", blocks: [{ type: "text", text: "Ceza, tazminat ve cebri icra maddi yaptırımdır." }, { type: "table", table: { caption: "Türler", columns: ["Tür", "Örnek"], rows: [["Ceza", "Hapis"], ["Tazminat", "Zarar ödemesi"]] } }, mcq("Hangisi maddi yaptırımdır?")] };
    const draft = { ...lesson, screens: [lesson.screens[0]!, second, ...lesson.screens.slice(1)] } as LessonV3;
    const { result, events } = await slowRun(draft);
    expect(result.lesson?.screens.map((screen) => screen.heading)).toEqual(["Maddi Yaptırım", "Maddi Yaptırım: türleri", "Yokluk", "Mutlak Butlan"]);
    expect(events.some((event) => event.startsWith("screens[0]–screens[1]"))).toBe(true);
  });
});

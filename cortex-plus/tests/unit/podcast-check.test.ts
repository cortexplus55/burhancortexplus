import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  PODCAST_CHECK_BRIEF,
  podcastCheckOf,
  podcastCheckSource,
  podcastPayloadEpisode,
  scorePodcastCheck,
} from "@/lib/learning/podcast-check";
import { checkLoopClock, podcastListeningCheck } from "@/lib/learning/teacher-podcast-run";
import { pathDecision } from "@/lib/learning/path-change";
import { loadLevelHint } from "@/lib/learning/prep-level";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";

/*
  20 Ekim 2026 kör kıyas: Astra'nın podcast'i sonda soru soruyordu, bizimki "Dinledin, konu
  kulağında" deyip bitiyordu. Denetlenmiş senaryodan test motoru üç soru yazar; atlanabilir
  ("Şimdi değil" → bugünkü gibi 1/1, puansız, kanıtsız); yazılamazsa podcast yine gelir.
*/
const episode: PodcastEpisode = {
  title: "Büyüme ve Gelişme",
  length: "diyalog",
  chapters: [
    {
      title: "Persentil eğrisi",
      lines: [
        { speaker: "ada", text: "Tek ölçüm normal olsa da yeterli mi?" },
        { speaker: "kerem", text: "Ben tek ölçümü yeterli sanmışım." },
        { speaker: "ada", text: "Hayır; ölçüler zaman içinde persentil eğrisiyle izlenir." },
      ],
    },
    {
      title: "Kilo ve boy",
      lines: [
        { speaker: "ada", text: "Belgende geçmiyor ama bilmen iyi olur: büyüme eğrileri ülkeye göre değişir." },
        { speaker: "ada", text: "Kitaplarda şöyle anlatılır: vücut kıtlıkta enerjiyi önce beyne ayırır." },
        { speaker: "kerem", text: "Kilo akut beslenmeyi, boy kronik süreçleri yansıtır." },
        { speaker: "ada", text: "Bebek bir hafta ishal olsa hangisi önce düşer?", beat: "ask" },
        { speaker: "ada", text: "Kilo; boy haftalarca değişmez.", beat: "reveal" },
      ],
    },
  ],
};

const question = (text: string, answer: string, others: string[]) => ({
  text,
  options: [answer, ...others],
  correct: answer,
  multi: false,
  explanation: `${answer}: podcast'teki açıklama bunu söylüyor ve nedenini veriyor.`,
  optionWhy: [
    "Bu ifade bölümde açıkça söylenen bilgidir.",
    "Bu ifade bölümde söylenenle çelişir.",
    "Bu ifade bölümde hiç geçmeyen bir iddiadır.",
    "Bu ifade iki kavramı birbirine karıştırır.",
  ],
  misconceptionTag: "ölçü karışıklığı",
  learningObjective: "Büyüme ölçülerinin neyi yansıttığını ayırt eder.",
});
const quizDraft = {
  questions: [
    question("Bir çocuğun büyümesini değerlendirirken tek ölçüm neden yetmez?", "Zaman içindeki değişimi göstermez", [
      "Ölçüm aletleri hep hatalıdır",
      "Yalnız yetişkinde anlamlıdır",
      "Her ay aynı sonucu verir",
    ]),
    question("Akut beslenme bozukluğunda önce hangi ölçü etkilenir?", "Kilo", ["Boy", "Baş çevresi", "Kemik yaşı"]),
    question("Boy uzaması daha çok neyi yansıtır?", "Kronik süreçleri", ["Son haftanın öğünlerini", "Günlük sıvı alımını", "Mevsim değişimini"]),
    question("Persentil eğrisinde değerli olan nedir?", "Çocuğun kendi eğrisini koruması", [
      "Tek ölçümün ortalamada olması",
      "Kardeşiyle aynı eğride olması",
      "Her ay eğri değiştirmesi",
    ]),
    question("Baş çevresi ilk yıllarda hangi gelişmeyle ilişkilidir?", "Beyin büyümesi", ["Kas gücü", "Diş çıkarma", "Boy uzaması"]),
  ],
};

describe("dinleme kontrolü: kaynak, okuma, puan", () => {
  it("kaynak bölüm bölüm; etiketli genel bilgi sorulmaz; iki sunucuda rol yazar", () => {
    const source = podcastCheckSource(episode);
    expect(source).toContain("Persentil eğrisi:\n");
    expect(source).toContain("KEREM (öğrenci): Ben tek ölçümü yeterli sanmışım.");
    expect(source).toContain("ADA: Dur ve düşün: Bebek bir hafta ishal olsa hangisi önce düşer?");
    expect(source).toContain("ADA: Cevap: Kilo; boy haftalarca değişmez.");
    expect(source).not.toMatch(/Öğretmen:|Sunucu:/);
    expect(source).not.toContain("Belgende geçmiyor ama");
    // 23 Ekim 2026: yeni hafif etiketli ders kitabı nedeni de sorulmaz.
    expect(source).not.toContain("Kitaplarda şöyle anlatılır");
    expect(PODCAST_CHECK_BRIEF).toContain("yalnız yanlış şık olabilir");
    const single = podcastCheckSource({ ...episode, chapters: [{ title: "Tek", lines: [{ speaker: "ada", text: "Kilo hızlı değişir." }] }] });
    expect(single).toBe("Tek:\nKilo hızlı değişir.");
  });

  it("puan: kontrol yoksa 0; atlandıysa soru sayısı; cevaplandıysa doğru / soru", () => {
    const check = [
      { text: "A?", options: ["x", "y"], correct: ["x"], multi: false },
      { text: "B?", options: ["x", "y"], correct: ["y"], multi: false },
      { text: "C?", options: ["x", "y"], correct: ["x"], multi: false },
    ];
    expect(scorePodcastCheck({ type: "podcast" }, { "0": "x" })).toEqual({ score: 1, total: 1 });
    expect(scorePodcastCheck({ type: "podcast", check }, {})).toEqual({ score: 1, total: 1 });
    expect(scorePodcastCheck({ type: "podcast", check }, { __meta: { hintsUsed: {} } })).toEqual({ score: 1, total: 1 });
    expect(scorePodcastCheck({ type: "podcast", check }, { "0": "x", "1": "x", "2": "x" })).toEqual({ score: 2, total: 3 });
    // Bozuk öğe atılır; en çok beş soru (23 Ekim 2026'dan beri; önce üç).
    expect(podcastCheckOf({ check: [...check, check[0], check[1], check[2], { text: 1 }, null] })).toHaveLength(5);
    expect(podcastCheckOf({ check: "yok" })).toEqual([]);
  });

  it("kayıttaki podcast payload'ı önbelleğe yazılacak bölüme çevrilir", () => {
    expect(podcastPayloadEpisode({ type: "podcast", title: "T", chapters: episode.chapters, length: "soru_cevap" })).toMatchObject({
      title: "T",
      length: "soru_cevap",
    });
    expect(podcastPayloadEpisode({ type: "quiz", title: "T", chapters: episode.chapters })).toBeNull();
    expect(podcastPayloadEpisode({ type: "podcast", title: "T", chapters: [] })).toBeNull();
  });

  it("dinleme kontrolü yolu uyarlamaz (az önce duyulanı soran üç soru zayıf kanıt)", () => {
    expect(pathDecision({ kind: "podcast", score: 0, total: 3 })).toBeNull();
    expect(pathDecision({ kind: "podcast", score: 3, total: 3 })).toBeNull();
  });
});

describe("dinleme kontrolü: test motoru senaryodan yazar", () => {
  // Şık sayısı öğrencinin sınavı (Paket A); taslaktaki sorular dört şıklı.
  const input = { topicLabel: "Büyüme ve gelişme", prepTitle: "Pediatri", listeningCheck: true, optionCount: 4 as const };
  const asker = (draft: unknown) => {
    const calls: { system: string; user: string; role?: string }[] = [];
    const ask = vi.fn(async (system: string, user: string, role?: "draft" | "verify" | "fix" | "script" | "scriptfix") => {
      calls.push({ system, user, role });
      return system.includes("denetçisisin") ? { issues: [] } : draft;
    });
    return { ask, calls };
  };

  it("en çok beş soru; kaynak senaryo, istek satırı kontrol notu, kip belgeli", async () => {
    const { ask, calls } = asker(quizDraft);
    const check = await podcastListeningCheck(ask, episode, input, Date.now());
    expect(check.length).toBeGreaterThanOrEqual(3);
    expect(check.length).toBeLessThanOrEqual(5);
    expect(check.every((item) => item.options.length === 4 && item.correct.length >= 1)).toBe(true);
    const draft = calls.find((call) => call.role === "draft")!;
    expect(draft.user).toContain(PODCAST_CHECK_BRIEF);
    expect(draft.user).toContain("KAYNAK:\nPersentil eğrisi:");
    expect(draft.user).not.toContain("Belgende geçmiyor ama");
    expect(draft.user).toContain("İSTEK");
    expect(calls.some((call) => call.role === "verify")).toBe(false);
  });

  it("kontrol hiçbir zaman podcast'i düşürmez: yazılamazsa, azsa, süre geçtiyse, istenmediyse boş", async () => {
    expect(await podcastListeningCheck(asker({}).ask, episode, input, Date.now())).toEqual([]);
    expect(await podcastListeningCheck(asker({ questions: quizDraft.questions.slice(0, 1) }).ask, episode, input, Date.now())).toEqual([]);
    const failing = vi.fn(async () => {
      throw new Error("ağ düştü");
    });
    expect(await podcastListeningCheck(failing, episode, input, Date.now())).toEqual([]);
    const idle = asker(quizDraft);
    expect(await podcastListeningCheck(idle.ask, { ...episode, length: "ozet" }, input, Date.now())).toEqual([]);
    // 23 Ekim 2026: kontrol 210. sn'ye kadar başlar (önce 170).
    expect(await podcastListeningCheck(idle.ask, episode, input, Date.now() - 211_000)).toEqual([]);
    expect(await podcastListeningCheck(idle.ask, episode, { ...input, listeningCheck: false }, Date.now())).toEqual([]);
    expect(await podcastListeningCheck(idle.ask, episode, { topicLabel: "x", prepTitle: "y" }, Date.now())).toEqual([]);
    expect(idle.ask).not.toHaveBeenCalled();
  });

  it("motor kabuğu: kontrol kredi kesinleşmeden önce, aynı ayrılışla; ek ücret yok", () => {
    const run = readFileSync("src/lib/learning/teacher-podcast-run.ts", "utf8");
    const inner = run.slice(run.indexOf("async function runTeacherPodcastInner"));
    expect(inner.indexOf("await ensurePodcastDuration(ask, loop.episode, input, started)")).toBeGreaterThan(0);
    expect(inner.indexOf("await podcastListeningCheck(ask, episode, { ...input, optionCount: await optionCountLoad }, started)")).toBeGreaterThan(
      inner.indexOf("await ensurePodcastDuration(ask, loop.episode, input, started)"),
    );
    expect(inner.indexOf("await podcastListeningCheck(ask,")).toBeLessThan(inner.indexOf("await commitCredits("));
    expect(run.match(/reserveCredits\(/g)).toHaveLength(1);
    // Döngünün kendisi kontrolü bilmez: döngü testleri (taslak → denetim → düzeltme) değişmeden geçer.
    const loop = run.slice(run.indexOf("export async function teacherPodcastLoop"), run.indexOf("export async function podcastListeningCheck"));
    expect(loop).not.toContain("teacherQuizLoop");
  });
});

describe("rotalar: kontrol yalnız hazırlığın podcast'inde", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const node = read("src/app/api/learning/exam-prep/node/route.ts");

  it("yol düğümü: üretir, önbelleğe yazar, sayar, puanlar, istemciye anahtarıyla gönderir", () => {
    const branch = node.slice(node.indexOf('if (input.kind === "podcast") {'), node.indexOf('if (input.kind === "oral") {'));
    expect(branch).toContain("...(cached.check.length ? { check: cached.check } : {})");
    expect(branch).toContain("const { episode, check } = await teacherPodcastEpisode(input, core, length);");
    expect(branch).toMatch(/writePodcastCache\(input\.service, \{[\s\S]*?episode,\s*check,\s*\}\)/);
    expect(branch).toContain("...(check.length ? { check } : {})");
    // Önceden yazılan podcast açılmadan önbelleğe girmez (lesson-prefetch kuralı).
    expect(branch).toContain("if (input.prepId && input.userId && input.charge !== false) {");
    // Yalnız gösterim; düşen kredi PODCAST_GENERATE.
    expect(branch).toContain("scriptCredits: CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits");
    expect(node).toContain("listeningCheck: true,");
    expect(node).toContain('if (payload.type === "podcast") return podcastCheckOf(payload).length || 1;');
    expect(node).toContain('if (data.type === "podcast") return { ...scorePodcastCheck(data, answers), retried: 0 };');
    expect(node).toContain("return check.length ? { ...decorated, check: check.map(publicQuizQuestion) } : decorated;");
  });

  it("önceden yazılan podcast açılıp ücreti alındıktan sonra önbelleğe girer; önbellekten geldiyse ücret iade", () => {
    const served = node.slice(node.indexOf("const taken = await takePrefetchedLesson(service, { userId, nodeId });"), node.indexOf('console.info("prefetch_served"'));
    const commit = served.indexOf("else await commitCredits(service, reservation.reservationId)");
    const write = served.indexOf("await writePodcastCache(service, { prepId, userId, topicLabel, episode: servedPodcast");
    expect(commit).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(commit);
    expect(served).toContain('const cachedPodcast = kind === "podcast" && taken.payload.reused === true;');
    expect(served).toContain("if (cachedPodcast) await refundCredits(service, reservation.reservationId)");
  });

  it("hazırlığın podcast sayfası kontrolü yazar ve döner (göstermez); stüdyo ve ders podcast'i kontrolsüz", () => {
    const prep = read("src/app/api/learning/exam-prep/podcast/route.ts");
    // 30 Ekim 2026 (Paket I #9): ders sonu "Şimdi dinle" aynı hattan `listeningCheck: false` ile; kontrolsüz bölüm
    // önbelleğe yazılmaz.
    expect(prep).toContain("const withCheck = parsed.data.listeningCheck !== false;");
    expect(prep).toContain("listeningCheck: withCheck,");
    expect(prep).toContain("if (withCheck) await writePodcastCache(service, {");
    expect(read("src/app/api/learning/exam-prep/lesson-podcast/route.ts")).toContain("listeningCheck: false,");
    expect(prep).toContain("check: outcome.check,");
    expect(prep).toContain("check: outcome.check.map(publicQuizQuestion),");
    expect(prep).toContain("check: cached.check.map(publicQuizQuestion),");
    expect(read("src/app/api/learning/exam-prep/lesson-podcast/route.ts")).not.toContain("listeningCheck: true");
    expect(read("src/app/api/learning/podcast/generate/route.ts")).not.toContain("listeningCheck: true");
  });
});

/*
  Düzey önerisi ("fazla zor / kolay gelebilir") son iki puanlı sonuca bakar. Dinleme kontrolü 3/3
  kolay çıkar; ürün sahibinin kararıyla podcast denemeleri bu öneriyi beslemez (20 Ekim 2026).
*/
describe("düzey önerisi podcast kontrolünü saymaz", () => {
  const fake = (attempts: { score: number; total: number; node_id: string }[], kinds: Record<string, string>) => {
    const table = (name: string) => {
      let ids: string[] = [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        gt: chain,
        order: chain,
        limit: chain,
        in: (_column: string, values: string[]) => {
          ids = values;
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          if (name === "exam_prep_node_attempts") return resolve({ data: attempts });
          if (name === "exam_prep_topics") return resolve({ data: [{ familiarity: "basics" }] });
          return resolve({ data: ids.map((id) => ({ id, kind: kinds[id] })) });
        },
      });
      return builder;
    };
    return { from: table } as never;
  };

  it("araya giren podcast kontrolleri (3/3) atlanır; son iki testin sonucu okunur", async () => {
    const attempts = [
      { score: 3, total: 3, node_id: "p1" },
      { score: 3, total: 3, node_id: "p2" },
      { score: 2, total: 7, node_id: "q1" },
      { score: 3, total: 7, node_id: "q2" },
    ];
    const kinds = { p1: "podcast", p2: "podcast", q1: "quiz", q2: "quiz" };
    expect(await loadLevelHint(fake(attempts, kinds), "prep")).toBe("too_hard");
    expect(await loadLevelHint(fake(attempts.slice(0, 2), kinds), "prep")).toBeNull();
  });
});

describe("dinleme kontrolünün saati (23 Ekim 2026)", () => {
  it("düzeltme turları kontrolden en çok 80 sn sonrasına ve podcast'in 255. sn'sine kadar açılır", () => {
    const fixUntil = (started: number, checkStarted: number) => checkLoopClock(started, checkStarted) + 200_000;
    // Erken kontrol: podcast saati yeter, daha geniş pay.
    expect(checkLoopClock(0, 60_000)).toBe(0);
    // 170. sn: kontrolden 80 sn sonra (250).
    expect(fixUntil(0, 170_000)).toBe(250_000);
    // 210. sn: podcast'in 255. sn'si tavan.
    expect(fixUntil(0, 210_000)).toBe(255_000);
  });
});

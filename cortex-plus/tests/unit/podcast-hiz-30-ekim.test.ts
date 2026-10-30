import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { toDisplay } from "@/lib/learning/speech-normalizer";
import {
  changedPodcastLines,
  definitionOpening,
  parseTeacherPodcast,
  podcastFlowNotes,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
  podcastWriterSystem,
  turnShapeProblems,
} from "@/lib/learning/teacher-podcast";
import { DUO_TURN_RULE, OPENING_HOOK_RULE } from "@/lib/learning/podcast-formats";
import { podcastScriptSystem } from "@/lib/learning/podcast-script-writer";
import { focusedReviewLines, roundOpeningProblems, teacherPodcastLoop } from "@/lib/learning/teacher-podcast-run";
import { awaitPodcastCheck, podcastCheckPending } from "@/lib/learning/podcast-check";
import { fillPodcastCheckLater } from "@/lib/learning/podcast-check-later";
import { LESSON_LOOKAHEAD, prefetchTargets, SLOW_PREFETCH_KINDS } from "@/lib/learning/lesson-prefetch";
import { loadDocumentGenerationContext, topicScopeLine } from "@/lib/documents/generation-context";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/*
  30 Ekim 2026, ürün sahibi: "Podcast uzun sürüyorsa ve kısaltamıyorsak yolda 2 dersi önceden kuralım ki kullanıcı
  beklemesin. Kullanıcı beklerse sıkılır ve dersten kopar." Ölçüm (canlı model, hızlı işlem, dört konu: makroekonomi,
  muhasebe, algoritmalar, kardiyoloji): soğuk podcast 37-93 sn yayım + 13-15 sn dinleme kontrolü; düzeltme turu olan
  podcast'te ikinci tam denetim 24-29 sn.
*/

const read = (path: string) => readSource(path);
const say = (text: string, speaker: "ada" | "kerem" = "ada") => ({ speaker, text });

/** Özet (tek ses, 3 bölüm): döngü testinin en küçük gerçek biçimi. Konu fizik: ders-bağımsız. */
const summary = {
  title: "Newton yasaları",
  chapters: [
    { title: "Eylemsizlik", lines: [say("Duran bir kutu kendiliğinden kaymaz."), say("Net kuvvet sıfırsa hız değişmez.")] },
    { title: "Kuvvet ve ivme", lines: [say("Net kuvvet kütleyle ivmenin çarpımıdır."), say("Kütle iki katına çıkarsa aynı kuvvetle ivme yarıya iner.")] },
    { title: "Etki-tepki", lines: [say("Her etkiye eşit ve zıt bir tepki vardır."), say("Kuvvetler farklı cisimlere etki eder.")] },
  ],
};

describe("hız: düzeltmeden sonraki denetim yalnız değişen satırlara (öğrenci beklerken)", () => {
  const input = { topicLabel: "Newton yasaları", prepTitle: "TYT Fizik", pages: [{ page: 3, text: "Newton…" }], length: "ozet" as const };

  const run = async (urgent: boolean) => {
    const prompts: string[] = [];
    let verify = 0;
    const ask = vi.fn(async (system: string, user: string, role?: string) => {
      if (role === "verify") {
        verify += 1;
        prompts.push(user);
        return verify === 1
          ? { issues: [{ where: "chapters[1].lines[1]", rule: "A", severity: "high", problem: "Oran kaynakta yok" }] }
          : { issues: [] };
      }
      if (role === "fix") {
        return {
          ...summary,
          chapters: [summary.chapters[0], { title: "Kuvvet ve ivme", lines: [say("Net kuvvet kütleyle ivmenin çarpımıdır."), say("Aynı kuvvette kütle artınca ivme azalır.")] }, summary.chapters[2]],
        };
      }
      return summary;
    });
    const loop = await teacherPodcastLoop(ask, input, Date.now(), { urgent });
    return { loop, prompts };
  };

  it("öğrenci bekliyorsa ikinci denetim değişen satırı söyler; önceden yazımda bütün podcast yeniden denetlenir", async () => {
    const waiting = await run(true);
    expect(waiting.loop.problems).toEqual([]);
    expect(waiting.prompts).toHaveLength(2);
    expect(waiting.prompts[0]).not.toContain("DEĞİŞEN SATIRLAR");
    expect(waiting.prompts[1]).toContain("DEĞİŞEN SATIRLAR: Bu podcast bir önceki denetimden geçti; ardından yalnız şu satırlar yeniden yazıldı: chapters[1].lines[1].");
    const prefetch = await run(false);
    expect(prefetch.prompts).toHaveLength(2);
    expect(prefetch.prompts[1]).not.toContain("DEĞİŞEN SATIRLAR");
  });

  it("değişen satır: konuşmacı + metin; hiç değişmediyse ya da çoğu değiştiyse tam denetim", () => {
    const before = parseTeacherPodcast(summary, input)!;
    const same = parseTeacherPodcast(summary, input)!;
    expect(changedPodcastLines(before, same)).toEqual([]);
    expect(focusedReviewLines(before, same)).toBeNull();
    const rewritten = parseTeacherPodcast(
      { ...summary, chapters: summary.chapters.map((chapter) => ({ ...chapter, lines: chapter.lines.map((item) => say(`Kısaca: ${item.text}`)) })) },
      input,
    )!;
    expect(focusedReviewLines(before, rewritten)).toBeNull();
    const one = structuredClone(before);
    one.chapters[2]!.lines[0]!.text = "Her etkiye eşit büyüklükte, zıt yönde bir tepki vardır.";
    expect(focusedReviewLines(before, one)).toEqual(["chapters[2].lines[0]"]);
  });

  it("denetçinin kuralları aynı: odak notu yalnız kullanıcı isteminde", () => {
    const episode = parseTeacherPodcast(summary, input)!;
    expect(podcastVerifySystem("document")).not.toContain("DEĞİŞEN SATIRLAR");
    expect(podcastVerifyUserPrompt(episode, input, ["chapters[0].lines[1]"])).toContain("Değişmeyen satırlar için sorun yazma.");
    expect(podcastVerifyUserPrompt(episode, input)).not.toContain("DEĞİŞEN SATIRLAR");
  });

  it("bandın hemen dışındaki konuşma payı tek başına tur açmaz (kod dengeler); uzak sapma ve doğruluk sorunu açar", () => {
    const withShare = (kerem: number): PodcastEpisode => ({
      title: "Hücre bölünmesi",
      length: "diyalog",
      chapters: [
        {
          title: "Mitoz",
          lines: Array.from({ length: 100 }, (_, index) => say(`Cümle ${index + 1}.`, index < kerem ? "kerem" : "ada")),
        },
      ],
    });
    const share = "Konuşma payı: Kerem cümlelerin %52'ini söylüyor; %35-50 olmalı.";
    expect(roundOpeningProblems(withShare(52), [share])).toEqual([]);
    expect(roundOpeningProblems(withShare(31), [share])).toEqual([]);
    expect(roundOpeningProblems(withShare(20), [share])).toEqual([share]);
    const fact = "[chapters[0].lines[3]] (A) Oran kaynakta yok";
    expect(roundOpeningProblems(withShare(52), [share, fact])).toEqual([fact]);
    expect(roundOpeningProblems(withShare(52), ["Metin kısa: 300 kelime"])).toEqual([]);
  });

  it("motor kabuğu: öğrenci beklerken odaklı denetim, önceden yazımda tam", () => {
    const shell = read("src/lib/learning/teacher-podcast-run.ts");
    expect(shell).toContain("const loopOptions = { urgent: !free };");
    expect(shell.match(/teacherPodcastLoop\(ask, input, started, loopOptions\)/g)).toHaveLength(2);
    // Tamamlama turunun denetimi zaten yalnız yeni bölümlerin sorununu sayıyordu: denetçi de yalnız onlara bakar.
    expect(shell).toContain("podcastVerifyUserPrompt(merged, input, newLines)");
  });
});

describe("hız: dinleme kontrolü yayımdan sonra", () => {
  it("kontrol bekleniyor mu: bayrak var, soru yok", () => {
    expect(podcastCheckPending({ type: "podcast", checkPending: true })).toBe(true);
    expect(podcastCheckPending({ type: "podcast", checkPending: true, check: [{ text: "?", options: ["a", "b"] }] })).toBe(false);
    expect(podcastCheckPending({ type: "podcast" })).toBe(false);
  });

  it("oynatıcı bitince kontrol kayıttan alınır; gelmezse podcast kontrolsüz biter", async () => {
    const sleep = vi.fn(async () => undefined);
    const ready = { type: "podcast", check: [{ text: "Hangisi?", options: ["A", "B"] }] };
    const sequence = [{ type: "podcast", checkPending: true }, null, ready];
    const fetcher = vi.fn(async () => sequence.shift() ?? null);
    expect(await awaitPodcastCheck(fetcher, { tries: 4, delayMs: 10 }, sleep)).toBe(ready);
    expect(fetcher).toHaveBeenCalledTimes(3);
    // Kontrol yazılamadıysa kayıttaki bayrak kalkar: bir daha sorulmaz.
    const gaveUp = vi.fn(async () => ({ type: "podcast" }));
    expect(await awaitPodcastCheck(gaveUp, { tries: 4, delayMs: 10 }, sleep)).toBeNull();
    expect(gaveUp).toHaveBeenCalledTimes(1);
    const slow = vi.fn(async () => ({ type: "podcast", checkPending: true }));
    expect(await awaitPodcastCheck(slow, { tries: 3, delayMs: 10 }, sleep)).toBeNull();
    expect(slow).toHaveBeenCalledTimes(3);
  });

  const question: QuizQuestion = { text: "Etki-tepki kuvvetleri neden birbirini yok etmez?", options: ["Farklı cisimlere etki ederler", "Eşit değildirler"], correct: ["Farklı cisimlere etki ederler"], explanation: "Farklı cisimler." } as QuizQuestion;
  const fakeService = (attempt: { status: string; payload: Record<string, unknown> }) => {
    const updates: Record<string, unknown>[] = [];
    const upserts: Record<string, unknown>[] = [];
    const service = {
      from(table: string) {
        const query = {
          select() { return query; },
          eq() { return query; },
          maybeSingle: async () => ({ data: attempt, error: null }),
          update(body: Record<string, unknown>) { updates.push(body); return query; },
          upsert(body: Record<string, unknown>) { upserts.push({ table, ...body }); return Promise.resolve({ error: null }); },
          then(resolve: (value: unknown) => void) { return Promise.resolve({ error: null }).then(resolve); },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    return { service, updates, upserts };
  };
  const payload = { type: "podcast", title: "Newton yasaları", chapters: summary.chapters, length: "ozet", checkPending: true };

  it("açık kayda kontrol ve soru sayısı yazılır, bayrak kalkar; önbellek kontrolle birlikte", async () => {
    const fake = fakeService({ status: "active", payload });
    const out = await fillPodcastCheckLater(fake.service, { attemptId: "a1", prepId: "p1", userId: "u1", topicLabel: "Newton yasaları", task: async () => [question] });
    expect(out).toEqual({ check: 1, attached: true });
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toMatchObject({ total: 1 });
    expect((fake.updates[0]!.payload as Record<string, unknown>).checkPending).toBeUndefined();
    expect((fake.updates[0]!.payload as { check: unknown[] }).check).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({ table: "exam_prep_podcasts", listening_check: [question] });
  });

  it("öğrenci bitirdiyse kayda dokunulmaz; kontrol yazılamadıysa yalnız bayrak kalkar", async () => {
    const done = fakeService({ status: "completed", payload });
    await fillPodcastCheckLater(done.service, { attemptId: "a1", prepId: "p1", userId: "u1", topicLabel: "Newton yasaları", task: async () => [question] });
    expect(done.updates).toHaveLength(0);
    expect(done.upserts).toHaveLength(1);
    const empty = fakeService({ status: "active", payload });
    await fillPodcastCheckLater(empty.service, { attemptId: "a1", prepId: "p1", userId: "u1", topicLabel: "Newton yasaları", task: async () => { throw new Error("model"); } });
    expect(empty.updates[0]).not.toHaveProperty("total");
    expect(empty.updates[0]!.payload).not.toHaveProperty("checkPending");
    expect(empty.updates[0]!.payload).not.toHaveProperty("check");
  });

  it("rotalar: yol düğümü ve hazırlığın podcast sayfası kontrolü yanıttan sonra; önceden yazımda birlikte", () => {
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(node).toContain("deferListeningCheck: input.charge !== false && Boolean(input.onPodcastCheckLater),");
    // Kayıt iki yerde yazılıyor (yazımı süren kaydın güncellenmesi, yeni kayıt): ikisinde de kontrol arkada istenir.
    expect(node.match(/schedulePodcastCheck\(/g)?.length).toBe(2);
    expect(node).toContain("after(() => fillPodcastCheckLater(service, { attemptId, prepId, userId, topicLabel, task }))");
    expect(node).toContain('if (kind !== "lesson" && kind !== "quiz" && kind !== "podcast") return errorResponse(400, "invalid_input");');
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("if (!podcastCheckPending(payload) || !attemptId) return void finish();");
    expect(session).toContain('jsonPost({ prepId, nodeId, attemptId, action: "progress", lessonFormat: 3 })');
  });
});

describe("gösterim: 'kare' sözcüğü üs değil (ders-bağımsız)", () => {
  it("sözcüğün son harfi taban sayılmaz; sayıdan sonra tek 'kare' ad", () => {
    expect(toDisplay("R-R arası 4 büyük kare ise kalp hızı 75/dk'dır.")).toBe("R-R arası 4 büyük kare ise kalp hızı 75/dk'dır.");
    expect(toDisplay("Bir küçük kare 0,04 saniyedir.")).toContain("küçük kare");
    expect(toDisplay("Satranç tahtasında 64 kare vardır.")).toContain("64 kare vardır");
    expect(toDisplay("Büyük kareleri say.")).toContain("kareleri");
  });

  it("değişkenin ve işlemin üssü yine simge", () => {
    expect(toDisplay("x kare artı 1")).toContain("x²");
    expect(toDisplay("3 kare artı 4 kare eşittir 5 kare.")).toBe("3² artı 4² eşittir 5².");
    expect(toDisplay("Mol, 6,02 × 10 kare küp tanecik içerir.")).toContain("10²³");
  });
});

describe("roller: soru bir sonraki sırada öbür sesten cevaplanır", () => {
  const duo = (lines: { speaker: "ada" | "kerem"; text: string }[], title = "Fotosentez") =>
    parseTeacherPodcast(
      {
        title,
        chapters: [
          { title, lines },
          { title: "Işık tepkimeleri", lines: [say("Işık enerjisi tilakoitte tutulur."), say("Peki oksijen nereden çıkar?", "kerem"), say("Suyun parçalanmasından çıkar.")] },
          { title: "Calvin döngüsü", lines: [say("Karbondioksit stromada bağlanır."), say("Bu adım ışığa doğrudan bağlı değil.", "kerem")] },
          { title: "Özet", lines: [say("Işık tepkimesi enerji toplar.", "kerem"), say("Calvin döngüsü şeker kurar.", "kerem"), say("İkisi birlikte çalışır.")] },
        ],
      },
      { length: "diyalog", topicLabel: title },
    )!;

  it("kendi sorusunu 'Çünkü' ile cevaplayan ve bir sırada iki soru soran işaretlenir (satır silinmez)", () => {
    const episode = duo([
      say("Bir yaprak karanlıkta neden şeker yapamaz?"),
      say("Klorofil neden yeşil görünür?", "kerem"),
      say("Çünkü yeşil ışığı yansıtır.", "kerem"),
      say("Doğru, kırmızı ve maviyi soğurur."),
      say("Peki ışık hangi organelde tutulur?", "kerem"),
      say("Her yaprakta mı aynı?", "kerem"),
      say("Kloroplastta; yaprağın türüne göre sayısı değişir."),
    ]);
    const problems = turnShapeProblems(episode);
    expect(problems.map((item) => item.reason)).toEqual(["soruyu soran kendisi cevaplıyor", "bir sırada iki soru"]);
    expect(podcastFlowNotes(episode).join(" | ")).toContain("soruyu soran kendisi cevaplıyor");
    const lines = episode.chapters[0]!.lines.length;
    expect(lines).toBe(7);
  });

  it("açılış sorusunu soran sesin konuşmayı sürdürmesi de işaretlenir (kanca sorusu sırayı bitirir)", () => {
    const episode = duo(
      [
        say("Bir ferman neden halkın her kesimini aynı anda etkiler?"),
        say("Tanzimat'ta bunun cevabı hukuk önünde eşitliktir."),
        say("Yani vergi de herkese aynı mı oldu?", "kerem"),
        say("Vergi gelire göre alınacaktı; ayrıcalık kalkıyordu."),
      ],
      "Tanzimat Fermanı",
    );
    expect(turnShapeProblems(episode)).toEqual([{ chapter: 0, line: 1, reason: "soru sıranın sonunda değil" }]);
  });

  it("öbür sesin cevabı ve 'Dur ve düşün' işaretlenmez", () => {
    const episode = duo([
      say("Bir yaprak karanlıkta neden şeker yapamaz?"),
      say("Klorofil neden yeşil görünür?", "kerem"),
      say("Çünkü yeşil ışığı yansıtır, kırmızı ve maviyi soğurur."),
      say("Dur ve düşün: Işık olmadan Calvin döngüsü ne kadar sürer?", "kerem"),
      say("Cevap: Kısa sürer; ışık tepkimesinin ürünleri tükenince durur.", "kerem"),
    ]);
    expect(turnShapeProblems(episode)).toEqual([]);
  });

  it("açılış tanımsa işaretlenir; vaka ya da soruyla açılış işaretlenmez", () => {
    const definition = duo([say("Fotosentez, ışık enerjisiyle şeker üretilmesidir."), say("Bitki bunu yaprakta yapar.", "kerem")]);
    expect(definitionOpening(definition)).toBe(true);
    const scene = duo([say("Bir saksıyı bir hafta dolaba koysan yaprakları sararır."), say("Neden ışık bu kadar önemli?", "kerem")]);
    expect(definitionOpening(scene)).toBe(false);
    const question = duo([say("Karanlıkta kalan bitki neden sararır?"), say("Şeker yapamadığı için mi?", "kerem")]);
    expect(definitionOpening(question)).toBe(false);
    const history = duo([say("Tanzimat, 1839'da ilan edilen bir reform fermanıdır."), say("Kim ilan etti?", "kerem")], "Tanzimat Fermanı");
    expect(definitionOpening(history)).toBe(true);
  });

  it("yazar (senarist ve eski şema) ve denetçi aynı konuşma ve kanca kuralını okur", () => {
    expect(DUO_TURN_RULE).toContain("Soru, sıranın son cümlesidir");
    for (const system of [podcastScriptSystem("document", "diyalog"), podcastScriptSystem("topic", "soru_cevap"), podcastVerifySystem("document")]) {
      expect(system).toContain(DUO_TURN_RULE);
      expect(system).toContain(OPENING_HOOK_RULE);
    }
    expect(podcastWriterSystem("document", "basit")).toContain(OPENING_HOOK_RULE);
    // Senarist ile konuşma payı kuralı artık çelişmiyor: kancayı Ada kurar.
    expect(podcastScriptSystem("document", "diyalog")).toContain("Kancayı Ada kurar, Kerem merakla girer.");
    expect(podcastScriptSystem("document", "diyalog")).not.toContain("Kerem bir merakla açar.");
  });

  it("akış yalnız kayda geçer: düzeltme turu açmaz, satır sildirmez", () => {
    const shell = read("src/lib/learning/teacher-podcast-run.ts");
    expect(shell).toContain("flow: loop.episode ? podcastFlowCounts(loop.episode) : null,");
    const podcast = read("src/lib/learning/teacher-podcast.ts");
    const lineProblems = podcast.slice(podcast.indexOf("export function podcastLineProblems"), podcast.indexOf("const COSMETIC_PROBLEM"));
    expect(lineProblems).not.toContain("turnShapeProblems");
    const structure = podcast.slice(podcast.indexOf("export function podcastStructureIssues"), podcast.indexOf("export function podcastFlowNotes"));
    expect(structure).not.toContain("turnShapeProblems");
    expect(structure).not.toContain("definitionOpening");
  });
});

describe("Araçlar podcast'i: seçilen konu", () => {
  /** Tarih notu: dosya adı konunun adını içeriyor; konu haritasında aynı adlı konu var. */
  const fakeService = (fileName: string) => {
    const pageQueries: number[][] = [];
    const service = {
      from(table: string) {
        let columns = "";
        let topicId = "";
        let pages: number[] = [];
        const query = {
          select(value: string) { columns = value; return query; },
          eq(column: string, value: string) { if (column === "topic_id") topicId = value; return query; },
          is() { return query; },
          order() { return query; },
          range() { return query; },
          in(_column: string, values: number[]) { pages = values; pageQueries.push(values); return query; },
          maybeSingle: async () => ({ data: { id: "d1", file_name: fileName, status: "completed" }, error: null }),
          then(resolve: (value: unknown) => void) {
            const data = table === "document_topic_nodes"
              ? [
                  { id: "kurulus", title: "Kuruluş Dönemi", parent_id: null },
                  { id: "yukselme", title: "Yükselme Dönemi", parent_id: null },
                ]
              : table === "document_topic_page_links"
                ? (topicId === "kurulus" ? [1, 2] : topicId === "yukselme" ? [3, 4] : [1, 2, 3, 4]).map((page) => ({ page_number: page, topic_id: topicId }))
                : columns.includes("text_content")
                  ? pages.map((page) => ({ page_number: page, text_content: `Sayfa ${page} metni.`, formulas: [], extraction_ok: true, page_kind: "content" }))
                  : [1, 2, 3, 4].map((page) => ({ page_number: page, headings: [], extraction_ok: true, page_kind: "content" }));
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    return { service, pageQueries };
  };

  it("dosya adı isteği içerse de belgede aynı adlı konu varsa o konunun sayfaları gelir", async () => {
    const fake = fakeService("Osmanli-Kurulus-Donemi-ve-Yukselme.pdf");
    const context = await loadDocumentGenerationContext(fake.service, "u1", "d1", "Kuruluş Dönemi");
    expect(context?.wholeDocument).toBe(false);
    expect(context?.matched).toBe(true);
    expect(context?.topicTitle).toBe("Kuruluş Dönemi");
    expect(fake.pageQueries.at(-1)).toEqual([1, 2]);
    expect(topicScopeLine(context!, "Kuruluş Dönemi")).toContain("yalnız «Kuruluş Dönemi» konusunu istedi");
  });

  it("dosyanın kendi adı yazıldıysa (belgede öyle bir konu yoksa) belgenin tamamı; kapsam satırı yok", async () => {
    const fake = fakeService("Osmanli-Tarihi-Notlarim.pdf");
    const context = await loadDocumentGenerationContext(fake.service, "u1", "d1", "Osmanlı Tarihi Notlarım");
    expect(context?.wholeDocument).toBe(true);
    expect(context?.matched).toBe(true);
    expect(topicScopeLine(context!, "Osmanlı Tarihi Notlarım")).toBe("");
  });

  it("stüdyo podcast'i kapsam satırını yazara verir", () => {
    expect(read("src/app/api/learning/podcast/generate/route.ts")).toContain("...(source.scopeLine ? { syllabusLine: source.scopeLine } : {}),");
  });
});

describe("yolda iki ders önceden (30 Ekim 2026)", () => {
  type Row = { id: string; kind: string };
  /** Bir konunun bloğu: ders → test → doğru/yanlış → (podcast | soru-cevap) → ikinci test → kartlar. */
  const block = (topic: number, audio: string): Row[] =>
    ["lesson", "quiz", "true_false", audio, "quiz", "spaced"].map((kind, index) => ({ id: `t${topic}-${index}-${kind}`, kind }));
  const path: Row[] = [...block(1, "podcast"), ...block(2, "qa"), ...block(3, "oral"), ...block(4, "podcast")];
  const after = (id: string) => path.slice(path.findIndex((row) => row.id === id) + 1);

  it("ders açılınca: penceredeki ilk adım ve sıradaki iki ders", () => {
    expect(LESSON_LOOKAHEAD).toBe(2);
    expect(prefetchTargets(after("t1-0-lesson")).map((row) => row.id)).toEqual(["t1-1-quiz", "t2-0-lesson", "t3-0-lesson"]);
  });

  it("podcast pencerede ikinci sıradaysa da yazılır (yalnız ilki değil)", () => {
    expect(SLOW_PREFETCH_KINDS.has("podcast")).toBe(true);
    expect(prefetchTargets(after("t1-1-quiz")).map((row) => row.id)).toEqual(["t1-2-true_false", "t1-3-podcast", "t2-0-lesson", "t3-0-lesson"]);
  });

  it("ücretsiz hesapta Plus adımı (podcast, sözlü) ne pencerede ne yavaş türde seçilir; dersler yine iki", () => {
    const skip = new Set(["podcast", "oral", "written_exam"]);
    const targets = prefetchTargets(after("t1-1-quiz"), skip).map((row) => row.id);
    expect(targets).not.toContain("t1-3-podcast");
    expect(targets).toEqual(["t1-2-true_false", "t2-0-lesson", "t3-0-lesson"]);
  });

  it("son konuda tek ders kaldıysa tek ders; yol bitince boş", () => {
    expect(prefetchTargets(after("t3-5-spaced")).map((row) => row.id)).toEqual(["t4-0-lesson"]);
    expect(prefetchTargets([])).toEqual([]);
  });

  it("tetikleyiciler: açılış ve bitiş aynı hedefleri ister, hazırlık sayfası da; ilk ders hızlı işlem kuralı korunur", () => {
    const prefetch = read("src/lib/learning/lesson-prefetch.ts");
    const next = prefetch.slice(prefetch.indexOf("export async function requestNextPrefetch"), prefetch.indexOf("export async function requestPrepPrefetch"));
    expect(next).toContain("const targets = prefetchTargets(rows, skipKinds);");
    expect(next).toContain("await Promise.all(targets.map((node) => requestNodePrefetch(service, { ...input, node })));");
    const prep = prefetch.slice(prefetch.indexOf("export async function requestPrepPrefetch"));
    expect(prep).toContain("const targets = prefetchTargets(rows, skipKinds, size);");
    expect(prep).toContain("{ firstLesson: options.firstLesson === true && node.id === lead?.id }");
    // Kuşak tutmazsa hazır içerik atılır; konu testi dersin parmak iziyle (bu kurallar değişmedi).
    expect(prefetch).toContain("if (familiarityBand(data.familiarity as Familiarity) !== familiarityBand(input.familiarity) || variantMismatch) {");
    expect(prefetch).toContain('if (kind === "quiz") return prefetchQuizVariant(input) + options;');
  });
});

/** Tip denetimi için: `PodcastEpisode` alanları değişirse bu dosya derlenmez. */
export type _Episode = PodcastEpisode;

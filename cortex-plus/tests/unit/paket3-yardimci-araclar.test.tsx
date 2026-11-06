// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/env", () => ({ env: { APP_SECRET: "test-secret-for-scan-link", SUPABASE_SECRET_KEY: undefined } }));

import { buildCramSheet, cramFocusNote, cramSectionBadge, cramWeakReason } from "@/lib/learning/cram-sheet";
import { CramSheetView } from "@/components/parity/cram-sheet-view";
import { formulaRelationKeys, mathNormalize } from "@/lib/text/math-normalize";
import { mathNormalize as contradictionNormalize } from "@/lib/learning/source-contradictions";
import { distinctiveWords, twoOptionFallback, twoOptionHintVerdict, twoOptionUserPrompt } from "@/lib/learning/twin-question";
import { normalizeQuizQuestion } from "@/lib/learning/exam-quiz";
import { createLevelToken, LEVEL_TOKEN_TTL_MS } from "@/lib/level-check/token";
import { linkScanResponsesToPrep, scanLinkScopes, SCAN_LINK_GRACE_MS } from "@/lib/level-check/link-scan";
import { weakTopicRows } from "@/lib/learning/weak-topic-rows";
import { TopicBars } from "@/components/student/topic-bars";
import { LearningDnaCard } from "@/components/student/learning-dna-card";
import { retargetBindingPatch } from "@/lib/learning/node-topic-binding";
import { balanceKerem, handOffSelfAnswers, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import { turnShapeProblems } from "@/lib/learning/teacher-podcast";
import type { LessonV3 } from "@/lib/learning/lesson-v3";
import type { StudentMemory } from "@/lib/learning/student-memory";

/*
  Paket 3 (6 Kasım 2026): yardımcı araçların mantık hataları. Örnekler canlıdaki dersten farklı derslerden
  (geometri, iktisat, tarih, biyoloji, edebiyat).
*/

afterEach(() => cleanup());

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function formulaLesson(title: string, expressions: string[]): LessonV3 {
  return {
    format: 3,
    title,
    screens: expressions.map((expression, index) => ({
      heading: `${title} ${index + 1}`,
      concept: `${title} ${index + 1}`,
      blocks: [{ type: "formula", formula: { title: `Bağıntı ${index + 1}`, expression } }],
    })),
  } as unknown as LessonV3;
}

describe("#1 sınav sabahı: zayıf konu ve formül tekrarı", () => {
  it("yalnız %75 altı ya da açık yanlışı olan konu dikkat ister; %100 konu 'Zayıf · %100' olmaz", () => {
    expect(cramWeakReason({ percent: 100, openWrongs: 0 })).toBeNull();
    expect(cramWeakReason({ percent: 74, openWrongs: 0 })).toBe("low");
    expect(cramWeakReason({ percent: 75, openWrongs: 0 })).toBeNull();
    expect(cramWeakReason({ percent: 100, openWrongs: 2 })).toBe("wrongs");
    expect(cramWeakReason({ percent: null, openWrongs: 1 })).toBe("wrongs");
    expect(cramWeakReason({ percent: null, openWrongs: 0 })).toBeNull();

    const sheet = buildCramSheet({
      topics: [
        { key: "t1", label: "Osmanlı Kuruluş Dönemi" },
        { key: "t2", label: "Tanzimat Fermanı" },
        { key: "t3", label: "Islahat Fermanı" },
      ],
      lessons: [
        { topicKey: "t1", lesson: formulaLesson("Kuruluş", ["Yıl farkı = 1326 − 1299"]) },
        { topicKey: "t2", lesson: formulaLesson("Tanzimat", ["Süre = bitiş − başlangıç"]) },
        { topicKey: "t3", lesson: formulaLesson("Islahat", ["Toplam = A + B"]) },
      ],
      focusTopics: [
        { label: "Osmanlı Kuruluş Dönemi", percent: 100, openWrongs: 0 },
        { label: "Tanzimat Fermanı", percent: 100, openWrongs: 1 },
        { label: "Islahat Fermanı", percent: 40, openWrongs: 0 },
      ],
    });
    expect(sheet.focusTopics.map((topic) => topic.label)).toEqual(["Tanzimat Fermanı", "Islahat Fermanı"]);
    expect(sheet.focusTopics.map(cramFocusNote)).toEqual(["1 açık yanlış", "%40"]);
    const badges = Object.fromEntries(sheet.sections.map((section) => [section.topic, cramSectionBadge(section)]));
    expect(badges["Osmanlı Kuruluş Dönemi"]).toBeNull();
    expect(badges["Tanzimat Fermanı"]).toBe("Dikkat · 1 açık yanlış");
    expect(badges["Islahat Fermanı"]).toBe("Zayıf · %40");

    render(<CramSheetView sheet={sheet} prepTitle="Tarih" examDay={null} homeHref="/x" />);
    expect(document.body.textContent).not.toMatch(/%100/);
    expect(screen.getByText(/Önce bunlara bak/).parentElement?.textContent).toContain("Tanzimat Fermanı (1 açık yanlış)");
  });

  it("zayıf konu yoksa 'Önce bunlara bak' satırı çıkmaz", () => {
    const sheet = buildCramSheet({
      topics: [{ key: "t1", label: "Hücre Zarı" }],
      lessons: [{ topicKey: "t1", lesson: formulaLesson("Zar", ["Oran = yüzey / hacim"]) }],
      focusTopics: [{ label: "Hücre Zarı", percent: 92, openWrongs: 0 }],
    });
    expect(sheet.focusTopics).toEqual([]);
    expect(sheet.sections[0]?.weak).toBe(false);
    render(<CramSheetView sheet={sheet} prepTitle="Biyoloji" examDay={null} homeHref="/x" />);
    expect(screen.queryByText(/Önce bunlara bak/)).toBeNull();
    expect(screen.queryByText(/Zayıf/)).toBeNull();
  });

  it("aynı formül farklı yazımla (× / ·, alt simge, LaTeX) bir kez yazılır; yeni bağıntı getiren satır kalır", () => {
    expect(formulaRelationKeys("Aₙ = π × r²")).toEqual(formulaRelationKeys("A_n = π · r^2"));
    expect(formulaRelationKeys("Pₙ = P₀ · (1 + i)ⁿ")).toEqual(formulaRelationKeys("P_{n} = P_0 × (1 + i)^{n}"));
    expect(formulaRelationKeys("dairede A = π·r²; çevrede Ç = 2·π·r")).toEqual([
      ...formulaRelationKeys("A = π × r²"),
      ...formulaRelationKeys("Ç = 2 × π × r"),
    ]);
    expect(formulaRelationKeys("yalnız açıklama")).toEqual([]);

    const sheet = buildCramSheet({
      topics: [
        { key: "g1", label: "Daire" },
        { key: "g2", label: "Faiz" },
      ],
      lessons: [
        { topicKey: "g1", lesson: formulaLesson("Daire", ["A = π × r²", "A = π · r^2", "A = π·r²; Ç = 2·π·r"]) },
        { topicKey: "g2", lesson: formulaLesson("Faiz", ["Pₙ = P₀ · (1 + i)ⁿ", "P_n = P_0 × (1 + i)^{n}"]) },
      ],
    });
    const rows = sheet.sections.flatMap((section) => section.items.filter((item) => item.kind === "formula").map((item) => item.text));
    expect(rows).toEqual(["A = π × r²", "A = π·r²; Ç = 2·π·r", "Pₙ = P₀ · (1 + i)ⁿ"]);
  });

  it("çelişki denetimi aynı normalizasyonu kullanır (davranış değişmedi)", () => {
    expect(contradictionNormalize("f(x) = ax + b (a ≠ 0)")).toBe(contradictionNormalize("f(x) = ax + b, a ≠ 0"));
    expect(mathNormalize("x₁ = 3")).toBe(mathNormalize("x1 = 3"));
    expect(read("src/lib/learning/cram-sheet.ts")).toContain("formulaRelationKeys(");
    // Kâğıt istemci de okur: normalizasyon modülü sunucu modülü içe aktarmaz.
    expect(read("src/lib/text/math-normalize.ts")).not.toMatch(/^import /m);
  });

  it("yükleyici açık yanlışları ve %75 tabanını iletir", () => {
    const loader = read("src/lib/learning/cram-sheet-load.ts");
    expect(loader).toContain("openWrongs: row.openWrongs");
    expect(loader).toContain("Math.max(input.targetScore ?? CRAM_WEAK_BELOW, CRAM_WEAK_BELOW)");
  });
});

describe("#2 iki şık arasında kaldım", () => {
  const question = normalizeQuizQuestion({
    text: "Arz eğrisini sağa kaydıran etken hangisidir?",
    options: ["Üretim maliyetinin düşmesi", "Ürün fiyatının artması", "Talebin azalması"],
    correct: ["Üretim maliyetinin düşmesi"],
  } as Parameters<typeof normalizeQuizQuestion>[0])!;
  const pair: [string, string] = ["Üretim maliyetinin düşmesi", "Ürün fiyatının artması"];

  it("istem iki şıkkın metnini ve ayırt edici sözcüklerini taşır", () => {
    const [onlyA, onlyB] = distinctiveWords(pair);
    expect(onlyA).toEqual(["Üretim", "maliyetinin", "düşmesi"]);
    expect(onlyB).toEqual(["Ürün", "fiyatının", "artması"]);
    const prompt = twoOptionUserPrompt(question, pair);
    expect(prompt).toContain("Şık 1: «Üretim maliyetinin düşmesi»");
    expect(prompt).toContain("Yalnız Şık 2'de geçen sözcükler: Ürün, fiyatının, artması");
    expect(twoOptionUserPrompt(question, pair, "off_pair")).toContain("ayırmıyordu");
  });

  it("genel cümle iki şıkla ilgisiz sayılır; iki şıkkı eşit anan ipucu geçer", () => {
    expect(twoOptionHintVerdict({ hint: "İki şıkkı tanımlarıyla karşılaştır ve soruyu dikkatle oku." }, question, pair).problem).toBe("off_pair");
    const good = "Kökte eğrinin kaymasını soruyor: maliyetteki değişim eğriyi kaydırır mı, fiyattaki değişim eğri üzerinde hareket mi ettirir, buna bak.";
    expect(twoOptionHintVerdict({ hint: good }, question, pair)).toEqual({ hint: good, problem: null });
  });

  it("cevabı ele veren ya da yalnız doğru şıkkın sözcüğünü anan ipucu geri çevrilir", () => {
    expect(twoOptionHintVerdict({ hint: "Doğru olan şık maliyetle ilgili olandır, ona yönel." }, question, pair).problem).toBe("giveaway");
    expect(twoOptionHintVerdict({ hint: "Maliyet düştüğünde üretici daha çok mal sunar." }, question, pair).problem).toBe("giveaway");
    expect(twoOptionHintVerdict({ hint: "Bu şık doğrudur diyebilmek için kökü yeniden oku lütfen." }, question, pair).problem).toBe("giveaway");
  });

  it("model iki kez olmazsa iki şıkkı eşit anan kod cümlesi; yeniden deneme bir kez", () => {
    const fallback = twoOptionFallback(pair)!;
    expect(fallback).toContain("«Üretim, maliyetinin»");
    expect(fallback).toContain("«Ürün, fiyatının»");
    expect(twoOptionHintVerdict({ hint: fallback }, question, pair).problem).toBeNull();
    const run = read("src/lib/learning/twin-question-run.ts");
    expect(run).toMatch(/for \(let attempt = 0; attempt < 2; attempt \+= 1\)[\s\S]*twoOptionHintVerdict/);
    expect(run).toContain("return twoOptionFallback(pair);");
  });
});

describe("#3 Hızlı Tarama yanıtları yeni hazırlığa bağlanır", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const now = Date.UTC(2026, 10, 6, 8, 0, 0);

  it("yalnız bu öğrencinin, quick_scan, hazırlıksız ve süresi aşırı geçmemiş oturumu", () => {
    const own = createLevelToken({ uid: userId, src: "quick_scan", items: ["i1", "i2"], prep: null }, now)!;
    const other = createLevelToken({ uid: "22222222-2222-4222-8222-222222222222", src: "quick_scan", items: ["i3"], prep: null }, now)!;
    const unit = createLevelToken({ uid: userId, src: "unit_check", items: ["i4"], prep: "p" }, now)!;
    const scopes = scanLinkScopes([own, other, unit, "bozuk.belirtec"], userId, now + 2 * 60 * 60 * 1000);
    expect(scopes).toEqual([
      { items: ["i1", "i2"], since: new Date(now).toISOString(), until: new Date(now + LEVEL_TOKEN_TTL_MS).toISOString() },
    ]);
    expect(scanLinkScopes([own], userId, now + LEVEL_TOKEN_TTL_MS + SCAN_LINK_GRACE_MS + 1)).toEqual([]);
  });

  it("güncelleme prep_id boş satırlarla ve oturum aralığıyla sınırlı", async () => {
    const token = createLevelToken({ uid: userId, src: "quick_scan", items: ["i1"], prep: null })!;
    const calls: [string, ...unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["update", "eq", "is", "in", "gte", "lte"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return chain;
      };
    }
    chain.select = async () => ({ data: [{ id: "r1" }, { id: "r2" }], error: null });
    const service = { from: (table: string) => (calls.push(["from", table]), chain) };
    const linked = await linkScanResponsesToPrep(service as never, { userId, prepId: "prep-1", tokens: [token] });
    expect(linked).toBe(2);
    expect(calls.slice(0, 6)).toEqual([
      ["from", "item_responses"],
      ["update", { prep_id: "prep-1" }],
      ["eq", "user_id", userId],
      ["is", "prep_id", null],
      ["eq", "source", "quick_scan"],
      ["in", "item_id", ["i1"]],
    ]);
    expect(calls.map((call) => call[0])).toEqual(expect.arrayContaining(["gte", "lte"]));
  });

  it("kurulum belirteçleri gönderir, uç hazırlığı kurduktan sonra bağlar", () => {
    const flow = read("src/components/parity/official-setup-flow.tsx");
    expect(flow).toContain("onStarted={(res) =>");
    expect(flow).toContain("levelScanTokens: scanTokens.current");
    const route = read("src/app/api/learning/exam-prep/create/route.ts");
    expect(route).toContain("levelScanTokens: z.array(");
    expect(route).toMatch(/await linkScanResponsesToPrep\(service, \{ userId, prepId: result\.prepId, tokens: parsed\.data\.levelScanTokens \}\)/);
  });
});

describe("#4 /ilerleme yüzdeleri ne ölçtüğünü söyler", () => {
  it("eksik konular: yanlış oranı kaynağıyla, sohbet satırı yüzdesiz, konu bir kez", () => {
    const rows = weakTopicRows([
      { topic_label: "Divan Edebiyatı", severity: 1, source: "practice_exam" },
      { topic_label: "Divan Edebiyatı", severity: 0.4, source: "quiz" },
      { topic_label: "Tanzimat Romanı", severity: 0.8, source: "chat" },
      { topic_label: "Halk Şiiri", severity: 0.25, source: "quiz" },
    ]);
    expect(rows).toEqual([
      { label: "Divan Edebiyatı", wrongPct: 100, source: "practice_exam", times: 2, note: "Son denemede yanlış oranı %100" },
      { label: "Tanzimat Romanı", wrongPct: null, source: "chat", times: 1, note: "Sohbette eksik ya da yanlış cevap" },
      { label: "Halk Şiiri", wrongPct: 25, source: "quiz", times: 1, note: "Son testte yanlış oranı %25" },
    ]);
    render(<TopicBars topics={rows} />);
    expect(document.body.textContent).toContain("Son denemede yanlış oranı %100 · 2 kez eksik çıktı");
    expect(document.body.textContent).not.toMatch(/\b100%/);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(read("src/app/ilerleme/page.tsx")).toContain("Yüzde, o konudaki son ölçümde yanlış yaptığın soruların oranıdır");
  });

  it("DNA kartı: hata türü kaç kez, kazanım hakimiyeti %75 altı ve en düşüğü", () => {
    const memory = {
      version: 1,
      sampleSize: 40,
      errorKinds: [{ kind: "polarity", count: 6, lastAt: null }],
      weakOutcomes: [
        { outcomeId: "o1", unitId: "u", programId: "p", mastery: 0.42, n: 5 },
        { outcomeId: "o2", unitId: "u", programId: "p", mastery: 0.9, n: 4 },
      ],
      misconceptions: [],
      repeatedTopics: [],
    } as unknown as StudentMemory;
    render(<LearningDnaCard memory={memory} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("· 6 kez");
    expect(text).toContain("Hakimiyeti %75'in altında ölçülen kazanım: 1 (en düşüğü hakimiyet %42, 5 cevaptan)");
  });
});

describe("#5 sözlüde düğüm içinde seçilen konu düğümü bağlar", () => {
  it("konu kimliği, adı, sayfaları ve başlık seçilen konuya geçer", () => {
    const patch = retargetBindingPatch({
      kind: "oral",
      nodeTitle: "Sözlü · Hücre Bölünmesi",
      storedMeta: { role: "practice", topicId: "doc-a", topicTitle: "Kalıtım", sourcePages: [3], objective: "eski", activityMinutes: 4 },
      effectiveMeta: { topicId: "doc-b", topicTitle: "Kalıtım", sourcePages: [7, 8] },
      retargetedTopic: "Kalıtım",
    });
    expect(patch).toEqual({
      title: "Sözlü · Kalıtım",
      session_meta: { role: "practice", topicId: "doc-b", topicTitle: "Kalıtım", sourcePages: [7, 8], activityMinutes: 4 },
    });
  });

  it("hedef değişmediyse ya da tür hazırlık geneliyse yama yok", () => {
    expect(
      retargetBindingPatch({
        kind: "oral",
        nodeTitle: "Sözlü · Kalıtım",
        storedMeta: { topicId: "doc-b", topicTitle: "Kalıtım" },
        effectiveMeta: { topicId: "doc-b" },
        retargetedTopic: "Kalıtım",
      }),
    ).toBeNull();
    expect(
      retargetBindingPatch({ kind: "focused", nodeTitle: "x", storedMeta: {}, effectiveMeta: { topicId: "d" }, retargetedTopic: "Kalıtım" }),
    ).toBeNull();
    expect(retargetBindingPatch({ kind: "oral", nodeTitle: "x", storedMeta: {}, effectiveMeta: null, retargetedTopic: null })).toBeNull();
  });

  it("üretim kaydı yamayı yazar", () => {
    const generation = read("src/lib/learning/node/generation.ts");
    expect(generation).toMatch(/retargetBindingPatch\(\{[\s\S]*effectiveMeta: sessionMeta,[\s\S]*retargetedTopic,/);
    expect(generation).toContain("patch.title = binding.title;");
  });
});

describe("#6 podcast: soran kendi sorusunu cevaplamaz", () => {
  const episode = (lines: { speaker: "ada" | "kerem"; text: string; beat?: "ask" | "reveal" }[]): PodcastEpisode =>
    ({ title: "Enflasyon", length: "diyalog", chapters: [{ title: "Giriş", lines }] }) as unknown as PodcastEpisode;

  it("soru satırının ardından gelen aynı konuşmacının cevabı öbür sese geçer; metin aynı", () => {
    const before = episode([
      { speaker: "ada", text: "Bir ülkede fiyatlar genel olarak yükseliyor." },
      { speaker: "kerem", text: "Peki bu neden paranın değerini düşürür?" },
      { speaker: "kerem", text: "Çünkü aynı parayla daha az mal alınır." },
      { speaker: "kerem", text: "Bu yüzden alım gücü azalır." },
      { speaker: "kerem", text: "Faiz bunu nasıl etkiler?" },
      { speaker: "ada", text: "Faiz yükselince harcama yavaşlar." },
    ]);
    expect(turnShapeProblems(before).length).toBeGreaterThan(0);
    const after = handOffSelfAnswers(before);
    const lines = after.chapters[0]!.lines;
    expect(lines.map((line) => line.speaker)).toEqual(["ada", "kerem", "ada", "ada", "kerem", "ada"]);
    expect(lines.map((line) => line.text)).toEqual(before.chapters[0]!.lines.map((line) => line.text));
    expect(turnShapeProblems(after).filter((item) => item.reason === "soruyu soran kendisi cevaplıyor")).toEqual([]);
  });

  it("dinleyene soru, ikinci soru ve öbürüne adıyla seslenen satır taşınmaz; tek seste dokunulmaz", () => {
    const kept = episode([
      { speaker: "ada", text: "Durup bir düşün: talep artarsa ne olur?", beat: "ask" },
      { speaker: "ada", text: "Fiyatlar yükselir." },
      { speaker: "kerem", text: "Arz neden sabit kalır?" },
      { speaker: "kerem", text: "Bunu da merak ettim, kısa vadede mi?" },
      { speaker: "ada", text: "Maliyet nasıl değişir?" },
      { speaker: "ada", text: "Kerem, sen de düşün: üretim artınca birim maliyet düşer." },
    ]);
    expect(handOffSelfAnswers(kept).chapters[0]!.lines.map((line) => line.speaker)).toEqual(["ada", "ada", "kerem", "kerem", "ada", "ada"]);
    const single = { ...kept, length: "ozet" } as PodcastEpisode;
    expect(handOffSelfAnswers(single)).toBe(single);
  });

  it("yayın öncesi yapısal düzeltme (balanceKerem) bunu uygular", () => {
    const before = episode([
      { speaker: "ada", text: "Bütçe açığı nedir, önce onu konuşalım." },
      { speaker: "kerem", text: "Devlet gelirinden fazla harcarsa ne olur?" },
      { speaker: "kerem", text: "Aradaki fark borçlanmayla kapanır." },
      { speaker: "ada", text: "Evet, bu borç faiz yükü getirir." },
    ]);
    expect(balanceKerem(before).chapters[0]!.lines[2]!.speaker).toBe("ada");
  });
});

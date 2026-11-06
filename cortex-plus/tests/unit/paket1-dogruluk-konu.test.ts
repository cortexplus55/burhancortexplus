import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLE_CLASSIFICATION_RULE } from "@/lib/learning/teaching-rubric";
import {
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  TOPIC_VERIFY_SYSTEM,
  VERIFY_SYSTEM,
  alternativeBlock,
  inputBackbone,
  teacherUserPrompt,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";
import { lessonSanitySystem, lessonSanityUserPrompt } from "@/lib/learning/lesson-sanity";
import { sanitySource } from "@/lib/learning/teacher-lesson-run";
import { LEAD_EXAMPLE_RULE, rewriteLeadPrompt, rewriteLeadStreamPrompt } from "@/lib/learning/rewrite-lead";
import { SIMPLIFY_LINE, simplifyLine, wantsSimpler } from "@/lib/ai/simplify-request";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import { backboneWithoutSiblings, narrowPagesToTopic, prepTopicScopeLine } from "@/lib/learning/topic-section";
import { topicRowForLabel } from "@/lib/learning/prep-topic-lookup";
import { ADDED_TOPIC_ID_PREFIX, addedTopicIdMap } from "@/lib/learning/apply-prep-topics";
import { buildDocumentSkeleton, skeletonCoverage } from "@/lib/documents/outline-skeleton";
import type { OutlineUnitDraft } from "@/lib/documents/outline-clean";
import { POOL_LESSON_MIN_CHECKS, interleavePoolChecks, poolCheckSlots, type PoolCheckItem } from "@/lib/content-pool/lesson-checks";

/*
  Paket 1 (6 Kasım 2026, canlı sınav) — bilimsel doğruluk, "Farklı anlat" kalitesi, konu yalıtımı, havuz dersinde soru.
  Bekçilerin örnekleri bilerek tarih, biyoloji ve iktisattan: kural ders bağımsız, üretim koduna senaryo kelimesi girmez.
*/

const SCENARIO_WORDS = /ekmek|bileşik|karışım|sürtünme|newton|eğik düzlem|kinetik|kimya|fizik/iu;

describe("1. örneğin sınıflandırması: yazar, denetçi, hafif doğrulayıcı ve giriş ekranı aynı kural", () => {
  it("kural ders bağımsız ve senaryo kelimesi taşımaz", () => {
    expect(EXAMPLE_CLASSIFICATION_RULE).not.toMatch(SCENARIO_WORDS);
    expect(LEAD_EXAMPLE_RULE).not.toMatch(SCENARIO_WORDS);
    expect(SIMPLIFY_LINE).not.toMatch(SCENARIO_WORDS);
  });

  it("belgeli ve belgesiz yazar, iki denetçi ve hafif doğrulayıcı kuralı aynen okur", () => {
    for (const prompt of [
      TEACHER_SYSTEM,
      TOPIC_TEACHER_SYSTEM,
      VERIFY_SYSTEM,
      TOPIC_VERIFY_SYSTEM,
      lessonSanitySystem("document"),
      lessonSanitySystem("topic"),
    ]) {
      expect(prompt).toContain(EXAMPLE_CLASSIFICATION_RULE);
    }
    // Denetçide yanlış sınıflandırılmış örnek yüksek önemde (A).
    expect(VERIFY_SYSTEM).toMatch(/sınıfa konması A'dır \('high'\)/);
    expect(TOPIC_VERIFY_SYSTEM).toMatch(/A\) Yanlış olgu[^\n]*sınıfa konması/);
  });

  it("Farklı anlat girişi (hızlı model) ve asıl yazarın Farklı anlat bloğu da kuralı taşır", () => {
    const basis = "KAZANIMLAR:\n- B.9.1: Hücre zarının yapısını açıklar.";
    expect(rewriteLeadPrompt({ topicLabel: "Hücre Zarı", basis }).system).toContain(EXAMPLE_CLASSIFICATION_RULE);
    expect(rewriteLeadStreamPrompt({ topicLabel: "Hücre Zarı", basis }).system).toContain(EXAMPLE_CLASSIFICATION_RULE);
    expect(alternativeBlock("ÖNCEKİ ANLATIM: …")).toMatch(/ÖRNEĞİN SINIFLANDIRMASI/);
  });

  it("belgesiz derste konunun doğrulanmış havuz anlatımı yazara ve hafif doğrulayıcıya ONAYLI BİLGİLER olarak gider", () => {
    const facts = "Enflasyon, genel fiyat düzeyinin sürekli artmasıdır. Örnek: bir yıl içinde sepet fiyatının yükselmesi.";
    const input: TeacherLessonInput = {
      topicLabel: "Enflasyon",
      prepTitle: "KPSS İktisat",
      pages: [],
      upcomingTopics: [],
      mode: "topic",
      approvedFacts: facts,
    };
    const prompt = teacherUserPrompt(input);
    expect(prompt).toContain("ONAYLI BİLGİLER");
    expect(prompt).toContain(facts);
    expect(prompt).not.toContain("KAYNAK: (yok");
    expect(teacherUserPrompt({ ...input, approvedFacts: undefined })).toContain("KAYNAK: (yok");
    expect(sanitySource(input)).toBe(facts);
    expect(lessonSanityUserPrompt({ mode: "topic", topicLabel: "Enflasyon", source: facts, screens: [] })).toContain("ONAYLI BİLGİLER");
    expect(lessonSanityUserPrompt({ mode: "topic", topicLabel: "Enflasyon", source: "", screens: [] })).not.toContain("ONAYLI");
  });

  it("node ders modülü belgesiz derste havuz anlatımını okur, belgeli derste kardeş konuları", () => {
    const lesson = readFileSync("src/lib/learning/node/lesson.ts", "utf8");
    expect(lesson).toContain("poolSourceText(input.service");
    expect(lesson).toContain("approvedFacts");
    expect(lesson).toContain("narrowPagesToTopic");
    expect(lesson).toContain("siblingTopics");
  });
});

describe("2. AI öğretmen sadeleştirme isteğini tanır", () => {
  it("genel sadeleştirme kalıpları", () => {
    for (const message of [
      "Çok daha basit anlat, 10 yaşındaki birine anlatır gibi",
      "Anlamadım",
      "hiç anlamıyorum bunu",
      "Basitçe açıklar mısın?",
      "Bunu çocuğa anlatır gibi anlat",
      "Formülsüz anlatır mısın",
      "Daha sade anlat lütfen",
      "Kafam karıştı",
      "Explain like I'm five",
      "Sekiz yaşındaki kardeşime anlatır gibi",
    ]) {
      expect(wantsSimpler(message), message).toBe(true);
    }
  });

  it("konu adındaki 'basit' ya da 'kolay' istek sayılmaz", () => {
    for (const message of ["Basit makineler nedir?", "Fotosentezin evreleri nelerdir?", "Hangisi daha kolay bir soru?", "Kolay mı?"]) {
      expect(wantsSimpler(message), message).toBe(false);
    }
    expect(simplifyLine("Mitoz nedir?")).toBe("");
  });

  it("satır gündelik dil, önce sezgi ve doğru benzetme, en çok bir formül ister", () => {
    expect(SIMPLIFY_LINE).toMatch(/Gündelik kelimeler/);
    expect(SIMPLIFY_LINE).toMatch(/Önce sezgiyi/);
    expect(SIMPLIFY_LINE).toMatch(/en çok bir formül/);
    expect(SIMPLIFY_LINE).toMatch(/tek cümlelik basit bir açıklama/);
  });

  it("öğretmen sohbetinin sistem istemine eklenir; istek yoksa eklenmez", async () => {
    const seen: string[] = [];
    const create = vi.fn(async (body: { messages: { role: string; content: string }[] }) => {
      seen.push(body.messages[0]!.content);
      return { choices: [{ message: { content: "Hücre, canlının en küçük yapı taşıdır." } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
    });
    const base = {
      client: { chat: { completions: { create } } } as never,
      model: "gpt-6-luna",
      context: { examTitle: null, daysLeft: null, topic: null, learnerLines: [], passages: [], mode: "general" as const },
      history: [],
      onUsage: async () => undefined,
      verify: false,
    };
    await runTeacherTutor({ ...base, message: "Hücreyi 10 yaşındaki birine anlatır gibi anlat" });
    await runTeacherTutor({ ...base, message: "Hücre nedir?" });
    expect(seen[0]).toContain(SIMPLIFY_LINE);
    expect(seen[1]).not.toContain(SIMPLIFY_LINE);
  });

  it("genel sohbet yolu da satırı ekler", () => {
    expect(readFileSync("src/app/api/ai/chat/route.ts", "utf8")).toContain("simplifyLine(message)");
  });
});

const sharedPage = [
  "3. Mitoz Bölünme",
  "Mitozda bir hücreden kalıtsal olarak aynı iki hücre oluşur; kromozom sayısı korunur (Şekil 2).",
  "Evreler sırasıyla profaz, metafaz, anafaz ve telofazdır; metafazda kromozomlar ekvatorda dizilir.",
  "4. Mayoz Bölünme",
  "Mayozda kromozom sayısı yarıya iner ve dört hücre oluşur; parça değişimi çeşitlilik sağlar. Üreme hücreleri bu yolla oluşur.",
  "Şekilde işaretli değerler:",
  "Şekil 2: Mitoz evreleri",
  "Profaz → Metafaz → Anafaz → Telofaz",
].join("\n");

describe("3. konu yalıtımı: aynı sayfayı paylaşan öbür konunun bölümü kaynaktan çıkar", () => {
  const siblings = ["Hücre Zarı", "Mitoz Bölünme", "Mayoz Bölünme"];

  it("konu kendi bölümüyle kalır, şekil eki yalnız gönderme yapan bölümde", () => {
    const mitoz = narrowPagesToTopic([{ page: 2, text: sharedPage }], "Mitoz Bölünme", siblings);
    expect(mitoz.narrowed).toBe(true);
    expect(mitoz.pages[0]!.text).toContain("profaz, metafaz");
    expect(mitoz.pages[0]!.text).not.toMatch(/yarıya iner/);
    expect(mitoz.pages[0]!.text).toContain("Şekil 2: Mitoz evreleri");
    expect(mitoz.dropped).toEqual(["Mayoz Bölünme"]);

    const mayoz = narrowPagesToTopic([{ page: 2, text: sharedPage }], "Mayoz Bölünme", siblings);
    expect(mayoz.pages[0]!.text).toContain("yarıya iner");
    expect(mayoz.pages[0]!.text).not.toMatch(/metafazda/);
    expect(mayoz.pages[0]!.text).not.toContain("Şekil 2");
  });

  it("öbür konunun başlığı yoksa, konu metni çok kısalırsa ya da yardımcı sayfada dokunulmaz", () => {
    const alone = [{ page: 1, text: "1. Hücre Zarı\nHücre zarı seçici geçirgendir; madde geçişini denetler ve hücreyi çevreden ayırır." }];
    expect(narrowPagesToTopic(alone, "Hücre Zarı", siblings).narrowed).toBe(false);
    const tiny = [{ page: 2, text: "3. Mitoz Bölünme\nKısa.\n4. Mayoz Bölünme\n" + "Mayozda kromozom sayısı yarıya iner. ".repeat(6) }];
    expect(narrowPagesToTopic(tiny, "Mitoz Bölünme", siblings).narrowed).toBe(false);
    const support = [{ page: 9, text: sharedPage, label: "Ek kaynak · defter.jpg" }];
    expect(narrowPagesToTopic(support, "Mitoz Bölünme", siblings).pages[0]!.text).toBe(sharedPage);
  });

  it("hiçbir konunun olmayan alt başlık bulunduğu bölümün sahibinde kalır", () => {
    const text = [
      "1. Lale Devri",
      "Lale Devri barış ve yenileşme dönemidir; matbaa bu dönemde kurulmuştur, elçiler Avrupa'ya gönderilmiştir.",
      "1.1 Matbaanın Kuruluşu",
      "İlk Türk matbaası İbrahim Müteferrika tarafından kurulmuştur ve basılan ilk kitaplar sözlük ve tarih kitaplarıdır.",
      "2. Islahat Fermanı",
      "Islahat Fermanı gayrimüslimlere yeni haklar tanıyan bir fermandır.",
    ].join("\n");
    const out = narrowPagesToTopic([{ page: 1, text }], "Lale Devri", ["Lale Devri", "Islahat Fermanı"]);
    expect(out.pages[0]!.text).toContain("Müteferrika");
    expect(out.pages[0]!.text).not.toContain("gayrimüslimlere");
  });

  it("ders istemi kapsam satırını okur; omurga öbür konunun başlığını dayatmaz", () => {
    const input: TeacherLessonInput = {
      topicLabel: "Mitoz Bölünme",
      prepTitle: "YKS Biyoloji",
      pages: [{ page: 2, text: sharedPage }],
      upcomingTopics: [],
      siblingTopics: siblings,
    };
    expect(teacherUserPrompt(input)).toContain(prepTopicScopeLine("Mitoz Bölünme", siblings));
    expect(inputBackbone({ ...input, siblingTopics: undefined })).toContain("Mayoz Bölünme");
    expect(inputBackbone(input)).not.toContain("Mayoz Bölünme");
    expect(backboneWithoutSiblings(["Profaz", "Mayoz Bölünme"], "Mitoz Bölünme", siblings)).toEqual(["Profaz"]);
  });

  it("konu testi de daraltılmış sayfalardan ve kapsam satırıyla yazılır", () => {
    const quiz = readFileSync("src/lib/learning/node/quiz.ts", "utf8");
    expect(quiz).toContain("narrowPagesToTopic");
    expect(quiz).toContain("brief: scopeLine");
  });

  it("elle eklenen konu: düğüm ilk konuya değil adıyla konusuna düşer; kurulum geçici kimliği çevirir", () => {
    const rows = [
      { id: "t1", label: "Hücre Zarı" },
      { id: "t2", label: "Mitoz Bölünme" },
      { id: "t3", label: "Kalıtım ve Çaprazlama" },
    ];
    expect(topicRowForLabel(rows, "mitoz bölünme")?.id).toBe("t2");
    expect(topicRowForLabel(rows, "Kalıtım")?.id).toBe("t3");
    expect(topicRowForLabel(rows, "Ekosistem")).toBeNull();
    expect(topicRowForLabel(rows, "Ekosistem", { firstIfUnmatched: true })?.id).toBe("t1");

    const map = addedTopicIdMap(
      [{ id: "node-a" }, { id: `${ADDED_TOPIC_ID_PREFIX}2:kalitim` }],
      [
        { id: "row-0", sort_order: 0 },
        { id: "row-1", sort_order: 1 },
      ],
    );
    expect([...map]).toEqual([[`${ADDED_TOPIC_ID_PREFIX}2:kalitim`, "row-1"]]);
    expect(readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8")).toContain("addedTopicIdMap(scheduleTopics");
    expect(readFileSync("src/lib/learning/node/context.ts", "utf8")).toContain("topicRowForLabel(data ?? [], sessionMeta.topicTitle)");
  });

  it("konu haritası: kısa kendi bölümü olan konu sonraki numaralı bölümü sahiplenmez, o bölüm yutulmuş sayılır", () => {
    const longBody =
      "Tanım: Islahat Fermanı 1856'da ilan edilmiştir. Örnek olarak gayrimüslimlere memuriyet, askerlik ve vergi " +
      "konularında yeni haklar tanınmıştır; azınlıkların okul ve ibadethane açma hakkı genişlemiştir. ".repeat(4);
    const pages = [
      {
        pageNumber: 2,
        text: [
          "3. Lale Devri",
          "Lale Devri barış ve yenileşme dönemidir; matbaa kurulmuştur (Şekil 1).",
          "4. Islahat Fermanı",
          longBody,
        ].join("\n"),
      },
    ];
    const skeleton = buildDocumentSkeleton([{ fileName: "tarih.pdf", pages }]);
    const units: OutlineUnitDraft[] = [
      { title: "Osmanlı Yenileşmesi", topics: [{ title: "Lale Devri", pageNumbers: [2], fileIndex: 0 } as OutlineUnitDraft["topics"][number]] },
    ];
    const coverage = skeletonCoverage(skeleton, units, { singleFile: true });
    expect(coverage.gaps.map((gap) => gap.heading)).toEqual(["Islahat Fermanı"]);
    // Konu adı başka (haritanın verdiği ad) olsaydı eski konum kuralı geçerli: yutma yok.
    const renamed: OutlineUnitDraft[] = [
      { title: "Osmanlı Yenileşmesi", topics: [{ title: "Yenileşme Dönemi", pageNumbers: [2], fileIndex: 0 } as OutlineUnitDraft["topics"][number]] },
    ];
    expect(skeletonCoverage(skeleton, renamed, { singleFile: true }).gaps).toEqual([]);
  });
});

const item = (id: string, outcome: string, explanation: string | null = "Doğru cevabın gerekçesi burada."): PoolCheckItem => ({
  id,
  outcome_id: outcome,
  stem: `Aşağıdakilerden hangisi ${id} kazanımını yoklar?`,
  choices: ["A) Birinci", "B) İkinci", "C) Üçüncü", "D) Dördüncü"],
  answer: 1,
  explanation,
});
const screen = (n: number, blocks = 3) => ({
  heading: `Bölüm ${n}`,
  concept: `Bölüm ${n}`,
  blocks: Array.from({ length: blocks }, (_, i) => ({ type: "text", text: `metin ${n}.${i}` })),
});

describe("4. havuz dersinde en az üç soru, her 2-3 ekranda bir", () => {
  it("sorusuz yedi ekranlı derse üç soru serpiştirilir, kazanımın sorusu önce", () => {
    const lesson = { screens: Array.from({ length: 7 }, (_, n) => screen(n)) };
    expect(poolCheckSlots(lesson.screens)).toEqual([1, 3, 5]);
    const items = [item("x1", "u#9"), item("a1", "u#2"), item("b1", "u#4"), item("c1", "u#6")];
    const outcomes = lesson.screens.map((_, n) => [`u#${n + 1}`]);
    const { lesson: out, added } = interleavePoolChecks(lesson, items, outcomes);
    expect(added).toBe(3);
    const checks = out.screens.flatMap((s, n) => s.blocks.filter((b) => b.type === "check").map((b) => [n, b] as const));
    expect(checks.map(([n]) => n)).toEqual([1, 3, 5]);
    const first = checks[0]![1] as unknown as { check: { prompt: string; options: string[]; answerIndex: number } };
    expect(first.check.prompt).toContain("a1");
    expect(first.check.options).toEqual(["Birinci", "İkinci", "Üçüncü", "Dördüncü"]);
    expect(first.check.answerIndex).toBe(1);
    // Ekranın son bloğu soru (ekran başına bir soru).
    expect(out.screens[1]!.blocks.at(-1)!.type).toBe("check");
    expect(lesson.screens[1]!.blocks.some((b) => b.type === "check")).toBe(false);
  });

  it("kısa derste de en az üç soru; dolu ekranın sorusu kendi ekranında", () => {
    const short = { screens: [screen(0), screen(1, 12)] };
    const items = [item("a", "u#1"), item("b", "u#1"), item("c", "u#1"), item("d", "u#1")];
    const { lesson: out, added } = interleavePoolChecks(short, items);
    expect(added).toBe(POOL_LESSON_MIN_CHECKS);
    const checks = out.screens.filter((s) => s.blocks.some((b) => b.type === "check"));
    expect(checks).toHaveLength(3);
    expect(out.screens.every((s) => s.blocks.filter((b) => b.type === "check").length <= 1)).toBe(true);
    expect(out.screens.some((s) => s.heading.endsWith("kendini dene"))).toBe(true);
  });

  it("zaten sorusu olan ekran yeni soru almaz; açıklaması olmayan banka sorusu kullanılmaz; banka boşsa ders aynen", () => {
    const withCheck = {
      screens: [
        { heading: "A", concept: "A", blocks: [{ type: "text", text: "x" }, { type: "check", check: { type: "mcq" } }] },
        screen(1),
        screen(2),
        screen(3),
      ],
    };
    const { lesson: out } = interleavePoolChecks(withCheck, [item("a", "u"), item("b", "u", null), item("c", "u"), item("d", "u")]);
    expect(out.screens[0]!.blocks.filter((b) => b.type === "check")).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("b kazanımını");
    const empty = { screens: [screen(0)] };
    expect(interleavePoolChecks(empty, []).lesson).toBe(empty);
  });

  it("havuz sunumu ve kazanım dersi bankayı okur", () => {
    expect(readFileSync("src/lib/content-pool/serve.ts", "utf8")).toContain("withPoolChecks(poolLessonV3(");
    expect(readFileSync("src/lib/learning/node/outcome-start.ts", "utf8")).toContain("readPoolLessonChecks(");
  });
});

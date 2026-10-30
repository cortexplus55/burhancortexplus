import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { backboneBlock, headingOfLine, lessonBackbone, uncoveredBackbone } from "@/lib/learning/lesson-backbone";
import {
  BACKBONE_TAG,
  COVERAGE_TAG,
  TEACHER_SYSTEM,
  stripLessonIssueTags,
  dropRepeatedChecks,
  fixPartUserPrompt,
  lessonLevelStructureIssues,
  parsePartFix,
  repeatedCheck,
  repetitionIssues,
  teacherUserPrompt,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";
import { storedMissingConcepts, withoutMissingPoints } from "@/lib/learning/lesson-quiz-context";
import { topicTestPoints } from "@/lib/learning/teacher-quiz";
import { screenCheck, type LessonBlock, type LessonScreen, type LessonV3 } from "@/lib/learning/lesson-v3";

/*
  P0-2 (25 Ekim 2026) — ders bağımsız: ders kaynağın bütün alt başlıklarını kapsar, düzelmeyen kavram atılmak
  yerine baştan yazılır, ders içi soru tekrarı yayımdan önce düşer, hazırlanamayan bölüm testte sorulmaz.
  Aynı kurallar farklı derslerin belgelerinde aynı sonucu vermeli.
*/

const tf = (prompt: string, corrected?: string) =>
  ({
    type: "check",
    check: {
      type: "trueFalse",
      prompt,
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Açıklama.",
      ...(corrected ? { corrected } : {}),
    },
  }) as LessonBlock;

const mcq = (prompt: string, reviewPrompt?: string) =>
  ({
    type: "check",
    check: {
      type: "mcq",
      prompt,
      options: ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı"],
      answerIndex: 0,
      explanation: "Açıklama.",
      ...(reviewPrompt
        ? { review: { prompt: reviewPrompt, options: ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı"], answerIndex: 0, explanation: "x" } }
        : {}),
    },
  }) as LessonBlock;

const text = (value: string) => ({ type: "text", text: value }) as LessonBlock;
const screen = (heading: string, blocks: LessonBlock[], concept = heading): LessonScreen => ({ heading, concept, blocks });
const lesson = (screens: LessonScreen[]): LessonV3 => ({
  format: 3,
  title: "Ders",
  overview: "Kanca.",
  screens,
  summary: ["Bir.", "İki.", "Üç."],
});

/** Farklı derslerden, farklı başlık biçimleriyle konu sayfaları. */
const SUBJECTS: Record<string, { pages: { page: number; text: string }[]; heads: string[] }> = {
  matematik: {
    pages: [
      { page: 1, text: "1.1 Türev Tanımı\nLimit ile tanımlanır.\n1.2 Türev Alma Kuralları\nÇarpım ve bölüm kuralı." },
      { page: 2, text: "1.3 Zincir Kuralı\nBileşke fonksiyonun türevi.\n1.4 Türevin Uygulamaları\nEkstremum problemleri." },
    ],
    heads: ["Türev Tanımı", "Türev Alma Kuralları", "Zincir Kuralı", "Türevin Uygulamaları"],
  },
  tarih: {
    pages: [
      { page: 1, text: "## Lale Devri\nBarış ve yenilik dönemi.\n## Islahat Fermanı\nGayrimüslimlere haklar." },
      { page: 2, text: "## Kanun-ı Esasi\nİlk anayasa 1876.\n## Meşrutiyetin İlanı\nMeclis açılır." },
    ],
    heads: ["Lale Devri", "Islahat Fermanı", "Kanun-ı Esasi", "Meşrutiyetin İlanı"],
  },
  hukuk: {
    pages: [
      { page: 1, text: "BUTLAN TÜRLERİ\nMutlak ve nisbi butlan ayrımı.\nYOKLUK HALLERİ\nKurucu unsur eksikliği." },
      { page: 2, text: "İPTAL EDİLEBİLİRLİK\nİrade sakatlığı halleri.\nTENKİS DAVASI\nSaklı pay ihlali." },
    ],
    heads: ["Butlan türleri", "Yokluk halleri", "İptal edilebilirlik", "Tenkis davası"],
  },
  biyoloji: {
    pages: [
      { page: 1, text: "**Mitoz Evreleri**\nProfaz, metafaz, anafaz.\n**Mayoz Bölünme**\nKrossing over olur." },
      { page: 2, text: "**Hücre Döngüsü Denetimi**\nKontrol noktaları.\n**Eşeysiz Üreme Tipleri**\nTomurcuklanma, bölünme." },
    ],
    heads: ["Mitoz Evreleri", "Mayoz Bölünme", "Hücre Döngüsü Denetimi", "Eşeysiz Üreme Tipleri"],
  },
};

describe("omurga: konunun kendi alt başlıkları (ders bağımsız)", () => {
  for (const [subject, { pages, heads }] of Object.entries(SUBJECTS)) {
    it(`${subject}: başlık biçimi ne olursa olsun alt başlıklar sırayla çıkar`, () => {
      expect(lessonBackbone(pages)).toEqual(heads);
    });
  }

  it("düz cümle, tablo satırı, kutu etiketi, sayfa kenarı, ek kaynak ve konunun kendi adı omurgaya girmez", () => {
    const pages = [
      {
        page: 1,
        text: [
          "## Kuvvet ve Hareket",
          "Bu bölümde cisimlerin hareketini inceleyeceğiz ve hızın nasıl değiştiğini göreceğiz.",
          "| Büyüklük | Birim |",
          "SINAV İPUCU",
          "FİZİK | NOTLAR | BÖLÜM 2",
          "## Newton Yasaları",
        ].join("\n"),
      },
      { page: 2, text: "## Sürtünme Kuvveti", label: "Ek kaynak · test.jpg" },
    ];
    expect(lessonBackbone(pages, { topicLabel: "Kuvvet ve Hareket", runningHeaders: ["FİZİK | NOTLAR | BÖLÜM 2"] })).toEqual([
      "Newton Yasaları",
    ]);
    expect(headingOfLine("Cisim sabit hızla hareket ederken net kuvvet sıfırdır.")).toBeNull();
  });

  it("yazar omurgayı görür; belgesiz derste omurga yok", () => {
    const input: TeacherLessonInput = {
      topicLabel: "Türev",
      prepTitle: "AYT Matematik",
      pages: SUBJECTS.matematik!.pages,
      upcomingTopics: [],
    };
    const prompt = teacherUserPrompt(input);
    expect(prompt).toContain("OMURGA");
    expect(prompt).toContain("1) Türev Tanımı · 2) Türev Alma Kuralları · 3) Zincir Kuralı · 4) Türevin Uygulamaları");
    expect(prompt).toContain("hiçbirini atlama");
    expect(teacherUserPrompt({ ...input, mode: "topic" })).not.toContain("OMURGA");
    expect(backboneBlock([])).toBe("");
  });

  it("yazar istemi tam kapsam ister: 6-10 ekran, en çok 12, soru tekrarı yok", () => {
    expect(TEACHER_SYSTEM).toContain("6-10 ekran");
    expect(TEACHER_SYSTEM).toContain("klasik soru/problem tiplerini");
    expect(TEACHER_SYSTEM).toContain("En fazla 12 ekran");
    expect(TEACHER_SYSTEM).toContain("16 ekranı geçme");
    expect(TEACHER_SYSTEM).not.toContain("3-4 kavram (kaynak darsa 2)");
    expect(TEACHER_SYSTEM).toContain("aynı soruyu ya da aynı bilgiyi sormaz");
  });
});

describe("kapsanmayan alt başlık kapanışta öğretim turu açar, kavram düşürmez", () => {
  const pages = SUBJECTS.tarih!.pages;
  const covered = [
    screen("Lale Devri", [text("Lale Devri barış dönemidir."), mcq("Lale Devri hangi dönemin adıdır ve neyle bilinir?")]),
    screen("Islahat Fermanı", [text("Islahat Fermanı haklar tanır."), mcq("Islahat Fermanı kimlere hangi hakları tanımıştır?")]),
    screen("Kanun-ı Esasi", [text("Kanun-ı Esasi ilk anayasadır."), mcq("Kanun-ı Esasi hangi yıl ilan edilen ilk anayasadır?")]),
  ];

  it("eksik başlık adıyla listelenir", () => {
    expect(uncoveredBackbone(covered, lessonBackbone(pages))).toEqual(["Meşrutiyetin İlanı"]);
    const all = [...covered, screen("Meşrutiyetin İlanı", [text("Meşrutiyetin ilanıyla meclis açılır."), mcq("Meşrutiyet ilan edilince hangi kurum açılmıştır?")])];
    expect(uncoveredBackbone(all, lessonBackbone(pages))).toEqual([]);
  });

  it("dersin bütününe yüksek [omurga] sorunu yazılır; belgesiz derste yazılmaz", () => {
    const issues = lessonLevelStructureIssues(lesson(covered), { pages, runningHeaders: [] });
    const gap = issues.find((issue) => issue.problem.startsWith(BACKBONE_TAG));
    expect(gap?.severity).toBe("high");
    expect(gap?.problem).toContain("Meşrutiyetin İlanı");
    expect(lessonLevelStructureIssues(lesson(covered), { pages, runningHeaders: [], mode: "topic" }).some((issue) => issue.problem.startsWith(BACKBONE_TAG))).toBe(false);
  });

  it("kilit bilgi eksiği yüksek [kapsam] yazar; etiket öğrenci metninde durmaz", () => {
    const ratioPages = [{ page: 1, text: "Karışım 5:2 oranındadır." }];
    const issues = lessonLevelStructureIssues(lesson([screen("Oran", [text("Karışım anlatılır."), mcq("Oran hangi paydadır?")])]), {
      pages: ratioPages,
      runningHeaders: [],
    });
    const gap = issues.find((issue) => issue.problem.startsWith(COVERAGE_TAG));
    expect(gap?.severity).toBe("high");
    expect(gap?.problem).toContain("5:2");
    const tagged = { body: "[kapsam] [omurga] [öğretim] [yapı kuralı] gizli" };
    expect(stripLessonIssueTags(tagged).body).toBe("gizli");
    const clean = { body: "düz metin" };
    expect(stripLessonIssueTags(clean)).toBe(clean);
  });

  it("kapanış düzeltmesi yeni kavram ekranları ekleyebilir ve hepsi okunur", () => {
    const input: TeacherLessonInput = { topicLabel: "Islahatlar", prepTitle: "KPSS Tarih", pages, upcomingTopics: [] };
    const gap = { where: "screens[2]", severity: "medium" as const, problem: `${BACKBONE_TAG} Kaynağın şu alt başlıkları derste işlenmedi: Meşrutiyetin İlanı.` };
    const prompt = fixPartUserPrompt(lesson(covered), { from: 2, to: 2, header: false, closing: true }, [gap], input);
    expect(prompt).toContain("işlenmemiş alt başlıklar için en çok 4 yeni ekran");
    const extra = Array.from({ length: 5 }, (_, i) =>
      screen(`Yeni ${i}`, [text(`Yeni ekran ${i} metni.`), mcq(`Yeni ekran ${i} için hangi bilgi doğrudur?`)]),
    );
    const parsed = parsePartFix({ screens: [covered[2], ...extra], disputes: [] }, lesson(covered), []);
    expect(parsed?.screens).toHaveLength(6);
  });
});

describe("ders içi soru tekrarı deterministik olarak düşer", () => {
  const first = screen("Bir", [tf("Mitoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur.", "Mitozda kromozom sayısı korunur ve iki hücre oluşur."), text("Metin.")]);

  it("aynı ifade, olumsuzu ya da 'Doğrusu' cümlesi tekrar sayılır", () => {
    const same = screen("İki", [text("Metin."), tf("Mitoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur.")]);
    const negated = screen("İki", [text("Metin."), tf("Mitoz bölünmede kromozom sayısı yarıya inmez ve dört hücre oluşmaz.")]);
    const corrected = screen("İki", [text("Metin."), tf("Mitozda kromozom sayısı korunur ve iki hücre oluşur.")]);
    expect(repeatedCheck([first], same)).not.toBeNull();
    expect(repeatedCheck([first], negated)).not.toBeNull();
    expect(repeatedCheck([first], corrected)).not.toBeNull();
  });

  it("sayısı değişen hesap sorusu ve başka ayrım tekrar değildir", () => {
    const a = screen("Hesap", [text("Metin."), mcq("Kütlesi 4 kg olan cisme 12 N net kuvvet uygulanırsa ivmesi kaç m/s² olur?")]);
    const b = screen("Hesap 2", [text("Metin."), mcq("Kütlesi 5 kg olan cisme 20 N net kuvvet uygulanırsa ivmesi kaç m/s² olur?")]);
    const c = screen("Başka", [text("Metin."), mcq("Hangi bölünme tipinde homolog kromozomlar arasında parça değişimi görülür?")]);
    expect(repeatedCheck([a], b)).toBeNull();
    expect(repeatedCheck([first], c)).toBeNull();
  });

  it("yayımdan önce tekrar eden soru çıkar, ekranın metni kalır; tekrar eden ikinci soru yalnız kendisi çıkar", () => {
    const dup = screen("İki", [text("İkinci ekranın metni."), tf("Mitoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur.")]);
    const reviewDup = screen("Üç", [
      text("Üçüncü ekran."),
      mcq("Hangi bölünme tipinde homolog kromozomlar arasında parça değişimi görülür?", "Mitozda kromozom sayısı korunur ve iki hücre oluşur."),
    ]);
    const out = dropRepeatedChecks([first], [dup, reviewDup]);
    expect(screenCheck(out[0]!)).toBeUndefined();
    expect(out[0]!.blocks).toEqual([text("İkinci ekranın metni.")]);
    const kept = screenCheck(out[1]!) as { prompt: string; review?: unknown };
    expect(kept.prompt).toContain("homolog kromozomlar");
    expect(kept.review).toBeUndefined();
    // Aynı kısım içindeki iki ekran da birbirine karşı denetlenir.
    const twin = screen("Dört", [text("x"), tf("Mitoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur.")]);
    expect(screenCheck(dropRepeatedChecks([], [first, twin])[1]!)).toBeUndefined();
  });

  it("denetim sırasında da öğretim sorunu olarak işaretlenir ve yayıncı kapıyı kullanır", () => {
    const dup = screen("İki", [text("Metin."), tf("Mitoz bölünmede kromozom sayısı yarıya iner ve dört hücre oluşur.")]);
    const issues = repetitionIssues([first, dup], [1]);
    expect(issues.some((issue) => issue.severity === "medium" && /zaten soruldu/.test(issue.problem))).toBe(true);
    expect(readSource("src/lib/learning/teacher-lesson-run.ts")).toContain("dropRepeatedChecks(published, outcome.screens)");
  });
});

describe("hazırlanamayan bölüm konu testinde sorulmaz", () => {
  const points = [
    "Zincir kuralı bileşke fonksiyonda dış türev çarpı iç türevdir.",
    "Türevin uygulamalarında ekstremum noktada türev sıfırdır.",
    "Çarpım kuralında iki fonksiyonun türevleri çapraz çarpılıp toplanır.",
  ];

  it("eksik kavrama ait madde çıkar; derste işlenen ya da başka maddeler kalır", () => {
    const lessonText = "Çarpım kuralı: (fg)' = f'g + fg'. Zincir kuralı bileşke fonksiyon için dış türev çarpı iç türev.";
    expect(withoutMissingPoints(points, ["Türevin Uygulamaları"], lessonText)).toEqual([points[0], points[2]]);
    expect(withoutMissingPoints(points, [], lessonText)).toEqual(points);
  });

  it("konu testinin madde listesi aynı süzgeçten geçer", () => {
    const list = topicTestPoints({
      scope: "topic_test",
      examPoints: points,
      lesson: { checks: [], terms: [], text: "Çarpım kuralı ve zincir kuralı anlatıldı: dış türev çarpı iç türev.", key: "L1", missing: ["Türevin Uygulamaları"] },
    });
    expect(list.some((point) => point.includes("ekstremum"))).toBe(false);
    expect(list).toHaveLength(2);
  });

  it("kayıtlı dersin missingConcepts alanı soru elemez ve kayda yazılmaz", () => {
    expect(storedMissingConcepts({ format: 3, missingConcepts: [" Tenkis davası ", 3, ""] })).toEqual([]);
    expect(storedMissingConcepts({ format: 3 })).toEqual([]);
    const route = readSource("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).not.toContain("missingConcepts: input.payload.missingConcepts");
  });
});

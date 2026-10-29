import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SWALLOWED_BODY_MIN,
  outlineOversizedTopics,
  oversizeRepairLines,
  swallowedSubsections,
} from "@/lib/documents/outline-oversize";
import {
  SHORT_SOLUTION_FULL_CREDIT,
  adjustScoredAnswer,
  arithmeticSlips,
  claimedResults,
  finalResults,
} from "@/lib/learning/mock-exam/grade";
import { OPEN_GRADE_SYSTEM, parseOpenGrade } from "@/lib/learning/mock-exam/open-grade";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";

vi.mock("@/lib/ai/generate", () => ({
  generateJson: vi.fn(),
  isPremiumUser: vi.fn(async () => false),
}));
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_LARGE_MODEL: "gpt-4.1",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
}));

import { generateJson } from "@/lib/ai/generate";
import {
  OUTLINE_GRANULARITY_RULE,
  prepareOutlineMaterial,
  runOutlineStep,
  type OneShotOutlineDraft,
  type OutlineProgress,
  type OutlineStepResult,
} from "@/lib/documents/outline-oneshot";

const mockedGenerate = vi.mocked(generateJson);
const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

/*
  Paket G — Son Cila (29 Ekim 2026, Grok v6 raporunun kalan üç maddesi):
  1. Konu haritası 1-3 sayfalık bağımsız alt başlığı üst konunun içinde eritmez.
  2. Açık uçlu denemede sonuç ve bağıntı doğruysa kısa çözüm tam puan alır.
  3. Çizimli 1 dakikalık video 25 kredi (280 değil).
*/

type Page = { pageNumber: number; text: string };

/** Başlık (isteğe bağlı) + `chars` karakterlik gövde; gövde başlığın kelimelerini taşır (temellendirme). */
function page(pageNumber: number, heading: string | null, body: string, chars = 1_400): Page {
  const text = body.repeat(Math.ceil(chars / body.length)).slice(0, chars);
  return { pageNumber, text: heading ? `${heading}\n${text}` : text };
}

const plain = (title: string) => `${title} konusunda tanımlar, kurallar ve örnekler sırayla anlatılır. `;
const PIECEWISE =
  "Tanım: Parçalı fonksiyon tanım kümesinin parçalarında ayrı kurallarla verilir. Örnek: f(x) = 2x + 1 (x < 0), f(x) = x² (x ≥ 0). Soru: f(-1) kaçtır? ";

/** 15 sayfalık 10. sınıf matematik notu: "2.3 Parçalı Fonksiyon" 6-7. sayfalarda kendi bölümüyle durur. */
function mathNote(): Page[] {
  return [
    page(1, "1. Gerçek Sayılar", plain("Gerçek Sayılar")),
    page(2, null, plain("Gerçek Sayılar")),
    page(3, "2. Fonksiyonlar ve Grafikleri", plain("Fonksiyonlar ve Grafikleri")),
    page(4, null, plain("Fonksiyonlar ve Grafikleri")),
    page(5, null, plain("Fonksiyonlar ve Grafikleri")),
    page(6, "2.3 Parçalı Fonksiyon", PIECEWISE),
    page(7, null, PIECEWISE),
    page(8, "3. Polinomlar ve Çarpanlar", plain("Polinomlar ve Çarpanlar")),
    page(9, null, plain("Polinomlar ve Çarpanlar")),
    page(10, null, plain("Polinomlar ve Çarpanlar")),
    page(11, null, plain("Polinomlar ve Çarpanlar")),
    page(12, "4. İkinci Dereceden Denklemler", plain("İkinci Dereceden Denklemler")),
    page(13, null, plain("İkinci Dereceden Denklemler")),
    page(14, null, plain("İkinci Dereceden Denklemler")),
    page(15, null, plain("İkinci Dereceden Denklemler")),
  ];
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const unit = (title: string, topics: { title: string; pageNumbers: number[] }[]) => ({
  title,
  topics: topics.map((topic) => ({ ...topic, fileIndex: 0 })),
});

describe("Paket G-1 — 1-3 sayfalık bağımsız alt başlık yutulmaz", () => {
  it("Parçalı Fonksiyon: 15 sayfalık notta 5 sayfalık 'Fonksiyonlar' alt bölümü yutunca onarım istenir", () => {
    const pages = mathNote();
    const swallowing = [
      unit("Matematik", [
        { title: "Gerçek Sayılar", pageNumbers: range(1, 2) },
        { title: "Fonksiyonlar ve Grafikleri", pageNumbers: range(3, 7) },
        { title: "Polinomlar ve Çarpanlar", pageNumbers: range(8, 11) },
        { title: "İkinci Dereceden Denklemler", pageNumbers: range(12, 15) },
      ]),
    ];
    const flagged = outlineOversizedTopics(swallowing, [{ pages }]);
    expect(flagged.map((topic) => topic.title)).toEqual(["Fonksiyonlar ve Grafikleri"]);
    expect(flagged[0]!.reason).toBe("subsection");
    expect(flagged[0]!.headings.some((heading) => /Parçalı Fonksiyon/.test(heading))).toBe(true);

    const repair = oversizeRepairLines(flagged);
    expect(repair).toContain("Parçalı Fonksiyon");
    expect(repair).toContain("AYRI konu");
    expect(repair).toContain("1-2 sayfa bile olsa");
    expect(repair).not.toContain("2-4 ayrı konuya böl");
  });

  it("alt bölüm kendi konusu olunca harita kabul edilir; tek kelimelik üst ad da onu kapsamaz", () => {
    const pages = mathNote();
    const split = [
      unit("Matematik", [
        { title: "Gerçek Sayılar", pageNumbers: range(1, 2) },
        { title: "Fonksiyonlar ve Grafikleri", pageNumbers: range(3, 5) },
        { title: "Parçalı Fonksiyon", pageNumbers: range(6, 7) },
        { title: "Polinomlar ve Çarpanlar", pageNumbers: range(8, 11) },
        { title: "İkinci Dereceden Denklemler", pageNumbers: range(12, 15) },
      ]),
    ];
    expect(outlineOversizedTopics(split, [{ pages }])).toEqual([]);

    const oneWord = [
      unit("Matematik", [
        { title: "Fonksiyon", pageNumbers: range(3, 7) },
        { title: "Polinomlar ve Çarpanlar", pageNumbers: range(8, 11) },
        { title: "İkinci Dereceden Denklemler", pageNumbers: range(12, 15) },
      ]),
    ];
    expect(outlineOversizedTopics(oneWord, [{ pages }]).map((topic) => topic.reason)).toEqual(["subsection"]);
  });

  it("ders bağımsız: Düşey Atış (son sayfadaki alt bölüm sayılır) ve Vergi / Taban Fiyat (kısa dosya)", () => {
    const vertical = "Düşey atış: h = v₀·t − ½·g·t² bağıntısı ile en yüksek nokta bulunur. Örnek: v₀ = 20 m/s için t = 2 s. ";
    const physics: Page[] = [
      page(1, "1. Düzgün Doğrusal Hareket", plain("Düzgün Doğrusal Hareket")),
      page(2, null, plain("Düzgün Doğrusal Hareket")),
      page(3, null, plain("Düzgün Doğrusal Hareket")),
      page(4, null, plain("Düzgün Doğrusal Hareket")),
      page(5, "2. Atış Hareketleri", plain("Atış Hareketleri")),
      page(6, null, plain("Atış Hareketleri")),
      page(7, "2.2 Düşey Atış", vertical),
      page(8, "3. Enerji ve İş", plain("Enerji ve İş")),
      page(9, null, plain("Enerji ve İş")),
      page(10, null, plain("Enerji ve İş")),
      page(11, null, plain("Enerji ve İş")),
      page(12, null, plain("Enerji ve İş")),
    ];
    const flagged = outlineOversizedTopics(
      [
        unit("Fizik", [
          { title: "Düzgün Doğrusal Hareket", pageNumbers: range(1, 4) },
          { title: "Atış Hareketleri", pageNumbers: range(5, 7) },
          { title: "Enerji ve İş", pageNumbers: range(8, 12) },
        ]),
      ],
      [{ pages: physics }],
    );
    expect(flagged.map((topic) => [topic.title, topic.reason])).toEqual([["Atış Hareketleri", "subsection"]]);
    expect(flagged[0]!.headings.join(" ")).toContain("Düşey Atış");

    // Sınır sayfası: konunun son sayfasında BÖLÜM başlığı başlıyorsa bu modelin aralık taşmasıdır, yutma değil.
    const spilled = outlineOversizedTopics(
      [
        unit("Fizik", [
          { title: "Düzgün Doğrusal Hareket", pageNumbers: range(1, 5) },
          { title: "Atış Hareketleri ve Düşey Atış", pageNumbers: range(6, 7) },
          { title: "Enerji ve İş", pageNumbers: range(8, 12) },
        ]),
      ],
      [{ pages: physics }],
    );
    expect(spilled).toEqual([]);

    const economics: Page[] = [
      page(1, "1. Piyasa Dengesi", plain("Piyasa Dengesi")),
      page(2, null, plain("Piyasa Dengesi")),
      page(3, "2. Devlet Müdahalesi", plain("Devlet Müdahalesi")),
      page(4, "2.1 Dolaylı Vergi", "Tanım: Dolaylı vergi harcama üzerinden alınır. Örnek: KDV. Kural: vergi arz eğrisini yukarı kaydırır. "),
      page(5, "2.2 Taban Fiyat Uygulaması", "Tanım: Taban fiyat denge fiyatının üstünde belirlenir. Örnek: asgari ücret. Soru: arz fazlası neden oluşur? "),
      page(6, null, plain("Devlet Müdahalesi")),
    ];
    const short = outlineOversizedTopics(
      [
        unit("İktisat", [
          { title: "Piyasa Dengesi", pageNumbers: range(1, 2) },
          { title: "Devlet Müdahalesi", pageNumbers: range(3, 6) },
        ]),
      ],
      [{ pages: economics }],
    );
    expect(short.map((topic) => [topic.title, topic.reason])).toEqual([["Devlet Müdahalesi", "subsection"]]);
    expect(short[0]!.headings).toHaveLength(2);
    expect(short[0]!.headings.join(" | ")).toMatch(/Dolaylı Vergi/);
    expect(short[0]!.headings.join(" | ")).toMatch(/Taban Fiyat/);
  });

  it("gövdesiz etiket, kısa numaralı liste, tek sayfalık konu ve yeniden adlandırılmış tek başlık yutma değildir", () => {
    const listBody = "Kısa açıklama satırı.";
    const listPage = { pageNumber: 2, text: ["1. Konumu belirle", listBody, "2. Hızı yaz", listBody, "3. Süreyi bul", listBody].join("\n") };
    const pages: Page[] = [page(1, "1. Kinematik Problemleri", plain("Kinematik Problemleri")), listPage, page(3, null, plain("Kinematik Problemleri"))];
    const topic = { title: "Kinematik Problemleri", fileIndex: 0, pageNumbers: [1, 2, 3] };
    expect(swallowedSubsections({ pages }, topic, { own: [topic.title], siblingTitles: [] })).toEqual([]);

    // Sayfa sonuna düşmüş etiket: kendi sayfasında gövdesi yok, sonraki sayfanın metni ona yazılmaz.
    const labelled: Page[] = [
      page(1, "1. Hücre Zarı Yapısı", plain("Hücre Zarı Yapısı")),
      { pageNumber: 2, text: "1.4 Önemli Not\nKısa bir etiket." },
      page(3, null, plain("Hücre Zarı Yapısı")),
    ];
    expect(
      swallowedSubsections({ pages: labelled }, { title: "Hücre Zarı Yapısı", pageNumbers: [1, 2, 3] }, { own: ["Hücre Zarı Yapısı"], siblingTitles: [] }),
    ).toEqual([]);

    const single = mathNote();
    expect(swallowedSubsections({ pages: single }, { title: "Fonksiyonlar", pageNumbers: [6] }, { own: ["Fonksiyonlar"], siblingTitles: [] })).toEqual([]);

    // Aralıkta yalnız o alt bölüm var: model başlığı başka adla yazmış, yutma yok.
    expect(
      swallowedSubsections({ pages: single }, { title: "Parçalı Tanımlı Fonksiyonlar", pageNumbers: [6, 7] }, { own: ["Parçalı Tanımlı Fonksiyonlar"], siblingTitles: [] }),
    ).toEqual([]);

    // Başlık zaten kardeş konunun adıysa yutulmuş değildir.
    expect(
      swallowedSubsections({ pages: single }, { title: "Fonksiyonlar ve Grafikleri", pageNumbers: range(3, 7) }, {
        own: ["Fonksiyonlar ve Grafikleri"],
        siblingTitles: ["Parçalı Fonksiyon"],
      }),
    ).toEqual([]);
    expect(SWALLOWED_BODY_MIN).toBeGreaterThanOrEqual(400);
  });

  it("istem kuralı yazara da aynı şeyi söyler", () => {
    expect(OUTLINE_GRANULARITY_RULE).toContain("KISA ALT BÖLÜM DE KONUDUR");
    expect(OUTLINE_GRANULARITY_RULE).toContain("1-2 sayfa bile olsa");
  });
});

describe("Paket G-1 — onarım turu alt bölümü ayrı konu olarak tutar", () => {
  beforeEach(() => {
    mockedGenerate.mockReset();
  });

  function draftOf(topics: [string, number, number][]): OneShotOutlineDraft {
    return {
      units: [
        {
          title: "Matematik",
          examWeight: "high",
          topics: topics.map(([title, pageStart, pageEnd], i) => ({
            id: `t${i + 1}`,
            title,
            whyLearn: "Öğreneceksin.",
            description: "",
            fileIndex: 0,
            pageStart,
            pageEnd,
            examWeight: "high",
            likelyAsked: [],
            prerequisiteIds: [],
          })),
        },
      ],
    } as OneShotOutlineDraft;
  }

  it("ilk harita alt bölümü yutar → onarım istemi alt bölümü adıyla söyler → bölünmüş harita kabul edilir", async () => {
    const material = prepareOutlineMaterial([{ fileName: "matematik.pdf", pages: mathNote() }]);
    const prompts: string[] = [];
    mockedGenerate.mockImplementation(async (params) => {
      prompts.push(String(params.userPrompt));
      const draft =
        prompts.length === 1
          ? draftOf([
              ["Gerçek Sayılar", 1, 2],
              ["Fonksiyonlar ve Grafikleri", 3, 7],
              ["Polinomlar ve Çarpanlar", 8, 11],
              ["İkinci Dereceden Denklemler", 12, 15],
            ])
          : draftOf([
              ["Gerçek Sayılar", 1, 2],
              ["Fonksiyonlar ve Grafikleri", 3, 5],
              ["Parçalı Fonksiyon", 6, 7],
              ["Polinomlar ve Çarpanlar", 8, 11],
              ["İkinci Dereceden Denklemler", 12, 15],
            ]);
      return { ok: true, data: params.parse(draft), reservationId: `r-${prompts.length}` } as never;
    });
    let progress: OutlineProgress = { stage: "first" };
    let result: OutlineStepResult | null = null;
    for (let step = 1; step <= 6; step += 1) {
      result = await runOutlineStep({
        service: {} as never,
        userId: "u1",
        material,
        progress,
        keyFor: (stage) => `k:${step}:${stage}`,
        deadlineAt: Date.now() + 300_000,
      });
      if (result.kind !== "continue") break;
      progress = result.progress;
    }
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("GENİŞ KONULAR — BÖL");
    expect(prompts[1]).toContain("Parçalı Fonksiyon");
    expect(prompts[1]).toContain("AYRI konu");
    expect(result?.kind).toBe("done");
    if (result?.kind !== "done") return;
    expect(result.path).toBe("repair");
    expect(result.map.kept).toBe(5);
  });
});

describe("Paket G-2 — kısa ama doğru çözüm tam puan", () => {
  const model = "Alan = taban · yükseklik = 3 · 4 = 12 cm²";
  const criteria = ["Alan bağıntısını kurar", "Ara işlemleri gösterir", "Sonucu birimiyle yazar"];

  it("Selin'in 18. sorusu: sonuç ve bağıntı doğru, çözüm kısa → 10/10", () => {
    const tuned = adjustScoredAnswer({
      answer: "Alan = 3 · 4 = 12 cm²",
      expected: null,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 5,
    });
    expect(tuned.earned).toBe(10);
    expect(tuned.step).toBe(SHORT_SOLUTION_FULL_CREDIT);
  });

  it("kesirli sonuç ve sondaki gerekçe doğru okunur: 'x = 3/2 çünkü 2x = 3' → tam puan", () => {
    const tuned = adjustScoredAnswer({
      answer: "x = 3/2 çünkü 2x = 3",
      expected: 1.5,
      maxPoints: 10,
      modelAnswer: "2x = 3 ⇒ x = 3/2",
      criteria: ["Denklemi kurar", "Çözüm adımlarını yazar"],
      earned: 5,
    });
    expect(tuned.earned).toBe(10);
    expect(claimedResults("x = 3/2 çünkü 2x = 3")).toContain(1.5);
  });

  it("kesinti yalnız hatada: çıplak sayı 6'yı geçmez, hesap zinciri tutmazsa ve denetçi kavram hatası işaretlerse tam puan yok", () => {
    const bare = adjustScoredAnswer({ answer: "12", expected: 12, maxPoints: 10, modelAnswer: model, criteria, earned: 10 });
    expect(bare.earned).toBeLessThanOrEqual(6);

    const slip = adjustScoredAnswer({
      answer: "Alan = 3 · 4 = 11. Sonuç 12 cm²",
      expected: 12,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 5,
    });
    // Zincir 11'de bitiyor: sonuç yanlış sayılır, "kurulum doğru, son adım hatalı" bandında kalır; tam puan yok.
    expect(slip.earned).toBeLessThan(10);
    expect(slip.step).not.toBe(SHORT_SOLUTION_FULL_CREDIT);
    expect(arithmeticSlips("Alan = 3 · 4 = 11. Sonuç 12 cm²")).toHaveLength(1);
    expect(finalResults("Rth = 12 Ω ve Vth = 24 V. Pmax = 24^2 / (4*12) = 10 W", "Pmax = Vth^2 / (4 Rth) = 12 W")).toEqual([10]);

    const concept = adjustScoredAnswer({
      answer: "Alan = 3 · 4 = 12 cm²",
      expected: 12,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 5,
      conceptErrors: 1,
    });
    expect(concept.earned).toBe(5);

    const wrong = adjustScoredAnswer({
      answer: "Alan = 3 · 4 = 14 cm²",
      expected: 12,
      maxPoints: 10,
      modelAnswer: model,
      criteria,
      earned: 5,
    });
    expect(wrong.earned).toBeLessThan(10);
  });

  it("sonuç okuma: işlem içindeki sayı sonuç değildir, '=' kuyruğu ve son sayı sonuçtur", () => {
    expect(claimedResults("Pmax = 24^2 / (4*12) = 10 W")).toEqual([10, 10]);
    expect(claimedResults("x = 2x + 1 ise x = -1")).toEqual([-1, -1]);
    expect(claimedResults("Alan = 3 · 4 = 12 cm² (3 ve 4 kenarlar)")).toContain(12);
    expect(claimedResults("Hız 12,5 m/s bulunur")).toEqual([12.5]);
  });

  it("denetçi 'açıkça yanlış' bayrağını ayrı döndürür; eksik bırakılan ölçüt hata değildir", () => {
    const items = [{ question: "S", criteria: ["A", "B", "C"], modelAnswer: "", answer: "cevap" }];
    const parsed = parseOpenGrade(
      {
        items: [
          {
            index: 0,
            criteria: [
              { index: 0, met: false, wrong: true, quote: "" },
              { index: 1, met: true, wrong: false, quote: "cevap" },
              { index: 2, met: false, wrong: false, quote: "" },
            ],
          },
        ],
      },
      items,
    );
    expect(parsed.get(0)?.contradicted).toEqual(["A"]);
    expect(parsed.get(0)?.quotes).toEqual([{ criterion: "B", quote: "cevap" }]);
    expect(OPEN_GRADE_SYSTEM).toContain("wrong: true");
    expect(OPEN_GRADE_SYSTEM).toContain("kısa ya da özet olması kesinti sebebi değildir");
  });

  it("deneme notlandırması bayrağı taşır, tam puanda eksik ölçüt kalmaz; inceleme sayfası notu gösterir", () => {
    const gradeExam = read("src/lib/learning/mock-exam/grade-exam.ts");
    expect(gradeExam).toContain("conceptErrors: judgement.contradicted.length");
    expect(gradeExam).toContain("missed: full ? [] : graded.missed");
    expect(read("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx")).toContain("row.step");
    expect(read("src/components/parity/exam-question-review-client.tsx")).toContain("review.feedback.note");
  });
});

describe("Paket G-3 — çizimli 1 dakikalık video 25 kredi", () => {
  it("fiyat tablosu 25, video kabuğu çizimde bu kodu kullanır", () => {
    expect(CREDIT_PRICE_TABLE.SKETCH_VIDEO_GENERATE.credits).toBe(25);
    expect(CREDIT_PRICE_TABLE.VIDEO_GENERATE.credits).toBe(280);
    expect(read("src/lib/learning/video-run.ts")).toContain('sketch ? "SKETCH_VIDEO_GENERATE" : "VIDEO_GENERATE"');
  });
});

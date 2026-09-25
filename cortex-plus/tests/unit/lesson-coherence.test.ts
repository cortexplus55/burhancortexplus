import { describe, expect, it, vi } from "vitest";
import {
  coherenceFailures,
  conceptCheck,
  danglingOpener,
  honestReadingMinutes,
  parallelCards,
  publishCoherentLesson,
  retainAnchoredSentences,
  shouldReplacePlannedMinutes,
} from "@/lib/learning/lesson-coherence";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { repairLearnerLesson } from "@/lib/learning/lesson-repair";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const MOL_SOURCE = [
  "[s.2] pdf-12-sayfa.pdf: Mol, maddenin tanecik sayısını ölçen birimdir. Avogadro sayısı, 1 mol taneciğin içerdiği tanecik sayısıdır ve değeri 6,02×10²³ taneciktir. Bu sayı atom veya molekül sayısını ifade eder. Böylece tanecik sayısını hesaplamak kolaylaşır. Bir düzine 12 tanecikse, 1 mol 6,02×10²³ taneciktir.",
  "[s.3] pdf-12-sayfa.pdf: Mol kütlesi, bir maddenin 1 molünün gram cinsinden kütlesidir. M(H2SO4) = 98 g/mol. Kütle ile mol arasındaki bağıntı n = m / M şeklindedir. Tanecik sayısı N = n × N_A bağıntısıyla bulunur.",
  "[s.4] pdf-12-sayfa.pdf: Örnek 1: 88 g CO2 için M = 44 g/mol olduğundan n = m / M = 88 / 44 = 2 mol. Örnek 2: 0,25 mol H2SO4 için kütle m = n × M = 0,25 × 98 = 24,5 g olur.",
].join("\n");

function check(partial: Partial<SectionCheck> & Pick<SectionCheck, "prompt">): SectionCheck {
  return {
    type: "trueFalse",
    options: ["Doğru", "Yanlış"],
    answerIndex: 0,
    explanation: "Kaynak cümlesi terimi kendi anlamına bağlar ve dersin anlatımında durur.",
    ...partial,
  };
}

/** Canlı dersten: doğrulama cümle silince kalan artıklar. */
function brokenMolLesson(): LessonV2 {
  return {
    title: "Mol kavramı ve Avogadro sayısı",
    sections: [
      {
        heading: "Mol Kavramının Anlamı ve Önemi",
        body: "Bu sayı atom veya molekül sayısını ifade eder. Böylece tanecik sayısını hesaplamak kolaylaşır.",
        check: check({
          prompt: "Bu sayı atom veya molekül sayısını ifade eder Bu ifade doğru mudur?",
          explanation: "Bu sayı atom veya molekül sayısını ifade eder.",
        }),
      },
      {
        heading: "Avogadro Sayısı ve Mol Kütlesi İlişkisi",
        body: "Avogadro sayısı, 1 mol taneciğin içerdiği tanecik sayısıdır (6,02×10²³). Bir maddenin kütlesi ise o maddenin 1 molünün gram cinsinden ağırlığıdır ve buna mol kütlesi denir.",
        check: check({
          type: "mcq",
          prompt: "Mol kütlesi neyi gösterir?",
          options: [
            "Bir mol madde içindeki tanecik sayısını",
            "Bir mol madde kütlesini gram olarak",
            "Tanecik başına kütlesi",
            "Bir atomun kütlesini",
          ],
          answerIndex: 1,
          explanation: "Mol kütlesi, maddenin gram cinsinden kütlesi olup tanecik sayısını göstermez.",
        }),
      },
      {
        heading: "Mol Hesaplamaları ve Örnek Problemler",
        body: "Örnek 2: 0,25 mol H2SO4'ün kütlesi ve içindeki H atomu sayısını hesaplayalım. Bu örneklerle mol hesabı, kütle ve tanecik sayısını bulmak için temel işlemdir.",
        check: check({
          prompt: "Böylece tanecik sayısını hesaplamak kolaylaşır Bu ifade doğru mudur?",
          explanation: "Böylece tanecik sayısını hesaplamak kolaylaşır.",
        }),
      },
    ],
    infoCheck: {
      prompt: "Avogadro sayısını tanımlayınız.",
      answer: "1 mol taneciğin içerdiği tanecik sayısıdır, değeri 6,02×10²³ taneciktir.",
    },
    summary: [
      "Bir maddenin kütlesi ise o maddenin 1 molünün gram cinsinden ağırlığıdır ve buna mol kütlesi denir.",
      "Bu örneklerle mol hesabı, kütle ve tanecik sayısını bulmak için temel işlemdir.",
      "Bu sayı atom veya molekül sayısını ifade eder.",
      "Böylece tanecik sayısını hesaplamak kolaylaşır.",
      "Avogadro sayısı, 1 mol taneciğin içerdiği tanecik sayısıdır (6,02×10²³).",
    ],
  };
}

const PHYSICS_SOURCE = [
  "[s.2] mekanik.pdf: İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler.",
  "[s.3] mekanik.pdf: Örnek: m = 0,5 kg, R = 0,287 kJ/kg·K, T = 300 K ve V = 0,40 m³ verildiğinde P = mRT/V = 0,5 × 0,287 × 300 / 0,40 = 107,6 kPa olur.",
].join("\n");

function physicsLesson(): LessonV2 {
  return {
    title: "İdeal gaz basıncı",
    overview: "Basınç, kütle sıcaklık ve hacimle birlikte yazılır.",
    sections: [
      {
        heading: "İdeal gaz",
        body: "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler.",
        check: check({
          type: "mcq",
          prompt: "İdeal gaz basıncı hangi bağıntıyla yazılır?",
          options: ["P = mRT/V", "P = m/V", "P = RT", "P = V/T"],
          answerIndex: 0,
          explanation: "Basınç kütle, gaz sabiti, sıcaklık ve hacimle kurulur.",
        }),
      },
      {
        heading: "Yerine koyma",
        body: "Örnek: m = 0,5 kg ve V = 0,40 m³ için P = 0,5 × 0,287 × 300 / 0,40 = 107,6 kPa olur. Sonuç paskal mertebesinde okunur.",
        check: check({
          prompt: "0,5 kg ideal gaz için basınç, formüle yerine konarak bulunur.",
          explanation: "Yerine koyma, formüldeki her simgenin sayısal karşılığını yazar.",
        }),
      },
    ],
    example: {
      prompt: "0,5 kg gaz için basınç kaçtır?",
      solution: "P = mRT/V = 0,5 × 0,287 × 300 / 0,40 = 107,6 kPa.",
    },
    summary: [
      "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır.",
      "Yerine koymada kütle, sıcaklık ve hacim birlikte kullanılır.",
      "Sonuç paskal cinsinden okunur ve formülden ayrı durur.",
    ],
  };
}

const HISTORY_SOURCE = [
  "[s.1] hatt.pdf: Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
].join("\n");

function historyLesson(): LessonV2 {
  return {
    title: "Gülhane Hatt-ı Hümayunu",
    overview: "1839 tarihli belge, can ve mal güvenliğini yazılı bir vaade bağladı.",
    sections: [
      {
        heading: "Hatt-ı Hümayun",
        body: "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
        check: check({
          prompt: "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi.",
          explanation: "Belgenin ilan yılı kaynakta 1839 olarak durur.",
        }),
      },
    ],
    summary: [
      "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi.",
      "Belge can ve mal güvenliğini yazılı bir vaade bağladı.",
      "Vergi, kurul onayı olmadan toplanmayacaktı.",
    ],
  };
}

const LAW_SOURCE = [
  "[s.4] kabahat.pdf: Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır. Suç ise kanunun karşılığında hapis veya adli para cezası öngördüğü haksızlıktır. Aynı fiil hem kabahat hem suç sayılmaz; nitelendirme kanundaki yaptırıma bakılarak yapılır.",
].join("\n");

function lawLesson(): LessonV2 {
  return {
    title: "Kabahat ve suç ayrımı",
    overview: "Nitelendirme, fiilin kendisine değil kanundaki yaptırıma bakılarak yapılır.",
    sections: [
      {
        heading: "Yaptırıma göre nitelendirme",
        body: "Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır. Suç ise kanunun karşılığında hapis veya adli para cezası öngördüğü haksızlıktır. Aynı fiil hem kabahat hem suç sayılmaz.",
        check: check({
          type: "mcq",
          prompt: "Kabahat ile suç ayrımı neye bakılarak yapılır?",
          options: [
            "Kanundaki yaptırıma",
            "Fiilin işlendiği saate",
            "Failin yaşına",
            "Mağdurun rızasına",
          ],
          answerIndex: 0,
          explanation: "Kaynak, nitelendirmeyi kanundaki yaptırıma bağlar.",
        }),
      },
    ],
    commonMistake: {
      claim: "Aynı fiil hem kabahat hem suç sayılır.",
      correction: "Aynı fiil hem kabahat hem suç sayılmaz; nitelendirme kanundaki yaptırıma bakılarak yapılır.",
    },
    summary: [
      "Kabahat, idari yaptırım öngörülen haksızlıktır.",
      "Suç, hapis veya adli para cezası öngörülen haksızlıktır.",
      "Aynı fiil hem kabahat hem suç sayılmaz.",
    ],
  };
}

describe("lesson coherence gate", () => {
  it("drops an anaphor whose antecedent was deleted and keeps a defined 'bu sayıya'", () => {
    expect(danglingOpener("Bu sayı atom veya molekül sayısını ifade eder.")).toBe(true);
    expect(danglingOpener("Bu sayıya Avogadro sayısı denir.")).toBe(false);
    const kept = retainAnchoredSentences([
      "Bu sayı atom veya molekül sayısını ifade eder.",
      "Böylece tanecik sayısını hesaplamak kolaylaşır.",
    ]);
    expect(kept).toEqual([]);
    const anchored = retainAnchoredSentences([
      "Avogadro sayısı 6,02×10²³ taneciktir.",
      "Bu sayı atom veya molekül sayısını ifade eder.",
    ]);
    expect(anchored).toHaveLength(2);
  });

  it("catches the live mol lesson and rebuilds units from the source", async () => {
    const broken = brokenMolLesson();
    expect(coherenceFailures(broken).length).toBeGreaterThan(0);
    expect(broken.sections[0]?.body.startsWith("Bu sayı")).toBe(true);
    expect(broken.sections[2]?.body).toMatch(/Örnek 2/);
    expect(broken.sections[2]?.body).not.toMatch(/0,25\s*×\s*98/);

    const published = publishCoherentLesson(broken, MOL_SOURCE, "Mol kavramı ve Avogadro sayısı");
    const taught = [
      published.overview ?? "",
      ...published.sections.flatMap((section) => [
        section.body,
        section.note?.body ?? "",
        section.check?.prompt ?? "",
        section.check?.explanation ?? "",
      ]),
      ...(published.summary ?? []),
      published.example?.prompt ?? "",
      published.example?.solution ?? "",
    ].join("\n");
    expect(taught).not.toMatch(/Bu ifade doğru mudur/);
    expect(taught).not.toMatch(/Bir maddenin kütlesi ise/);
    for (const section of published.sections) {
      expect(section.body.startsWith("Bu sayı")).toBe(false);
      expect(section.body.startsWith("Böylece")).toBe(false);
      expect(coherenceFailures({ ...published, sections: [section], summary: published.summary })).not.toContain(
        "section:0:anaphor",
      );
      expect(section.body).toMatch(/Kaynak: pdf-12-sayfa\.pdf, s\.\d/);
      if (section.check) {
        expect(section.check.prompt).not.toMatch(/bu ifade doğru mudur/i);
        expect(section.check.explanation).not.toBe(section.check.prompt);
        if (section.check.whyWrong) {
          expect(section.check.misconception).toBeTruthy();
          expect(section.check.hint).toBeTruthy();
          expect(section.check.whyRight).toBeTruthy();
          expect(section.check.whyRight).not.toBe(section.check.whyWrong);
        }
      }
    }
    expect(published.overview).toMatch(/Mol/);
    expect(published.overview?.startsWith("Bu sayı")).toBe(false);
    expect(published.sections.some((section) => /düzine/.test(section.body))).toBe(true);
    expect(
      published.sections.some((section) => section.note && /mol|avogadro|bağıntı/i.test(section.note.title)),
    ).toBe(true);
    const mcq = published.sections.map((section) => section.check).find((check) => check?.type === "mcq");
    expect(mcq?.optionWhy?.length).toBe(mcq?.options.length);
    expect(published.example?.solution).toMatch(/Verilen:/);
    expect(published.example?.solution).toMatch(/Yerine koyma:/);
    expect(published.example?.solution).toMatch(/0,25\s*×\s*98\s*=\s*24,5/);
    expect(auditQuantitative(published.example?.solution ?? "", MOL_SOURCE).ok).toBe(true);
    expect(published.summary?.join(" ")).not.toMatch(/Bu sayı atom veya molekül sayısını ifade eder\./);
    expect(published.summary?.length).toBeGreaterThanOrEqual(3);
    expect(published.commonMistake?.correction).toMatch(/mol kütlesi/i);
    expect(published.commonMistake?.claim).toMatch(/kütlesi ise/i);
    expect(coherenceFailures(published)).toEqual([]);
    expect(honestReadingMinutes(published)).toBeGreaterThan(honestReadingMinutes(broken));

    const repaired = await repairLearnerLesson(
      broken,
      { source: MOL_SOURCE, topicLabel: "Mol kavramı ve Avogadro sayısı", targetMinutes: 27 },
      vi.fn(async () => null),
      vi.fn(async () => ({ bad: [] })),
    );
    expect(JSON.stringify(repaired.lesson)).not.toMatch(/Bu ifade doğru mudur/);
    expect(repaired.lesson.example?.solution ?? repaired.lesson.sections.map((section) => section.body).join(" ")).toMatch(
      /24,5/,
    );
    expect(shouldReplacePlannedMinutes(27, honestReadingMinutes(repaired.lesson))).toBe(true);
  });

  it("keeps a coherent physics lesson, including the worked substitution", () => {
    const lesson = physicsLesson();
    expect(coherenceFailures(lesson)).toEqual([]);
    expect(publishCoherentLesson(lesson, PHYSICS_SOURCE, lesson.title)).toBe(lesson);
    expect(lesson.example?.solution).toMatch(/0,5 × 0,287 × 300 \/ 0,40 = 107,6/);
    expect(auditQuantitative(lesson.example?.solution ?? "", PHYSICS_SOURCE).ok).toBe(true);
    const rebuilt = publishCoherentLesson(
      {
        title: "İdeal gaz basıncı",
        sections: [
          {
            heading: "Basınç",
            body: "Böylece basınç hesaplanır. Örnek 2: kütleyi yerine koyalım.",
          },
        ],
      },
      PHYSICS_SOURCE,
      "İdeal gaz basıncı",
    );
    expect(rebuilt.sections.some((section) => /P = mRT\/V/.test(section.body))).toBe(true);
    expect(rebuilt.sections.every((section) => !section.body.startsWith("Böylece"))).toBe(true);
    expect(rebuilt.example?.solution ?? "").toMatch(/107,6/);
    expect(coherenceFailures(rebuilt)).toEqual([]);
  });

  it("keeps a history case and a law distinction without inventing a calculation", () => {
    const history = historyLesson();
    const law = lawLesson();
    expect(coherenceFailures(history)).toEqual([]);
    expect(coherenceFailures(law)).toEqual([]);
    expect(publishCoherentLesson(history, HISTORY_SOURCE, history.title)).toBe(history);
    expect(publishCoherentLesson(law, LAW_SOURCE, law.title)).toBe(law);
    expect(history.sections[0]?.body).toMatch(/1839/);
    expect(history.example).toBeUndefined();
    expect(law.sections[0]?.body).toMatch(/idari yaptırım/);
    expect(law.commonMistake?.correction).toMatch(/sayılmaz/);
    const concept = conceptCheck("Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır.");
    expect(concept?.prompt).not.toMatch(/Bu ifade doğru mudur/);
    expect(concept?.explanation).not.toBe(concept?.prompt);
  });

  it("turns sibling source lines into full cards and does not invent a calculation", () => {
    const source = [
      "[s.1] hucre.pdf: Hücre, canlıların yapı ve işlev birimidir.",
      "Çekirdek: genetik bilgiyi taşır.",
      "Mitokondri: enerji dönüşümünü yürütür.",
      "Zar: hücreyi dış ortamdan ayırır.",
    ].join(" ");
    expect(parallelCards(source)?.map((card) => card.title)).toEqual(["Çekirdek", "Mitokondri", "Zar"]);
    const rebuilt = publishCoherentLesson(
      {
        title: "Hücre",
        sections: [{ heading: "Organeller", body: "Böylece enerji üretilir. Örnek 2: hesaplayalım." }],
      },
      source,
      "Hücre",
    );
    expect(rebuilt.sections.some((section) => section.cards?.some((card) => card.title === "Mitokondri"))).toBe(true);
    expect(
      rebuilt.sections.every((section) => !section.cards || section.cards.every((card) => card.body.length >= 8)),
    ).toBe(true);
    expect(rebuilt.example).toBeUndefined();
    expect(JSON.stringify(rebuilt)).toMatch(/Kaynak: hucre\.pdf, s\.1/);
    expect(coherenceFailures(rebuilt)).toEqual([]);
  });
});

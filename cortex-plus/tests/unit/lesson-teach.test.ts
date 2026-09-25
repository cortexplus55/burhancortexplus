import { describe, expect, it } from "vitest";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { reviewQuestionFor, retrySharesSubject } from "@/lib/learning/teacher-brain";
import {
  calculationCheckFromExample,
  checkEchoes,
  criticalTeachingFailures,
  filterSourceToSpans,
  finishTaughtLesson,
  fluencyIssues,
  sectionMissesTitle,
  selectTopicPages,
  teachingFailures,
  topicIsQuantitative,
} from "@/lib/learning/lesson-teach";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

const MOL = "Mol kütlesi ve kütle-mol hesapları";

const MOL_SOURCE = [
  "[s.3] pdf-12-sayfa.pdf: Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbon 12 g/mol, oksijen 16 g/mol olduğunda karbondioksit 12 + 2 × 16 = 44 g/mol olur.",
  "[s.4] pdf-12-sayfa.pdf: Kütle ile mol arasındaki bağıntı n = m / M şeklindedir. Örnek: 88 g karbondioksit için n = 88 / 44 = 2 mol. Tanecik sayısı N = n × N_A bağıntısıyla bulunur.",
  "[s.16] pdf-16-sayfa.pdf: Aynı bağıntı 88 g örnekte 2 mol karbondioksit verir. Mol kütlesi yerine atom kütlesini koymak sonucu şaşırtır.",
].join("\n");

const SLIDE = "[s.4] slayt-1-tepkimeler.pptx: Denkleştirmenin altın kuralları şunlardır. Her elementin atom sayısı iki tarafta eşit olmalıdır. Alt indisler asla değiştirilmez. Yalnızca katsayılar değiştirilir.";

const MIXED = `${MOL_SOURCE}\n${SLIDE}`;

const SPANS = [
  { fileName: "pdf-12-sayfa.pdf", pages: [3, 4] },
  { fileName: "pdf-16-sayfa.pdf", pages: [16] },
];

function check(partial: Partial<SectionCheck> & Pick<SectionCheck, "prompt" | "type" | "options" | "answerIndex">): SectionCheck {
  return {
    explanation: "Bölme, kütleyi mol kütlesine böler; çarpım başka bir büyüklüktür.",
    ...partial,
  };
}

function goodMolLesson(): LessonV2 {
  return {
    title: MOL,
    overview:
      "Atomlar tek tek tartılamayacak kadar küçüktür. Kimyacılar bu tanecikleri mol denen paketlerle sayar ve kütleyi o paket üzerinden okur.",
    sections: [
      {
        heading: "Mol kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbondioksitte karbon 12 g/mol ve iki oksijen 2 × 16 g/mol toplanır. Toplam 12 + 2 × 16 = 44 g/mol olur.",
        note: {
          title: "Mol kütlesi",
          body: "Mol kütlesi, bir mol taneciğin gram cinsinden kütlesidir.",
          tone: "info",
        },
        check: check({
          type: "mcq",
          prompt: "88 g karbondioksit kaç mol eder?",
          options: ["2 mol", "3872 mol", "0,5 mol", "88 mol"],
          answerIndex: 0,
          optionWhy: [
            "88 / 44 = 2 mol eder.",
            "Bölme yerine çarpma yapılmış.",
            "Bölme ters çevrilmiş.",
            "Verilen kütle sonuç sanılmış.",
          ],
        }),
      },
      {
        heading: "Kütle ve mol",
        body: "Bir maddenin mol sayısı, kütlenin mol kütlesine bölünmesiyle bulunur. Bağıntı n = m / M şeklindedir. 88 g karbondioksit, 44 g/mol ile 2 mol eder.",
        check: check({
          type: "trueFalse",
          prompt: "Mol sayısı, kütle ile mol kütlesinin çarpımıdır.",
          options: ["Yanlış", "Doğru"],
          answerIndex: 0,
          explanation: "Mol sayısı kütlenin mol kütlesine bölünmesidir; çarpım gram kare bölü mol gibi başka bir büyüklük verir.",
        }),
      },
    ],
    example: {
      prompt: "88 g karbondioksit kaç mol eder?",
      solution: [
        "Verilen: 88 g, 44 g/mol.",
        "İstenen: mol sayısı.",
        "Bağıntı: n = m / M.",
        "Yerine koyma: n = 88 / 44 = 2 mol.",
        "Sonuç: 2 mol.",
      ].join("\n"),
    },
    commonMistake: {
      claim: "Mol sayısı, kütle ile mol kütlesinin çarpımıdır.",
      correction: "Mol sayısı kütlenin mol kütlesine bölünmesidir.",
    },
    summary: [
      "Mol kütlesi bir molün gram kütlesidir; bu yüzden gramı mole çevirir.",
      "Uygulama n = m / M bağıntısında verileni yerine koymaktır.",
      "Çarpma, bölmenin yerini tutmaz ve sonucu başka birime götürür.",
    ],
  };
}

function liveBrokenLesson(): LessonV2 {
  return {
    title: MOL,
    overview: "Mol kavramı, kimyada maddenin miktarını tanımlamak için evrensel bir ölçüdür.",
    sections: [
      {
        heading: "Mol kütlesi ve kütle-mol hesapları",
        body: "Örneğin, CO2 molekülünün mol kütlesi C atomu (12 g/mol) ve 2 × O atomu (16 g/mol × toplamı olan 44 g/mol’dür.",
        check: check({
          type: "trueFalse",
          prompt: "Avogadro sayısı 1 mol madde içindeki atom veya molekül sayısını belirtir.",
          options: ["Yanlış", "Doğru"],
          answerIndex: 1,
          explanation: "Doğru, çünkü yargı terimi kendi anlamına bağlıyor.",
          whyRight: "Doğru, çünkü yargı terimi kendi anlamına bağlıyor.",
        }),
      },
      {
        heading: "Kütle mol tanecik",
        body: "Avogadro sayısı; bir molü geçen Kütlesi kullanarak tanecik sayısını, mol sayısını veya kütleye dönüşüm kolayca yapılır.",
        check: check({
          type: "trueFalse",
          prompt: "Mol kavramı, kimyada maddenin miktarını tanımlamak için evrensel bir ölçüdür.",
          options: ["Yanlış", "Doğru"],
          answerIndex: 1,
          explanation: "Doğru, çünkü yargı terimi kendi anlamına bağlıyor.",
          whyRight: "Doğru, çünkü yargı terimi kendi anlamına bağlıyor.",
        }),
      },
      {
        heading: "Çözümlü örnekler ile mol ve kütle hesapları",
        body: "Denkleştirmenin altın kuralları her elementin atom sayısını iki tarafta eşit ister. Alt indisler asla değiştirilmez ve yalnızca katsayılar değiştirilir. Bu kurallar tepkime denklemini kurar.",
      },
    ],
    summary: [
      "Mol kavramı, kimyada maddenin miktarını tanımlamak için evrensel bir ölçüdür.",
      "Avogadro sayısı; bir molü geçen Kütlesi kullanarak tanecik sayısını, mol sayısını veya kütleye dönüşüm kolayca yapılır.",
      "Denkleştirmenin altın kuralları her elementin atom sayısını iki tarafta eşit ister.",
    ],
  };
}

const PHYSICS_SOURCE = [
  "[s.3] mekanik.pdf: İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler.",
  "[s.4] mekanik.pdf: Örnek: m = 0,5 kg ve V = 0,40 m³ için P = 0,5 × 0,287 × 300 / 0,40 = 107,6 kPa olur.",
].join("\n");

function physicsLesson(): LessonV2 {
  return {
    title: "İdeal gaz basıncı",
    overview: "Basınç, kabın içindeki gazın kütlesi sıcaklığı ve hacmi birlikte değişince okunur. Tek bir sayı basıncı anlatmaz.",
    sections: [
      {
        heading: "İdeal gaz basıncı",
        body: "İdeal gaz basıncı P = mRT/V bağıntısıyla yazılır. Kütle, sıcaklık ve hacim birlikte basıncı belirler. Kaynak bu üç büyüklüğü aynı eşitlikte tutar.",
        note: { title: "İdeal gaz basıncı", body: "Basınç, kütle sıcaklık ve hacimle kurulur.", tone: "info" },
      },
    ],
    summary: [
      "Basınç P = mRT/V ile kurulur; çünkü üç büyüklük birlikte etki eder.",
      "Uygulama, kütle sıcaklık ve hacmi bağıntıda yerine koymaktır.",
      "Eksik bir büyüklük basıncı başka bir orana çevirir.",
    ],
  };
}

const HISTORY_SOURCE =
  "[s.1] hatt.pdf: Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.";

function historyLesson(): LessonV2 {
  return {
    title: "Gülhane Hatt-ı Hümayunu",
    overview: "1839 tarihli belge, can ve mal güvenliğini sözlü alışkanlıktan yazılı bir vaade taşıdı.",
    sections: [
      {
        heading: "Hatt-ı Hümayun",
        body: "Gülhane Hatt-ı Hümayunu 1839 yılında ilan edildi. Hatt-ı Hümayun, can ve mal güvenliğini yazılı bir vaade bağladı. Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
        note: { title: "Hatt-ı Hümayun", body: "Hatt-ı Hümayun, can ve mal güvenliğini yazılı vaade bağlar.", tone: "info" },
        check: check({
          type: "mcq",
          prompt: "Hatt-ı Hümayun vergiyi neye bağladı?",
          options: ["Kurul onayına", "Padişahın sözüne", "Yabancı devlete", "Ordu meclisine"],
          answerIndex: 0,
          explanation: "Belge, vergi toplanmadan önce kurul onayını şart koşar. Sözlü alışkanlık bu maddenin yerine geçmez.",
          optionWhy: [
            "Kaynak, vergiyi kurul onayına bağlar.",
            "Sözlü vaat, hattın yazılı şartı değildir.",
            "Metin yabancı devletten söz etmez.",
            "Onay kurulu ordu meclisi diye anılmaz.",
          ],
        }),
      },
    ],
    example: {
      prompt: "Vergi hangi şartla toplanacaktı?",
      solution: "Belge, vergi toplanmadan önce bir kurulun onayını şart koştu.",
    },
    summary: [
      "Hatt-ı Hümayun 1839’da can ve mal güvenliğini yazıya bağladı.",
      "Yazılı vaat, sözlü alışkanlığın yerini aldığı için denetlenebilir.",
      "Vergi ancak kurul onayından sonra toplanır.",
    ],
  };
}

const LAW_SOURCE =
  "[s.4] kabahat.pdf: Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır. Suç ise kanunun karşılığında hapis veya adli para cezası öngördüğü haksızlıktır. Aynı fiil hem kabahat hem suç sayılmaz.";

function lawLesson(): LessonV2 {
  return {
    title: "Kabahat ve suç ayrımı",
    overview: "Aynı fiil iki ada birden sığmaz. Nitelendirme, fiilin kendisine değil kanundaki yaptırıma bakar.",
    sections: [
      {
        heading: "Yaptırıma göre nitelendirme",
        body: "Kabahat, kanunun karşılığında idari yaptırım öngördüğü haksızlık olarak tanımlanır. Suç ise hapis veya adli para cezası öngörülen haksızlıktır. Aynı fiil hem kabahat hem suç sayılmaz.",
        note: { title: "Kabahat", body: "Kabahat, idari yaptırım öngörülen haksızlıktır.", tone: "info" },
        check: check({
          type: "mcq",
          prompt: "Kabahat ile suç ayrımı neye bakılarak yapılır?",
          options: ["Kanundaki yaptırıma", "Fiilin saatine", "Failin yaşına", "Mağdurun rızasına"],
          answerIndex: 0,
          explanation: "Kaynak nitelendirmeyi kanundaki yaptırıma bağlar. Saat, yaş ve rıza bu ayrımın ölçüsü değildir.",
          optionWhy: [
            "Yaptırım idari ise kabahat, hapis veya adli para ise suçtur.",
            "İşlenme saati nitelendirmeyi değiştirmez.",
            "Failin yaşı bu tanımdaki ölçü değildir.",
            "Mağdurun rızası yaptırım türünü seçmez.",
          ],
        }),
      },
    ],
    commonMistake: {
      claim: "Aynı fiil hem kabahat hem suç sayılır.",
      correction: "Aynı fiil hem kabahat hem suç sayılmaz.",
    },
    summary: [
      "Kabahat idari yaptırım öngörülen haksızlıktır.",
      "Suç, hapis veya adli para cezası öngörüldüğü için farklı bir yaptırımdır.",
      "Aynı fiil iki nitelendirmeye birden girmez.",
    ],
  };
}

const BIO_SOURCE = [
  "[s.1] hucre.pdf: Hücre, canlıların yapı ve işlev birimidir.",
  "Çekirdek: genetik bilgiyi taşır.",
  "Mitokondri: enerji dönüşümünü yürütür.",
  "Zar: hücreyi dış ortamdan ayırır.",
].join(" ");

function biologyLesson(): LessonV2 {
  return {
    title: "Hücre",
    overview: "Canlının görünür hali, tek bir hücrenin içinde bölünmüş işlere dayanır. Her organel kendi işini taşır.",
    sections: [
      {
        heading: "Hücre organelleri",
        body: "Hücre, canlıların yapı ve işlev birimidir. Çekirdek genetik bilgiyi taşır. Mitokondri enerji dönüşümünü yürütür. Zar hücreyi dış ortamdan ayırır.",
        note: { title: "Hücre", body: "Hücre, canlıların yapı ve işlev birimidir.", tone: "info" },
        cards: [
          { title: "Çekirdek", body: "Genetik bilgiyi taşır." },
          { title: "Mitokondri", body: "Enerji dönüşümünü yürütür." },
        ],
        check: check({
          type: "mcq",
          prompt: "Enerji dönüşümünü hangi organel yürütür?",
          options: ["Mitokondri", "Çekirdek", "Zar", "Koful"],
          answerIndex: 0,
          explanation: "Mitokondri enerji dönüşümünü yürütür. Çekirdek genetik bilgiyi taşır, zar ise hücreyi ayırır.",
          optionWhy: [
            "Mitokondri enerji dönüşümünü yürütür.",
            "Çekirdek genetik bilgiyi taşır.",
            "Zar hücreyi dış ortamdan ayırır.",
            "Koful bu kaynağın organel listesinde yoktur.",
          ],
        }),
      },
    ],
    summary: [
      "Hücre canlının yapı ve işlev birimidir.",
      "Organeller işi böldüğü için çekirdek ile mitokondri karışmaz.",
      "Zar, hücrenin dış ortamla sınırını kurar.",
    ],
  };
}

describe("topic source spans", () => {
  it("keeps the molar-mass files and drops the balancing slide", () => {
    const pages = [
      { fileName: "pdf-12-sayfa.pdf", pageNumber: 4, text: "n = m / M" },
      { fileName: "slayt-1-tepkimeler.pptx", pageNumber: 4, text: "katsayılar" },
      { fileName: "pdf-16-sayfa.pdf", pageNumber: 16, text: "88 g" },
    ];
    expect(selectTopicPages(pages, SPANS).map((page) => page.fileName)).toEqual([
      "pdf-12-sayfa.pdf",
      "pdf-16-sayfa.pdf",
    ]);
    const scoped = filterSourceToSpans(MIXED, SPANS);
    expect(scoped).toMatch(/pdf-12-sayfa\.pdf/);
    expect(scoped).toMatch(/pdf-16-sayfa\.pdf/);
    expect(scoped).not.toMatch(/tepkimeler/);
    expect(scoped).not.toMatch(/Denkleştirme/);
  });
});

describe("fluency, title match, and echo checks", () => {
  it("flags the live mol sentences and the off-topic worked-example screen", () => {
    expect(fluencyIssues(liveBrokenLesson().sections[0]?.body ?? "").length).toBeGreaterThan(0);
    expect(fluencyIssues(liveBrokenLesson().sections[1]?.body ?? "")).toContain("mid_capital");
    expect(
      sectionMissesTitle(
        "Çözümlü örnekler ile mol ve kütle hesapları",
        liveBrokenLesson().sections[2]?.body ?? "",
        MOL,
      ),
    ).toBe(true);
    const echoed = liveBrokenLesson().sections[1]?.check;
    expect(echoed && checkEchoes(echoed, liveBrokenLesson(), liveBrokenLesson().sections[1]?.body ?? "")).toBe(
      true,
    );
    const failures = teachingFailures(liveBrokenLesson(), MOL_SOURCE, MOL);
    const critical = criticalTeachingFailures(failures).map((failure) => failure.problem);
    expect(critical).toContain("fluency");
    expect(critical).toContain("off_title");
    expect(critical).toContain("echo_check");
    expect(critical).toContain("missing_example");
  });

  it("accepts a fluent sentence and a matching section", () => {
    expect(
      fluencyIssues("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir."),
    ).toEqual([]);
    expect(
      sectionMissesTitle(
        "Mol kütlesi",
        "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.",
        MOL,
      ),
    ).toBe(false);
  });
});

describe("worked example and calculation check", () => {
  it("verifies the source example and builds mistake distractors", () => {
    const solution = goodMolLesson().example?.solution ?? "";
    expect(solution).toMatch(/Verilen:/);
    expect(solution).toMatch(/İstenen:/);
    expect(solution).toMatch(/Bağıntı:/);
    expect(solution).toMatch(/Yerine koyma:/);
    expect(solution).toMatch(/Sonuç:/);
    expect(auditQuantitative(solution, MOL_SOURCE).ok).toBe(true);
    const mcq = calculationCheckFromExample(goodMolLesson().example!);
    expect(mcq?.options[mcq.answerIndex]).toMatch(/2/);
    expect(mcq?.optionWhy?.some((line) => /çarpma/i.test(line))).toBe(true);
    expect(mcq?.optionWhy?.some((line) => /ters/i.test(line))).toBe(true);
    expect(mcq?.optionWhy?.length).toBe(mcq?.options.length);
  });
});

describe("subject lessons", () => {
  it("publishes a chemistry lesson with a verified example and no echo", async () => {
    const finished = await finishTaughtLesson(goodMolLesson(), { source: MOL_SOURCE, topicLabel: MOL });
    expect(criticalTeachingFailures(finished.failures)).toEqual([]);
    expect(finished.lesson.example?.solution).toMatch(/88 \/ 44 = 2/);
    expect(auditQuantitative(finished.lesson.example?.solution ?? "", MOL_SOURCE).ok).toBe(true);
    expect(finished.lesson.sections.some((section) => section.check?.type === "mcq" && /\d/.test(section.check.prompt))).toBe(
      true,
    );
    const blob = JSON.stringify(finished.lesson);
    expect(blob).not.toMatch(/kendi anlamına bağlıyor/);
    expect(blob).not.toMatch(/tepkimeler|denkleştirme/i);
    expect(blob).toMatch(/Kaynak: pdf-12-sayfa\.pdf, s\./);
    expect(topicIsQuantitative(MOL_SOURCE)).toBe(true);
  });

  it("fills a physics example from the source chain when the draft omits it", async () => {
    const finished = await finishTaughtLesson(physicsLesson(), {
      source: PHYSICS_SOURCE,
      topicLabel: "İdeal gaz basıncı",
    });
    expect(topicIsQuantitative(PHYSICS_SOURCE)).toBe(true);
    expect(finished.lesson.example?.solution).toMatch(/Verilen:/);
    expect(finished.lesson.example?.solution).toMatch(/107,6/);
    expect(auditQuantitative(finished.lesson.example?.solution ?? "", PHYSICS_SOURCE).ok).toBe(true);
    expect(criticalTeachingFailures(finished.failures).map((failure) => failure.problem)).not.toContain(
      "missing_example",
    );
  });

  it("keeps history, law, and biology narrative without an invented calculation", async () => {
    expect(topicIsQuantitative(HISTORY_SOURCE)).toBe(false);
    expect(topicIsQuantitative(LAW_SOURCE)).toBe(false);
    expect(topicIsQuantitative(BIO_SOURCE)).toBe(false);
    const history = await finishTaughtLesson(historyLesson(), {
      source: HISTORY_SOURCE,
      topicLabel: "Gülhane Hatt-ı Hümayunu",
    });
    const law = await finishTaughtLesson(lawLesson(), {
      source: LAW_SOURCE,
      topicLabel: "Kabahat ve suç ayrımı",
    });
    const biology = await finishTaughtLesson(biologyLesson(), {
      source: BIO_SOURCE,
      topicLabel: "Hücre",
    });
    for (const finished of [history, law, biology]) {
      expect(criticalTeachingFailures(finished.failures)).toEqual([]);
      expect(finished.lesson.example?.solution ?? "").not.toMatch(/\d+\s*[×x*/]\s*\d+\s*=/);
      expect(JSON.stringify(finished.lesson)).not.toMatch(/kendi anlamına bağlıyor/);
    }
    expect(history.lesson.sections[0]?.body).toMatch(/1839/);
    expect(law.lesson.commonMistake?.correction).toMatch(/sayılmaz/);
    expect(biology.lesson.sections[0]?.body).toMatch(/Mitokondri/);
    expect(biology.lesson.sections[0]?.cards?.some((card) => card.title === "Mitokondri")).toBe(true);
  });
});

describe("missed-question retry", () => {
  const source = [
    "Avogadro sayısı, 1 mol madde içindeki tanecik sayısıdır.",
    "Mol, belirli sayıda tanecik içeren madde miktarıdır.",
  ].join(" ");
  const original = "Avogadro sayısı 1 mol madde içindeki atom veya molekül sayısını belirtir.";

  it("reasks Avogadro instead of the unrelated mol definition", () => {
    expect(retrySharesSubject(original, "Mol, belirli sayıda tanecik içeren madde miktarıdır.")).toBe(false);
    const retry = reviewQuestionFor(
      {
        type: "trueFalse",
        prompt: original,
        options: ["Yanlış", "Doğru"],
        answerIndex: 1,
        explanation: "Avogadro sayısı, 1 mol maddedeki tanecik sayısını tanımlar.",
      },
      "tr",
      source,
    );
    expect(retrySharesSubject(original, retry.prompt)).toBe(true);
    expect(retry.prompt.toLocaleLowerCase("tr")).toMatch(/avogadro/);
    expect(retry.prompt).not.toMatch(/^Mol, belirli/);
    expect(retry.explanation.toLocaleLowerCase("tr")).toMatch(/avogadro/);
  });
});

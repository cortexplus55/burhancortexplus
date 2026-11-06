import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import {
  capSameTable,
  coreFirst,
  MAX_SAME_TABLE,
  questionTableOf,
  sourceTables,
  testsCore,
  topicCoreRule,
} from "@/lib/learning/topic-test-shape";
import {
  appendWithoutConflicts,
  quizSetIssues,
  quizSystem,
  quizUserPrompt,
  quizVerifySystem,
  quizVerifyUserPrompt,
  TOPIC_TEST_RULE,
  type TeacherQuizInput,
} from "@/lib/learning/teacher-quiz";
import { lessonQuizContext } from "@/lib/learning/lesson-quiz-context";
import { askedQuantityKey, sameAskedQuantity } from "@/lib/learning/asked-quantity";
import { semanticDuplicate } from "@/lib/learning/deliverable";
import { publishReady } from "@/lib/learning/exam-assembly";
import { SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/**
 * Paket 2 (6 Kasım 2026): konu testinde aynı tablodan en çok 2 soru (kod kapısı), ilk soru çekirdek kural, her soru
 * ayrı alt başlık; yazılı denemede aynı durumda aynı büyüklük tek kez; kaynağın verdiği sabit değeri harf yerine.
 * Örnekler tarih, ekonomi, biyoloji ve coğrafyadan; üretim kodunda ders sözcüğü yok.
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const TABLE_PAGE = {
  page: 3,
  text: [
    "## Kurtuluş Savaşı Antlaşmaları",
    "| Antlaşma | Yıl | Taraf |",
    "| --- | --- | --- |",
    "| Gümrü Antlaşması | 1920 | Ermenistan |",
    "| Moskova Antlaşması | 1921 | Sovyet Rusya |",
    "| Ankara Antlaşması | 1921 | Fransa |",
    "| Kars Antlaşması | 1921 | Kafkas cumhuriyetleri |",
    "",
    "## Mudanya Ateşkesi",
    "Mudanya Ateşkesi ile Doğu Trakya savaş yapılmadan kazanılmıştır.",
  ].join("\n"),
};

function q(text: string, answer: string, extra: Partial<QuizQuestion> = {}): QuizQuestion {
  return { text, options: [answer, "Diğer bir", "Başka bir", "Farklı bir", "Yanlış bir"], correct: [answer], multi: false, ...extra };
}

const fromTable = [
  q("Gümrü Antlaşması hangi devletle imzalanmıştır?", "Ermenistan"),
  q("Moskova Antlaşması hangi devletle imzalanmıştır?", "Sovyet Rusya"),
  q("Ankara Antlaşması hangi devletle imzalanmıştır?", "Fransa"),
  q("Kars Antlaşması hangi taraflarla imzalanmıştır?", "Kafkas cumhuriyetleri"),
];
const offTable = q("Doğu Trakya savaş yapılmadan hangi ateşkesle kazanılmıştır?", "Mudanya Ateşkesi");

describe("konu testi: aynı tablodan en çok iki soru (kod kapısı)", () => {
  it("tablo satırından gelen soru tanınır, tablo dışı soru tanınmaz", () => {
    expect(sourceTables([TABLE_PAGE])).toHaveLength(1);
    const tableOf = questionTableOf([TABLE_PAGE])!;
    expect(fromTable.map(tableOf)).toEqual([0, 0, 0, 0]);
    expect(tableOf(offTable)).toBeNull();
  });

  it("capSameTable üçüncü tablo sorusunu çıkarır; gösterilmiş soru yerinde kalır", () => {
    const tableOf = questionTableOf([TABLE_PAGE]);
    const capped = capSameTable([...fromTable, offTable], tableOf);
    expect(capped.map((x) => x.correct[0])).toEqual(["Ermenistan", "Sovyet Rusya", "Mudanya Ateşkesi"]);
    expect(MAX_SAME_TABLE).toBe(2);
    // Üç soru gösterildiyse (keep=3) üçü de kalır, dördüncü çıkar.
    expect(capSameTable(fromTable, tableOf, 3)).toHaveLength(3);
    // Tablo yoksa kısıt yok.
    expect(capSameTable(fromTable, null)).toHaveLength(4);
  });

  it("appendWithoutConflicts ikinci geçişte ve kurtarmada da tablo sınırını tutar", () => {
    const tableOf = questionTableOf([TABLE_PAGE]);
    const out = appendWithoutConflicts(fromTable.slice(0, 2), [fromTable[2]!, offTable], { tableOf });
    expect(out.map((x) => x.correct[0])).toEqual(["Ermenistan", "Sovyet Rusya", "Mudanya Ateşkesi"]);
  });

  it("konu testi motoru kapıyı her birleştirmede kullanır (kaynak bekçisi)", () => {
    const run = read("src/lib/learning/teacher-quiz-run.ts");
    expect(run).toMatch(/capSameTable\(/);
    expect(run).toMatch(/appendWithoutConflicts\(questions, fresh, \{ tableOf \}\)/);
    expect(run).toMatch(/appendWithoutConflicts\(\[\], sharded\.questions, \{ tableOf: topicTableOf\(input\) \}\)/);
    expect(run.match(/salvageRejected\(rejected, questions, \{[^}]*tableOf[^}]*\}\)/g)?.length).toBe(2);
    expect(TOPIC_TEST_RULE).toMatch(/aynı tablodan en çok 2 soru \(üçüncüsü testten çıkarılır\)/);
  });
});

const LESSON: LessonV2 = {
  title: "Arz ve talep",
  sections: [
    {
      heading: "Talep",
      body: "**Talep** fiyat düştükçe artar.",
      formula: { title: "Toplam gelir", expression: "TR = P × Q" },
    },
  ],
  summary: [],
} as unknown as LessonV2;

describe("konu testi: ilk soru çekirdek kural", () => {
  it("çekirdek kural sırası: ders formülü → konu adındaki yasa → kaynak formül satırı → ilk madde", () => {
    const lesson = lessonQuizContext([LESSON]);
    expect(lesson?.formulas).toEqual(["Toplam gelir: TR = P × Q"]);
    expect(topicCoreRule({ topicLabel: "Talep Yasası", pages: [], lesson })).toBe("Toplam gelir: TR = P × Q");
    expect(topicCoreRule({ topicLabel: "Talep Yasası", pages: [] })).toBe("Talep Yasası");
    expect(topicCoreRule({ topicLabel: "Faiz", pages: [{ text: "Basit faiz:\nFaiz = Anapara × Oran × Süre\nÖrnek …" }] })).toBe(
      "Faiz = Anapara × Oran × Süre",
    );
    expect(topicCoreRule({ topicLabel: "Hücre", pages: [{ text: "Hücre zarı seçici geçirgendir." }], points: ["Zar seçici geçirgendir (derste işlendi)"] })).toBe(
      "Zar seçici geçirgendir",
    );
  });

  it("çekirdeği yoklayan soru başa alınır; gösterilmiş test sırası değişmez", () => {
    const core = "Faiz = Anapara × Oran × Süre";
    const table = q("Gümrü Antlaşması hangi devletle imzalanmıştır?", "Ermenistan");
    const coreQ = q("Anapara 1000, yıllık oran 0,2 ise 2 yılda basit faiz kaçtır?", "400", {
      explanation: "Faiz = Anapara × Oran × Süre = 1000 × 0,2 × 2 = 400.",
    });
    expect(testsCore(coreQ, core)).toBe(true);
    expect(testsCore(table, core)).toBe(false);
    expect(coreFirst([table, coreQ], core).map((x) => x.correct[0])).toEqual(["400", "Ermenistan"]);
    expect(coreFirst([table, coreQ], core, 1).map((x) => x.correct[0])).toEqual(["Ermenistan", "400"]);
  });

  it("yazar ve denetçi aynı ÇEKİRDEK ve ALT BAŞLIK bloğunu görür", () => {
    const input: TeacherQuizInput = {
      topicLabel: "Kurtuluş Savaşı",
      prepTitle: "KPSS Tarih",
      pages: [TABLE_PAGE],
      count: 5,
      scope: "topic_test",
      examPoints: ["Antlaşmaların tarafları", "Mudanya Ateşkesi'nin sonucu"],
    };
    expect(quizSystem("document", "practice", false, "topic_test")).toMatch(/ÇEKİRDEK: Testin 1\. sorusu/);
    expect(quizVerifySystem("document", "topic_test")).toContain(TOPIC_TEST_RULE);
    const writer = quizUserPrompt(input);
    const verifier = quizVerifyUserPrompt([], input);
    for (const prompt of [writer, verifier]) {
      expect(prompt).toMatch(/ÇEKİRDEK KURAL \(testin 1\. sorusu bunu yoklar\): Antlaşmaların tarafları/);
      expect(prompt).toMatch(/ALT BAŞLIKLAR .*Kurtuluş Savaşı Antlaşmaları.*Mudanya Ateşkesi/);
    }
    // Konu testi değilse blok yok.
    expect(quizUserPrompt({ ...input, scope: undefined })).not.toMatch(/ÇEKİRDEK KURAL/);
  });

  it("parçalı testte ilk parçanın hedefi çekirdek kural", async () => {
    const { shardTargets } = await import("@/lib/learning/teacher-quiz-run");
    const targets = shardTargets(
      { scope: "topic_test", examPoints: ["Antlaşmaların tarafları", "Mudanya Ateşkesi'nin sonucu", "Lozan'ın maddeleri"], lesson: lessonQuizContext([LESSON]), pages: [TABLE_PAGE], topicLabel: "Kurtuluş Savaşı" },
      3,
    );
    expect(targets[0]).toBe("Toplam gelir: TR = P × Q");
    expect(new Set(targets).size).toBe(3);
  });
});

describe("konu testi: her soru ayrı alt başlık", () => {
  it("sorulmamış alt başlık varken aynı alt başlığı ikinci kez soran soru J", () => {
    const headings = ["Hücre zarı", "Mitokondri", "Ribozom"];
    const issues = quizSetIssues(
      [
        q("Hücre zarının seçici geçirgenliği neyi sağlar?", "Madde geçişini düzenler"),
        q("Hücre zarında taşıma hangi yapıyla olur?", "Taşıyıcı proteinler"),
      ],
      { pointsAvailable: 0, subheadings: headings },
    );
    const j = issues.filter((issue) => issue.code === "J");
    expect(j).toHaveLength(1);
    expect(j[0]!.index).toBe(1);
    expect(j[0]!.problem).toMatch(/Mitokondri/);
  });
});

describe("yazılı deneme: aynı durumda aynı büyüklük tek kez", () => {
  const scenarioA = {
    topicLabel: "Milli gelir",
    type: "mcq",
    text: "Bir ülkede nominal GSYH 500 milyar, fiyat endeksi 125 ise reel GSYH kaçtır?",
    options: ["400 milyar", "625 milyar", "375 milyar", "500 milyar", "100 milyar"],
    correctAnswers: ["400 milyar"],
  };
  const scenarioAOpen = {
    topicLabel: "Büyüme",
    type: "open",
    text: "Nominal GSYH 500 milyar ve fiyat endeksi 125 olan ülkenin reel GSYH değerini hesaplayıp işlem adımını yaz.",
    modelAnswer: "Reel GSYH = Nominal / Endeks × 100 = 500 / 125 × 100 = 400 milyar.",
  };
  const sameScenarioOther = {
    topicLabel: "Milli gelir",
    type: "mcq",
    text: "Nominal GSYH 500 milyar ve fiyat endeksi 125 iken GSYH deflatörüne göre fiyatlar yüzde kaç artmıştır?",
    options: ["%25", "%20", "%125", "%50", "%5"],
    correctAnswers: ["%25"],
  };

  it("sorulan büyüklüğün adı soru sözcüğünden önce okunur", () => {
    expect(askedQuantityKey(scenarioA.text)).toBe("reel gsyh");
    expect(askedQuantityKey(scenarioAOpen.text)).toBe("reel gsyh");
    expect(askedQuantityKey("Hücre zarı nedir")).toBe("hücr zarı");
    expect(askedQuantityKey("Bir paragraf; soru yok.")).toBeNull();
  });

  it("konular arası da aynı ara büyüklük kopya sayılır; aynı durumun başka büyüklüğü sayılmaz", () => {
    expect(sameAskedQuantity(scenarioA, scenarioAOpen)).toBe(true);
    expect(semanticDuplicate(scenarioA, scenarioAOpen)).toBe(true);
    expect(sameAskedQuantity(scenarioA, sameScenarioOther)).toBe(false);
    // Başka durum (başka sayılar), aynı büyüklük: ayrı soru.
    const other = { ...scenarioA, text: "Nominal GSYH 800 milyar, fiyat endeksi 160 ise reel GSYH kaçtır?", correctAnswers: ["500 milyar"] };
    expect(sameAskedQuantity(scenarioA, other)).toBe(false);
  });

  it("kâğıt kopyayı almaz, yerine aynı konunun başka sorusunu koyar", () => {
    const slots = [
      { topicLabel: "Milli gelir", type: "mcq" },
      { topicLabel: "Büyüme", type: "open" },
    ];
    const growthOther = {
      topicLabel: "Büyüme",
      type: "open",
      text: "Ekonomik büyümeyi kalkınmadan ayıran ölçütü açıklayınız.",
      modelAnswer: "Büyüme üretim artışıdır; kalkınma refahı da kapsar.",
    };
    const paper = publishReady(slots, [scenarioA, scenarioAOpen, growthOther], (item) => item);
    expect(paper.ok).toBe(true);
    expect(paper.items.map((item) => item.text)).toEqual([scenarioA.text, growthOther.text]);
  });

  it("deneme kâğıdı okuyucusu örnek cevabı da verir (kaynak bekçisi)", () => {
    expect(read("src/lib/learning/mock-exam/create.ts")).toMatch(/modelAnswer: question\.modelAnswer,/);
  });
});

describe("kaynağın verdiği sabit değer harfin yerine", () => {
  it("SOURCE_NUMBER_PRIORITY genel ek taşır, rakam ve ders sözcüğü yok; yazar ve denetçi aynı metni okur", () => {
    expect(SOURCE_NUMBER_PRIORITY).toMatch(/sabit ya da parametre için sayısal değer belirlemişse/);
    expect(SOURCE_NUMBER_PRIORITY).toMatch(/cinsinden' bırakma/);
    expect(SOURCE_NUMBER_PRIORITY).not.toMatch(/\d/);
    expect(quizSystem("document")).toContain(SOURCE_NUMBER_PRIORITY);
    expect(quizVerifySystem("document")).toContain(SOURCE_NUMBER_PRIORITY);
    expect(quizSystem("document", "practice", false, undefined, true)).toContain(SOURCE_NUMBER_PRIORITY);
  });
});

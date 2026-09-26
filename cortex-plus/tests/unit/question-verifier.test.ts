import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyChoiceQuestion, verifyFlashcard, verifyOralPrompt } from "@/lib/learning/question-verifier";
import { settleExplanation } from "@/lib/learning/question-verifier";

const subjects = {
  chemistry: "2Al + 3Cl₂ → 2AlCl₃. Sınırlayıcı bileşen, mol sayısı katsayıya bölünerek bulunur.",
  physics: "Newton'un ikinci yasası F = m · a. Kuvvet newton, kütle kilogram, ivme m/s².",
  history: "Magna Carta 1215'te imzalandı. İnsan hakları bildirgesi 1789'da yayımlandı.",
  law: "Borçlar hukukunda irade sakatlığı hata, hile ve ikrahtır.",
  biology: "Mitoz, bir hücrenin genetik olarak aynı iki yavru hücre oluşturmasıdır.",
};

describe("question verifier is subject-agnostic", () => {
  it("repairs an exactly stoichiometric limiting question", () => {
    const checked = verifyChoiceQuestion({
      text: "2 mol Al ve 3 mol Cl₂ kullanılarak AlCl₃ oluşturulmaktadır. Tepkime 2Al + 3Cl₂ → 2AlCl₃. Sınırlayıcı bileşen hangisidir?",
      options: ["Al", "Cl₂", "AlCl₃", "H₂"],
      correct: ["Cl₂"],
      multi: false,
      explanation: "2 mol Al için 3 mol Cl₂ gereklidir, ancak sadece 3 mol Cl₂ mevcuttur; bu nedenle Cl₂ sınırlayıcı. Al fazla kalır.",
      misconceptionTag: "oran",
    });
    expect(checked.status).not.toBe("drop");
    expect(checked.question.correct[0]).toMatch(/tükenir/);
    expect(checked.question.options.join(" ")).not.toMatch(/H₂|AlCl₃/);
    expect(checked.question.optionWhy?.length).toBe(checked.question.options.length);
    expect(checked.question.explanation).toMatch(/eşit|tükenir/);
  });

  it("repairs a product amount that does not match the equation", () => {
    const text = settleExplanation(
      "CH₄ + 2O₂ → CO₂ + 2H₂O. 1 mol O₂ vardır. Hesaplanan 1 mol CO₂ ve H₂O elde edilir.",
    );
    expect(text).toMatch(/0,5 mol CO₂/);
    expect(text).toMatch(/1 mol H₂O/);
    expect(text).not.toMatch(/1 mol CO₂/);
  });

  it("balances an equation that is not the thing being asked", () => {
    const checked = verifyChoiceQuestion({
      text: "Aşağıdaki tepkimelerden hangisi hem yanma hem sentez tepkimesidir?",
      options: ["2H₂ + O₂ → 2H₂O", "CaCO₃ → CaO + CO₂", "N₂ + 3H₂ → 2NH₃", "Zn + HCl → ZnCl₂ + H₂"],
      correct: ["2H₂ + O₂ → 2H₂O"],
      multi: false,
      explanation: "Hidrojenin oksijenle birleşmesi hem yanma hem sentezdir.",
    });
    expect(checked.status).toBe("keep");
    expect(checked.question.options.join(" | ")).toContain("Zn + 2HCl → ZnCl₂ + H₂");
    expect(checked.question.options.join(" | ")).not.toContain("Zn + HCl →");
  });

  it("polishes broken wording in any subject", () => {
    const checked = verifyChoiceQuestion(
      {
        text: "Tepkime ful olarak yürür. Ürün yarısı kadar, yani katsayıya uyar.",
        options: ["Tam yürür", "Durur"],
        correct: ["Tam yürür"],
        multi: false,
        explanation: "İfade ful olarak kullanılmaz.",
      },
      subjects.chemistry,
    );
    expect(checked.question.text).toContain("tam olarak");
    expect(checked.question.text).not.toContain("ful olarak");
    expect(checked.question.text).not.toContain("yarısı kadar");
  });

  it("drops an oral prompt whose amounts are exactly stoichiometric", () => {
    expect(
      verifyOralPrompt(
        "0,25 mol H₂SO₄ ve 0,5 mol NaOH tepkimesinde (H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O) hangisi sınırlayıcıdır?",
        ["NaOH sınırlayıcıdır"],
        subjects.chemistry,
      ),
    ).toBeNull();
  });

  it("keeps a physics key that matches F = ma", () => {
    const checked = verifyChoiceQuestion(
      {
        text: "2 kg kütle 3 m/s² ivmeyle hareket ederse kuvvet kaç newton olur? F = m · a.",
        options: ["5 N", "6 N", "1,5 N"],
        correct: ["5 N"],
        multi: false,
        explanation: "F = 2 × 3 = 6 N.",
      },
      subjects.physics,
    );
    expect(checked.status).toBe("keep");
    expect(checked.question.correct).toEqual(["6 N"]);
  });

  it("overrides a history key when only one option is in the source", () => {
    const checked = verifyChoiceQuestion(
      {
        text: "Magna Carta hangi yılda imzalandı?",
        options: ["1066", "1215", "1789"],
        correct: ["1789"],
        multi: false,
        explanation: "Belge orta çağda imzalandı.",
      },
      subjects.history,
    );
    expect(checked.question.correct).toEqual(["1215"]);
  });

  it("keeps a law answer that the source names", () => {
    const checked = verifyChoiceQuestion(
      {
        text: "İrade sakatlığı halleri hangileridir?",
        options: ["Hata, hile ve ikrah", "Zamanaşımı", "Sebepsiz zenginleşme"],
        correct: ["Zamanaşımı"],
        multi: false,
        explanation: "Üç hal birden gerekir.",
      },
      subjects.law,
    );
    expect(checked.status).not.toBe("drop");
    expect(checked.question.correct[0]).toMatch(/hile/);
  });

  it("keeps a biology fact the source states and fills a reason per option", () => {
    const checked = verifyChoiceQuestion(
      {
        text: "Mitoz sonunda oluşan yavru hücreler nasıldır?",
        options: ["Genetik olarak aynı iki hücre", "Mayoz bölünür", "Krossing over olur"],
        correct: ["Mayoz bölünür"],
        multi: false,
        explanation: "Mitoz genetik kopya üretir.",
      },
      subjects.biology,
    );
    expect(checked.question.correct[0]).toMatch(/aynı/);
    expect(checked.question.optionWhy).toHaveLength(3);
    expect(checked.question.misconceptionTag).toBeTruthy();
  });

  it("repairs a flashcard whose arithmetic is wrong and keeps a biology fact", () => {
    const repaired = verifyFlashcard("İki kere iki", "2 + 2 = 5", subjects.physics);
    expect(repaired?.back).toContain("2 + 2 = 4");
    expect(repaired?.back).not.toContain("= 5");
    const kept = verifyFlashcard("Mitoz nedir?", "Mitoz aynı iki yavru hücre oluşturur.", subjects.biology);
    expect(kept?.back).toMatch(/aynı/);
  });

  it("drops a hollow announced example and a broken sentence, and keeps a short fact", () => {
    const hollow =
      "Uygulamalı Örnek: H₂SO₄ Hesaplaması. 0,25 mol H₂SO₄'nin gram cinsinden kütlesini bulmak için m = n × M formülünü kullanırız.";
    expect(settleExplanation(hollow)).not.toMatch(/Örnek yarım|formülünü kullanırız/);
    expect(
      verifyOralPrompt(hollow, ["0,25 mol için kütle hesaplanır."], subjects.chemistry),
    ).toBeNull();
    const kept = verifyOralPrompt(
      "Sınırlayıcı bileşen nasıl bulunur?",
      ["mol sayısı stokiyometrik katsayıya bölünür"],
      subjects.chemistry,
    );
    expect(kept?.expectedPoints.join(" ")).toMatch(/katsayıya/);
    expect(verifyFlashcard("Kütle", hollow, subjects.chemistry)).toBeNull();
    expect(
      verifyFlashcard(
        "Bağlantı",
        "Mol hesabında kullanılan kütle ve verilen miktar arasındaki bağlantı yalnızca sayı.",
        subjects.chemistry,
      ),
    ).toBeNull();
  });
});

describe("repeats page does not spend credits", () => {
  it("only reads stored misconceptions", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/tekrarlar/page.tsx", "utf8");
    const list = readFileSync("src/components/parity/exam-prep-reviews.tsx", "utf8");
    for (const source of [page, list]) {
      expect(source).not.toContain("reserveCredits");
      expect(source).not.toContain("generateJson");
      expect(source).not.toContain("QUIZ_GENERATE");
    }
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("cortex-balance");
    expect(session).toContain("oralReviewItemFromGrade");
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain("cortex-balance");
  });
});

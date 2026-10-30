import { existsSync, readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import {
  APPROX_ORAL_GRADE_NOTE,
  firstAnswerErrorLine,
  gradeOralExam,
  ORAL_JUDGE_RULES,
  oralAttemptScore,
  oralFirstAnswerKey,
  oralReviewItemFromGrade,
  oralScoreFraction,
  type OralQuestionDraft,
  type OralSemanticItem,
} from "@/lib/learning/oral-exam";
import { reconcileOralGrade } from "@/lib/learning/oral-review";

/**
 * Paket H — sözlü deneme puanlaması (29 Ekim 2026, ürün sahibinin kararı): doğruluk kararı tek
 * hakemde. Kod hakemin puanını hiçbir koşulda düşürmez, "İlk yanıtta … yanlış ifade edildi"
 * satırını üretmez; yalnız hakemin {wrong, correct} notunu biçimler ve tam puan almayan soruda
 * gösterir. Soru bağlamsız olgu denetimi (oral-fact-check) kalktı. Senaryolar ders-bağımsız:
 * matematik, tıp, tarih, hukuk, fizik.
 */

const read = (path: string) => readSource(path);

function covered(index: number, points: { point: string; quote: string }[], issue?: { wrong: string; correct: string }): OralSemanticItem {
  return {
    index,
    points: points.map((row) => ({ point: row.point, status: "covered" as const, quote: row.quote })),
    ...(issue ? { firstAnswerIssue: issue } : {}),
  };
}

describe("matematik: 8 soru hepsi covered, üç sahte not → %100, 8/8, Eksikler boş", () => {
  const rows: { question: OralQuestionDraft; answer: string; quote: string }[] = [
    { question: { prompt: "Türev neyi ölçer?", expectedPoints: ["anlık değişim oranı"] }, answer: "Türev anlık değişim oranını ölçer.", quote: "anlık değişim oranı" },
    { question: { prompt: "Belirli integral neyi verir?", expectedPoints: ["eğri altındaki alan"] }, answer: "Belirli integral eğri altındaki alanı verir.", quote: "eğri altındaki alan" },
    { question: { prompt: "Birim çemberde cos 0° kaçtır?", expectedPoints: ["cos 0° değeri 1"] }, answer: "Birim çemberde cos 0° değeri 1 olur.", quote: "cos 0° değeri 1" },
    { question: { prompt: "Asal sayı nedir?", expectedPoints: ["yalnız 1'e ve kendisine bölünür"] }, answer: "Asal sayı yalnız 1'e ve kendisine bölünür.", quote: "yalnız 1'e ve kendisine bölünür" },
    { question: { prompt: "Aritmetik dizide ortak fark nedir?", expectedPoints: ["ardışık terimler farkı sabittir"] }, answer: "Ardışık terimler farkı sabittir, buna ortak fark denir.", quote: "ardışık terimler farkı sabittir" },
    { question: { prompt: "Fonksiyonun tersi ne zaman vardır?", expectedPoints: ["birebir ve örten olmalı"] }, answer: "Fonksiyon birebir ve örten olmalı ki tersi olsun.", quote: "birebir ve örten olmalı" },
    { question: { prompt: "Logaritmanın tabanı için koşul nedir?", expectedPoints: ["taban pozitif ve 1'den farklı"] }, answer: "Taban pozitif ve 1'den farklı olmalıdır.", quote: "taban pozitif ve 1'den farklı" },
    { question: { prompt: "Dik üçgende Pisagor bağıntısı nedir?", expectedPoints: ["hipotenüsün karesi dik kenarların kareleri toplamı"] }, answer: "Hipotenüsün karesi dik kenarların kareleri toplamıdır.", quote: "hipotenüsün karesi dik kenarların kareleri toplamı" },
  ];
  const answers = Object.fromEntries(rows.map((row, index) => [String(index), row.answer]));
  const semantics = rows.map((row, index) =>
    covered(
      index,
      [{ point: row.question.expectedPoints![0]!, quote: row.quote }],
      // Üç sahte not: wrong öğrencinin doğru cümlesi, correct alakasız bir cümle (eski sezgi bunu "çelişki" sayıyordu).
      index % 3 === 0 ? { wrong: row.answer.replace(/\.$/, ""), correct: "Kesirlerde pay ve payda ters çevrilir." } : undefined,
    ),
  );

  it("report.pct 100, kesir 8/8, Eksikler boş, hiçbir gap 'yanlış ifade edildi' içermez", () => {
    const report = gradeOralExam(rows.map((row) => row.question), answers, "", [], semantics);
    expect(report.pct).toBe(100);
    expect(report.fullCount).toBe(8);
    expect(oralScoreFraction(report).label).toBe("8/8");
    expect(report.weaknesses).toEqual([]);
    expect(report.items.every((item) => !(item.gap ?? "").includes("yanlış ifade edildi"))).toBe(true);
    expect(report.items.every((item) => item.firstAnswerNote === undefined)).toBe(true);
    expect(report.correctIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(oralAttemptScore(report)).toEqual({ score: 100, total: 100, retried: 0 });
  });
});

describe("tıp: ilk cevapta yanlış doz, takipte düzeltme → oran hakemin, kod ek tavan uygulamaz", () => {
  const question: OralQuestionDraft = {
    prompt: "Çocukta bu ilacın dozu ve veriliş yolu nedir?",
    learningObjective: "Doz ve veriliş yolu",
    expectedPoints: ["5 mg/kg", "ağızdan verilir"],
  };
  const first = "Doz 10 mg/kg, ağızdan verilir.";
  const follow = "Pardon, 5 mg/kg.";
  const answers = { "0": `${first}\n${follow}`, [oralFirstAnswerKey(0)]: first };
  const issue = { wrong: "Doz 10 mg/kg", correct: "5 mg/kg" };
  const semantics: OralSemanticItem[] = [
    {
      index: 0,
      points: [
        { point: "5 mg/kg", status: "missing", quote: "" },
        { point: "ağızdan verilir", status: "covered", quote: "ağızdan verilir" },
      ],
      firstAnswerIssue: issue,
    },
  ];

  it("2 noktadan 1 → oran tam 0,5 (0,25 değil); Eksikler'in ilk satırı hakemin notu; correctIndices boş", () => {
    const report = gradeOralExam([question], answers, "Çocukta doz 5 mg/kg, ağızdan verilir.", [], semantics);
    const item = report.items[0]!;
    const line = firstAnswerErrorLine(issue);
    expect(item.ratio).toBe(0.5);
    expect(item.verdict).toBe("kismen");
    expect(item.firstAnswerNote).toBe(line);
    expect(item.gap).toBe(line);
    expect(report.weaknesses[0]).toBe(line);
    expect(report.correctIndices).not.toContain(0);
    expect(report.pct).toBe(50);
    expect(oralAttemptScore(report).score).toBe(50);
    expect(line).toBe("İlk yanıtta «Doz 10 mg/kg» yanlış ifade edildi; doğrusu «5 mg/kg» olmalıdır.");
  });

  it("hakem aynı cevabı covered saydıysa kod tavan koymaz: %100, not yok", () => {
    const report = gradeOralExam(
      [question],
      answers,
      "Çocukta doz 5 mg/kg, ağızdan verilir.",
      [],
      [covered(0, [{ point: "5 mg/kg", quote: "5 mg/kg" }, { point: "ağızdan verilir", quote: "ağızdan verilir" }], issue)],
    );
    expect(report.pct).toBe(100);
    expect(report.items[0]?.firstAnswerNote).toBeUndefined();
    expect(report.weaknesses).toEqual([]);
  });
});

describe("tarih: takip sorusu açılmadı → hakemin partial oranı aynen", () => {
  it("tek nokta partial → 0,5; ilk cevap anahtarı yok, not yok", () => {
    const answers = { "0": "Tanzimat Fermanı 1839'da ilan edildi." };
    const report = gradeOralExam(
      [{ prompt: "Tanzimat Fermanı ne zaman ve kim tarafından okundu?", expectedPoints: ["1839'da Mustafa Reşid Paşa okudu"] }],
      answers,
      "Tanzimat Fermanı 1839'da Mustafa Reşid Paşa tarafından okundu.",
      [],
      [{ index: 0, points: [{ point: "1839'da Mustafa Reşid Paşa okudu", status: "partial", quote: "1839'da ilan edildi" }] }],
    );
    const item = report.items[0]!;
    expect(item.ratio).toBe(0.5);
    expect(item.verdict).toBe("kismen");
    expect(item.firstAnswerNote).toBeUndefined();
    expect(item.gap).not.toContain("yanlış ifade edildi");
    expect(report.pct).toBe(50);
  });
});

describe("hukuk: hakem düşerse yedek (approximate) yol, APPROX notu", () => {
  const questions: OralQuestionDraft[] = [
    { prompt: "İrade sakatlığı halleri nelerdir?", learningObjective: "İrade sakatlığı", expectedPoints: ["hata, hile ve ikrah"] },
    { prompt: "Zamanaşımı neyi ortadan kaldırır?", learningObjective: "Zamanaşımı", expectedPoints: ["borcun dava edilebilirliğini kaldırır"] },
  ];
  const source = "İrade sakatlığı hata, hile ve ikrahtır. Zamanaşımı borcun dava edilebilirliğini kaldırır.";

  it("kelime örtüşmesi: tutan cevap tam, tutmayan sıfır; inceleme kartında yaklaşık notu", () => {
    const report = gradeOralExam(
      questions,
      { "0": "İrade sakatlığı halleri hata, hile ve ikrahtır.", "1": "Borcu tümden siler." },
      source,
      [],
      null,
    );
    expect(report.items[0]?.approximate).toBe(true);
    expect(report.items[0]?.ratio).toBe(1);
    expect(report.items[1]?.approximate).toBe(true);
    expect(report.items[1]?.ratio).toBe(0);
    expect(report.items[1]?.verdict).toBe("yanlis");
    expect(report.items.every((item) => !(item.gap ?? "").includes("yanlış ifade edildi"))).toBe(true);
    expect(oralReviewItemFromGrade(report.items[0]!).solution).toContain(APPROX_ORAL_GRADE_NOTE);
    expect(report.pct).toBe(50);
  });

  it("fizik: yedek yolda kaynakta olmayan sayı puanı yarıya düşürmez; yalnız sayı notu kalır", () => {
    const report = gradeOralExam(
      [{ prompt: "Newton'un ikinci yasası nedir?", expectedPoints: ["kuvvet kütle ile ivmenin çarpımıdır"] }],
      { "0": "Kuvvet kütle ile ivmenin çarpımıdır; örnekte 7 N çıkar." },
      "Kuvvet kütle ile ivmenin çarpımıdır.",
      [],
      null,
    );
    expect(report.items[0]?.approximate).toBe(true);
    expect(report.items[0]?.ratio).toBe(1);
    expect(report.pct).toBe(100);
  });
});

describe("stüdyo: hakemin kararı aynen; not yalnız gerekçe; rubrik yükseltmesi kalır", () => {
  const question = { prompt: "Bir elektronun yükü nedir?", expectedPoints: ["negatif elemanter yük"] };

  it("hakem doğru + sahte not → doğru, gerekçe yok", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers: { "0": "Elektron negatif elemanter yük taşır." },
      modelItems: [{ index: 0, correct: true, gap: null, firstAnswerIssue: { wrong: "negatif elemanter yük taşır", correct: "pozitif yük" } }],
    });
    expect(result.correctIndices).toEqual([0]);
    expect(result.items[0]?.gap).toBeNull();
  });

  it("hakem yanlış + not, rubrik tutmuyor → gerekçe hakemin satırı", () => {
    const issue = { wrong: "pozitif yük taşır", correct: "negatif elemanter yük" };
    const result = reconcileOralGrade({
      questions: [question],
      answers: { "0": "Elektron pozitif yük taşır." },
      modelItems: [{ index: 0, correct: false, gap: "Yükün işareti yanlış.", firstAnswerIssue: issue }],
    });
    expect(result.correctIndices).toEqual([]);
    expect(result.items[0]?.gap).toBe(firstAnswerErrorLine(issue));
  });

  it("hakem yanlış, notsuz, rubrik tutmuyor → temizlenmiş gap", () => {
    const result = reconcileOralGrade({
      questions: [question],
      answers: { "0": "Elektron pozitif yük taşır." },
      modelItems: [{ index: 0, correct: false, gap: "Yükün işareti yanlış." }],
    });
    expect(result.items[0]?.gap).toBe("Yükün işareti yanlış.");
  });
});

describe("tek hakem — kod ve istem bekçileri", () => {
  it("oral-fact-check silindi; eski çelişki sezgisi ve tavan dışa aktarılmıyor", () => {
    expect(existsSync("src/lib/learning/oral-fact-check.ts")).toBe(false);
    const helper = read("src/lib/learning/oral-first-answer.ts");
    for (const gone of ["validFirstAnswerErrors", "contradictsExpected", "ORAL_FIRST_ERROR_CAP", "splitAnswerSentences", "speech-tolerance"]) {
      expect(helper).not.toContain(gone);
    }
    for (const kept of ["oralFirstAnswerKey", "oralFirstAnswer(", "oralDeskAnswer", "firstAnswerErrorLine", "oralFollowQuestionKey"]) {
      expect(helper).toContain(kept);
    }
  });

  it("gradeOralAnswer oranı aşağı çeken tavan içermez; hakem oranı ratioFromSemantic", () => {
    const exam = read("src/lib/learning/oral-exam.ts");
    expect(exam).not.toMatch(/Math\.min\(ratio/);
    expect(exam).not.toContain("ORAL_FIRST_ERROR_CAP");
    expect(exam).not.toContain("validFirstAnswerErrors");
    expect(exam).toContain("ratio = ratioFromSemantic(valid)");
    expect(exam).toContain("validSemanticPoints(answer, semantic)");
    expect(exam).toContain("if (!semantic?.length && matchesSolution)");
  });

  it("iki yüzey aynı kural sabitini okur; istem soru başına kapalı blok, kaynak özeti yok", () => {
    expect(ORAL_JUDGE_RULES).toContain("yalnız kendi bloğuyla");
    expect(ORAL_JUDGE_RULES).toContain("firstAnswerIssue");
    expect(ORAL_JUDGE_RULES).toContain("takipte düzeltme noktayı geri kazandırmaz");
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    const studio = read("src/app/api/learning/oral/grade/route.ts");
    for (const file of [node, studio]) {
      expect(file).toContain("ORAL_JUDGE_RULES");
      expect(file).toContain("Beklenen noktalar:");
      expect(file).toContain("İlk cevap:");
      expect(file).toContain("firstAnswerIssue");
      expect(file).toContain("başı ---");
      expect(file).toContain("sonu ---");
      expect(file).not.toContain("Kaynak özeti");
      expect(file).not.toContain("oral-fact-check");
      expect(file).not.toContain("withFactConflicts");
      expect(file).not.toMatch(/errors: z\s*\.array/);
    }
    expect(node).toContain("Rubrik:");
    expect(node).toContain("Örnek çözüm:");
    expect(node).toContain("Takip sorusu:");
    expect(node).toContain("Takip cevabı:");
    // Hakem düşerse bir kez daha istenir, sonra yedek yol.
    expect(node).toContain("(await gradeOralSemantics(judgeInput)) ?? (await gradeOralSemantics(judgeInput))");
    expect(studio).toContain("examinerVibeGradeLine");
  });

  it("stüdyo uzlaştırması ilk cevap mantığı taşımaz; hakemin 'correct'i aynen", () => {
    const review = read("src/lib/learning/oral-review.ts");
    expect(review).toContain("let correct = Boolean(model?.correct);");
    expect(review).toContain("if (covers) correct = true;");
    expect(review).not.toContain("validFirstAnswerErrors");
    expect(review).not.toContain("firstAnswerErrors");
  });

  it("ekran: Eksikler yalnız weaknesses; oturum takip sorusunu takip:<i> anahtarına yazar", () => {
    const flow = read("src/components/parity/oral-exam-flow.tsx");
    expect(flow).not.toContain("firstAnswerErrors");
    const session = read("src/components/parity/exam-node-session.tsx");
    expect(session).not.toContain("firstAnswerErrors");
    expect(session).not.toContain("firstAnswerErrorLine");
    expect(session).toContain("onProbe={(question) => updateAnswer(oralFollowQuestionKey(index), question)}");
    const desk = read("src/components/parity/oral-answer-desk.tsx");
    expect(desk).toContain("onProbe?.(next.question)");
    // ilk:/takip: anahtarları RPC'ye kadar korunur: stripAnswerMeta yalnız __meta/__hints düşürür.
    const tracking = read("src/lib/learning/learning-tracking.ts");
    expect(tracking).toMatch(/const \{ __meta, __hints, \.\.\.rest \} = answers;/);
  });
});

// p1-oral-facts.test.ts silinince (29 Ekim 2026) oradaki iki ilgisiz bekçi buraya taşındı.
describe("taşınan bekçiler: yeni kapı dosyalarında ders adı yok, kapalı katman tıklamayı kesmez", () => {
  const files = ["src/lib/learning/quiz-delivery.ts", "src/lib/learning/podcast-duration.ts", "src/lib/learning/oral-first-answer.ts"];
  const banned =
    /hücre|mitoz|mayoz|mitokondri|kromozom|fotosentez|enzim|biyoloji|kimya|matematik|anayasa|pediatri|kpss|osmanlı|vatandaşlık|\btyt\b|\bayt\b|\byds\b|\btus\b|\bdna\b|\brna\b|\batp\b/i;

  it("kapı dosyaları ders dalı içermez", () => {
    for (const file of files) {
      expect(read(file)).not.toMatch(banned);
    }
  });

  it("kapalı katman tıklamayı kesmez", () => {
    const css = read("src/styles/oral-exam-chrome.css");
    expect(css).toContain(".cp-oral-modal-back[hidden]");
    expect(css).toContain(".cp-oral-modal-back.is-closed");
    expect(css).toContain('.cp-oral-modal-back[aria-hidden="true"]');
    expect(css).toContain("pointer-events: none !important");
    expect(css).toContain("display: none !important");
  });
});

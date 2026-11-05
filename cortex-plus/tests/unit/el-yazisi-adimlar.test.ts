import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeWorkSteps,
  firstError,
  firstErrorSentence,
  firstErrorSummary,
  mergeStepVerdicts,
  parseModelSteps,
  parseStoredFirstError,
  parseStoredSteps,
  splitWorkLines,
  stepFeedbackLine,
  unitConversionFactor,
  UNREADABLE_LINE_MARK,
  WORK_MAX_LINES,
  workStepFeedback,
  type WorkStepVerdict,
} from "@/lib/learning/mock-exam/work-steps";
import { adjustScoredAnswer, finalAnswerCorrect, SHORT_SOLUTION_FULL_CREDIT, stepPartialCredit } from "@/lib/learning/mock-exam/grade";
import { numberedAnswerLines, OPEN_GRADE_SYSTEM, openGradeUserPrompt, parseOpenGrade } from "@/lib/learning/mock-exam/open-grade";
import { PAPER_READ_SYSTEM, paperAnswers, paperAnswerText, parsePaperRead, type PaperQuestion } from "@/lib/learning/paper-exam";
import { stepArithmeticCheck } from "@/lib/solve/step-arithmetic";

/*
  El yazısı çözümde ara işlem satırları (5 Kasım 2026). Kâğıttan ya da uygulamadan gelen açık uçlu cevap satır satır
  okunur; kod hesabı, işareti ve birimi genel cebirle denetler, model kavram ve eksik adımı söyler; ilk hatalı satır
  öğrenciye "k. satırda …" diye gider ve sonuç yanlışsa doğru satırlar adil kısmi puan getirir. Örnekler farklı
  derslerden: kurallar derse bağlı değildir.
*/

const read = (path: string) => readFileSync(path, "utf8");
const statuses = (steps: WorkStepVerdict[]) => steps.map((step) => step.status);

describe("satırlara bölme", () => {
  it("satır sonu böler, baştaki numarayı atar, boş satırı düşürür, en çok 24 satır", () => {
    const lines = splitWorkLines("1. 3x + 5 = 20\n\n2) 3x = 15\n   x = 5  \n");
    expect(lines).toEqual(["3x + 5 = 20", "3x = 15", "x = 5"]);
    const many = Array.from({ length: 30 }, (_, i) => `a${i} = ${i}`).join("\n");
    expect(splitWorkLines(many)).toHaveLength(WORK_MAX_LINES);
  });

  it("tek satırsa ';' ve '⇒ / →' zincirleri ayrı satırdır", () => {
    expect(splitWorkLines("2x = 3 ⇒ x = 3/2; kontrol: 2·1,5 = 3")).toEqual(["2x = 3", "x = 3/2", "kontrol: 2·1,5 = 3"]);
    expect(numberedAnswerLines("2x = 3 ⇒ x = 3/2")).toBe("1. 2x = 3\n2. x = 3/2");
  });
});

describe("işaret hatası — terim karşıya geçerken", () => {
  it("matematik: toplanan terim karşıya aynı işaretle geçmiş → 2. satır işaret hatası; doğru taşıma ok", () => {
    const wrong = analyzeWorkSteps("3x + 5 = 20\n3x = 20 + 5\nx = 25/3");
    expect(wrong[1]).toMatchObject({ n: 2, status: "error", kind: "isaret" });
    expect(firstError(wrong)?.n).toBe(2);
    expect(stepFeedbackLine(wrong)).toBe("1. satıra kadar kurulumun doğru; 2. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.");

    const right = analyzeWorkSteps("3x + 5 = 20\n3x = 20 − 5 = 15\nx = 5");
    expect(statuses(right)).toEqual(["unknown", "ok", "ok"]);
    expect(firstError(right)).toBeNull();
  });

  it("fizik: çıkarılan terim karşıya geçerken işareti değişmeli; çarpan karşıya geçerken bölmeye dönmeli", () => {
    const force = analyzeWorkSteps("F − 20 = 30\nF = 30 − 20 = 10 N");
    expect(force[1]).toMatchObject({ status: "error", kind: "isaret" });
    expect(analyzeWorkSteps("F − 20 = 30\nF = 30 + 20 = 50 N")[1]?.status).toBe("ok");

    const scale = analyzeWorkSteps("2a = 10\na = 10 · 2 = 20 m/s²");
    expect(scale[1]).toMatchObject({ status: "error", kind: "isaret", note: "çarpan karşıya geçerken bölmeye dönmemiş" });
    expect(analyzeWorkSteps("2a = 10\na = 10 / 2 = 5 m/s²")[1]?.status).toBe("ok");
    expect(analyzeWorkSteps("x/4 = 3\nx = 3/4")[1]).toMatchObject({ status: "error", kind: "isaret" });
    expect(analyzeWorkSteps("x/4 = 3\nx = 12")[1]?.status).toBe("ok");
  });

  it("karar yalnız tam bir terim taşındığında verilir; başka sadeleştirme hata sayılmaz", () => {
    const steps = analyzeWorkSteps("3x + 5 = 20\n3x = 15\nx = 5");
    expect(statuses(steps)).toEqual(["unknown", "unknown", "ok"]);
  });
});

describe("birim tutarsızlığı", () => {
  it("fizik: aynı değer çarpansız başka birimle → birim hatası; dönüşüm ve eş anlamlı birim serbest", () => {
    const slip = analyzeWorkSteps("x = 150 cm\nx = 150 m");
    expect(slip[1]).toMatchObject({ status: "error", kind: "birim" });
    expect(analyzeWorkSteps("x = 150 cm = 150 m")[0]).toMatchObject({ status: "error", kind: "birim" });
    // Doğru dönüşüm hesaplanabilir ve "ok"tur; tutmayan dönüşüm birim hatasıdır (işlem hatası değil).
    expect(analyzeWorkSteps("x = 150 cm = 1,5 m")[0]?.status).toBe("ok");
    expect(analyzeWorkSteps("x = 150 cm\nx = 1,5 m")[1]?.status).toBe("ok");
    expect(analyzeWorkSteps("x = 150 cm = 15 m")[0]).toMatchObject({ status: "error", kind: "birim", note: "birim dönüşümü tutmuyor" });
    expect(analyzeWorkSteps("v = 36 km/h = 10 m/s")[0]?.status).toBe("ok");
    expect(analyzeWorkSteps("A = 2 m² = 20000 cm²")[0]?.status).toBe("ok");
    expect(analyzeWorkSteps("t = 2 dk = 120 s")[0]?.status).toBe("ok");
    expect(firstError(analyzeWorkSteps("t = 2 s\nt = 2 sn"))).toBeNull();
    expect(firstError(analyzeWorkSteps("V = 5 mL\nV = 5 ml"))).toBeNull();
    // Tabanı farklı birimler (kg ↔ m) karşılaştırılmaz; sayıya bitişik tek harf değişkendir ("2x"), birim değil.
    expect(firstError(analyzeWorkSteps("m = 2 kg\nx = 2 m"))).toBeNull();
    expect(firstError(analyzeWorkSteps("y = 2x\ny = 2"))).toBeNull();
    expect(unitConversionFactor("km", "m")).toBe(1000);
    expect(unitConversionFactor("cm²", "m²")).toBeCloseTo(1e-4);
    expect(unitConversionFactor("kg", "m")).toBeNull();
  });
});

describe("işlem hatası ve okunamayan satır", () => {
  it("kimya: mol hesabı tutmuyor → ilk satırdan itibaren işlem hatası", () => {
    const steps = analyzeWorkSteps("n = m / M = 36 / 18 = 3 mol\nN = n · 6,02·10²³");
    expect(steps[0]).toMatchObject({ status: "error", kind: "islem" });
    expect(steps[0]?.note).toContain("hesap tutmuyor");
    expect(stepFeedbackLine(steps)).toMatch(/^İlk satırdan itibaren işlem hatası: hesap tutmuyor/);
    expect(stepArithmeticCheck("36 / 18 = 2 = 2,0").verified).toBe(2);
  });

  it("okunamayan satır yerinde durur, sınanmaz ve zinciri keser", () => {
    const steps = analyzeWorkSteps(`3x + 5 = 20\n${UNREADABLE_LINE_MARK}\n3x = 20 + 5`);
    expect(steps[1]).toMatchObject({ status: "unknown", note: "bu satır okunamadı" });
    // Araya okunamayan satır girince 3. satır 1. satıra göre yargılanmaz.
    expect(steps[2]?.status).not.toBe("error");
  });
});

describe("kopuk zincir ve sayısız cevap", () => {
  it("önceki satırla hiçbir terim paylaşmayan satır yalnız not alır; puan düşmez", () => {
    const steps = analyzeWorkSteps("3x + 5 = 20\ny = 7");
    expect(steps[1]?.status).not.toBe("error");
    expect(steps[1]?.note).toBe("önceki satırla bağı görünmüyor");
    expect(firstError(steps)).toBeNull();
    expect(stepPartialCredit({ steps, maxPoints: 10, finalCorrect: false, alreadyEarned: 4 })).toBeNull();
  });

  it("tarih / hukuk gibi sayısız cevapta adım analizi sessizdir: bütün satırlar unknown, kesinti yok", () => {
    const answer = "Anayasa ilan edildi.\nMeclis toplandı ve yasama yetkisi tanındı.\nİki yıl sonra askıya alındı.";
    const steps = analyzeWorkSteps(answer);
    expect(statuses(steps)).toEqual(["unknown", "unknown", "unknown"]);
    expect(steps.every((step) => !step.note)).toBe(true);
    expect(stepFeedbackLine(steps)).toBeNull();
    const tuned = adjustScoredAnswer({ answer, expected: null, maxPoints: 10, modelAnswer: "Anayasa ilan edildi; meclis toplandı.", criteria: ["İlan", "Meclis"], earned: 6, steps });
    expect(tuned).toEqual({ earned: 6 });
  });
});

describe("model kararıyla birleştirme", () => {
  const code = analyzeWorkSteps("3x + 5 = 20\n3x = 20 − 5 = 15\nx = 5");

  it("kavram ve eksik adımda model kazanır; hesap/işaret/birimde kodun doğruladığı satıra model hata diyemez", () => {
    const model: WorkStepVerdict[] = [
      { n: 1, text: "", status: "error", kind: "kavram", note: "denklem yanlış kurulmuş" },
      { n: 2, text: "", status: "error", kind: "islem" },
      { n: 3, text: "", status: "ok" },
    ];
    const merged = mergeStepVerdicts(code, model);
    expect(merged[0]).toMatchObject({ n: 1, text: "3x + 5 = 20", status: "error", kind: "kavram", note: "denklem yanlış kurulmuş" });
    expect(merged[1]?.status).toBe("ok");
    expect(merged[2]?.status).toBe("ok");
    expect(stepFeedbackLine(merged)).toBe("İlk satırdan itibaren kavram hatası: denklem yanlış kurulmuş.");
  });

  it("kodun bilmediği satırda modelin 'ok'u kabul edilir, 'islem' hatası da", () => {
    const merged = mergeStepVerdicts(code, [{ n: 1, text: "", status: "ok" }]);
    expect(merged[0]?.status).toBe("ok");
    const unknownLine = analyzeWorkSteps("v = x / t\nv = 100 / 20 = 5 m/s");
    const judged = mergeStepVerdicts(unknownLine, [{ n: 1, text: "", status: "error", kind: "isaret" }]);
    expect(judged[0]).toMatchObject({ status: "error", kind: "isaret" });
  });

  it("kodun hatası modelin 'ok'uyla silinmez", () => {
    const wrong = analyzeWorkSteps("3x + 5 = 20\n3x = 20 + 5");
    const merged = mergeStepVerdicts(wrong, [{ n: 2, text: "", status: "ok" }]);
    expect(merged[1]).toMatchObject({ status: "error", kind: "isaret" });
  });
});

describe("parseOpenGrade adımları okur", () => {
  const items = [{ question: "S", criteria: ["Kurulum", "Sonuç"], modelAnswer: "3x = 15 ⇒ x = 5", answer: "3x + 5 = 20\n3x = 20 + 5\nx = 25/3" }];

  it("satır dışı numara, 'ok' olmayan ve yinelenen satır düşer; türsüz hata kavram sayılır; not 15 kelimeyle sınırlı", () => {
    const parsed = parseOpenGrade(
      {
        items: [
          {
            index: 0,
            criteria: [{ index: 0, met: true, quote: "3x + 5 = 20" }],
            steps: [
              { n: 1, ok: true },
              { n: 2, ok: false, kind: "isaret", note: "bir iki üç dört beş altı yedi sekiz dokuz on on bir on iki on üç on dört on beş on altı" },
              { n: 2, ok: true },
              { n: 3, ok: false },
              { n: 9, ok: false, kind: "islem" },
              { n: 1.5, ok: true },
              { n: 4 },
            ],
          },
        ],
      },
      items,
    );
    const steps = parsed.get(0)?.steps ?? [];
    expect(steps.map((step) => [step.n, step.status, step.kind ?? null])).toEqual([
      [1, "ok", null],
      [2, "error", "isaret"],
      [3, "error", "kavram"],
    ]);
    expect(steps[0]?.text).toBe("3x + 5 = 20");
    expect(steps[1]?.note?.split(" ")).toHaveLength(15);
    expect(parseModelSteps("bozuk", ["a"])).toEqual([]);
  });

  it("istem numaralı satır verir ve adım şemasını açıklar; eski alanlar yerinde", () => {
    const prompt = openGradeUserPrompt(items);
    expect(prompt).toContain("ÖĞRENCİNİN CEVABI (numaralı satırlar):\n1. 3x + 5 = 20\n2. 3x = 20 + 5\n3. x = 25/3");
    for (const kind of ["islem", "isaret", "birim", "kavram", "eksik"]) expect(OPEN_GRADE_SYSTEM).toContain(kind);
    expect(OPEN_GRADE_SYSTEM).toContain('"steps":[{"n":1,"ok":true}');
    expect(OPEN_GRADE_SYSTEM).toContain("wrong: true");
    expect(OPEN_GRADE_SYSTEM).toContain("kısa ya da özet olması kesinti sebebi değildir");
  });
});

describe("adil kısmi puan", () => {
  const five = (k: number): WorkStepVerdict[] =>
    Array.from({ length: 5 }, (_, i) => ({ n: i + 1, text: `s${i + 1}`, status: i + 1 === k ? "error" : "ok", ...(i + 1 === k ? { kind: "islem" as const } : {}) }));

  it("sonuç yanlış, ilk hata k. satırda, öncesinde doğru satır var → 0,3 + 0,5 × (k−1)/n bandı", () => {
    expect(stepPartialCredit({ steps: five(3), maxPoints: 10, finalCorrect: false, alreadyEarned: 0 })?.earned).toBe(5);
    expect(stepPartialCredit({ steps: five(5), maxPoints: 10, finalCorrect: false, alreadyEarned: 0 })?.earned).toBe(7);
    expect(stepPartialCredit({ steps: five(2), maxPoints: 20, finalCorrect: false, alreadyEarned: 0 })?.earned).toBe(8);
    // Eldeki puan daha yüksekse dokunulmaz; ilk satırdan hata ya da hata yoksa band uygulanmaz; sonuç doğruysa kesinti yok.
    expect(stepPartialCredit({ steps: five(3), maxPoints: 10, finalCorrect: false, alreadyEarned: 7 })).toBeNull();
    expect(stepPartialCredit({ steps: five(1), maxPoints: 10, finalCorrect: false, alreadyEarned: 0 })).toBeNull();
    expect(stepPartialCredit({ steps: five(0), maxPoints: 10, finalCorrect: false, alreadyEarned: 0 })).toBeNull();
    expect(stepPartialCredit({ steps: five(3), maxPoints: 10, finalCorrect: true, alreadyEarned: 2 })).toBeNull();
    expect(stepPartialCredit({ steps: [], maxPoints: 10, finalCorrect: false, alreadyEarned: 0 })).toBeNull();
  });

  it("adjustScoredAnswer: adım bilgisi yokken davranış aynı; varken işaret hatalı çözüm bandı alır ve satır cümlesi döner", () => {
    const base = { expected: 5, maxPoints: 10, modelAnswer: "3x = 15 ⇒ x = 5", criteria: ["Denklemi kurar", "Çözüm adımlarını yazar"], earned: 0 };
    const answer = "3x + 5 = 20\n3x = 20 + 5\nx = 25/3";
    const without = adjustScoredAnswer({ ...base, answer });
    expect(adjustScoredAnswer({ ...base, answer, steps: [] })).toEqual(without);
    const steps = mergeStepVerdicts(analyzeWorkSteps(answer), [{ n: 1, text: "", status: "ok" }]);
    const sentence = "1. satıra kadar kurulumun doğru; 2. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.";
    // Yöntem işaretleri tutuyor: eski kural zaten bant veriyor (8/10); adım kredisi onu düşürmez, kayda satır cümlesi gider.
    const tuned = adjustScoredAnswer({ ...base, answer, steps });
    expect(without.earned).toBeGreaterThanOrEqual(5);
    expect(tuned.earned).toBe(without.earned);
    expect(workStepFeedback(steps, tuned.step).step).toBe(sentence);
    // Yöntem işareti tutmayınca eski kural 0 bırakıyordu; doğru 1. satır bandı açar: round(10 × (0,3 + 0,5 × 1/3)) = 5.
    const bare = { ...base, modelAnswer: "x = 5", criteria: ["Denklemi kurar"] };
    expect(adjustScoredAnswer({ ...bare, answer }).earned).toBe(0);
    expect(adjustScoredAnswer({ ...bare, answer, steps })).toEqual({ earned: 5, step: sentence });
    expect(finalAnswerCorrect({ answer, expected: 5, modelAnswer: base.modelAnswer })).toBe(false);
  });

  it("sonuç doğru ama ortada işlem hatası varsa (tesadüf) kesinti yok, yalnız satır işaretlenir; hepsi doğruysa kısa çözüm kuralı aynen", () => {
    const model = "Alan = taban · yükseklik = 3 · 4 = 12 cm²";
    const criteria = ["Alan bağıntısını kurar", "Sonucu birimiyle yazar"];
    const slipAnswer = "3 · 4 = 11\nAlan = 12 cm²";
    const slipSteps = analyzeWorkSteps(slipAnswer);
    expect(slipSteps[0]).toMatchObject({ status: "error", kind: "islem" });
    const slip = adjustScoredAnswer({ answer: slipAnswer, expected: 12, maxPoints: 10, modelAnswer: model, criteria, earned: 6, steps: slipSteps });
    expect(slip.earned).toBe(6);
    expect(workStepFeedback(slipSteps, slip.step).step).toMatch(/^İlk satırdan itibaren işlem hatası/);

    const clean = "Alan = 3 · 4 = 12 cm²";
    const tuned = adjustScoredAnswer({ answer: clean, expected: 12, maxPoints: 10, modelAnswer: model, criteria, earned: 5, steps: analyzeWorkSteps(clean) });
    expect(tuned).toEqual({ earned: 10, step: SHORT_SOLUTION_FULL_CREDIT });
  });
});

describe("kayıt alanları ve geri bildirim cümlesi", () => {
  it("workStepFeedback steps + firstError + step yazar; adım yoksa yalnız puan notu", () => {
    const steps = analyzeWorkSteps("3x + 5 = 20\n3x = 20 + 5");
    const fields = workStepFeedback(steps, "Kurulum doğru; son aritmetik adım hatalı.");
    expect(fields.firstError).toEqual({ line: 2, kind: "isaret", note: "terim karşıya geçerken işareti değişmemiş" });
    expect(fields.step).toBe(stepFeedbackLine(steps));
    expect(Array.isArray(fields.steps)).toBe(true);
    expect(workStepFeedback([], "not")).toEqual({ step: "not" });
    expect(workStepFeedback([])).toEqual({});
  });

  it("kayıttan okuma: bozuk satır düşer, eski kayıtta boş; ilk hata özetten ya da adımlardan", () => {
    const stored = parseStoredSteps([
      { n: 1, text: "a = 1", status: "ok" },
      { n: 2, text: "b = 2", status: "error", kind: "birim", note: "x" },
      { n: 3, status: "ok" },
      { n: 4, text: "d", status: "garip" },
      { n: 2, text: "yine", status: "ok" },
    ]);
    expect(stored.map((step) => step.n)).toEqual([1, 2]);
    expect(parseStoredSteps(undefined)).toEqual([]);
    expect(parseStoredFirstError({ line: 2, kind: "birim", note: "x" }, stored)).toEqual({ line: 2, kind: "birim", note: "x" });
    expect(parseStoredFirstError(null, stored)).toEqual(firstErrorSummary(stored));
    expect(firstErrorSentence({ line: 3, kind: "isaret", note: "terim karşıya geçerken işareti değişmemiş" })).toBe(
      "3. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş.",
    );
    expect(firstErrorSentence({ line: 1, kind: "eksik" })).toBe("1. satırda eksik adım.");
  });
});

describe("kâğıt okuma satırları", () => {
  const questions: PaperQuestion[] = [
    { id: "q1", text: "Çöz.", options: [], question_type: "open" },
    { id: "q2", text: "Tanımla.", options: [], question_type: "short_answer" },
  ];

  it("satırlar \\n ile birleşir, okunamayan satır yerinde işaretlenir, son cevap satırlarda yoksa eklenir; text yalnız yedek", () => {
    const read = parsePaperRead({
      answers: [
        { n: 1, lines: ["3x + 5 = 20", { unreadable: true }, "x = 5", "", 7], text: "x = 5 cm" },
        { n: 2, text: "Kütle korunur." },
      ],
    });
    expect(read[0]?.lines).toEqual(["3x + 5 = 20", UNREADABLE_LINE_MARK, "x = 5"]);
    const { answers } = paperAnswers(questions, read);
    expect(answers.q1).toBe(`3x + 5 = 20\n${UNREADABLE_LINE_MARK}\nx = 5\nx = 5 cm`);
    expect(answers.q2).toBe("Kütle korunur.");
    expect(paperAnswerText({ lines: ["a = 1", "Cevap: 1"], text: "1" })).toBe("a = 1\nCevap: 1");
    // Satır nesne olarak da gelebilir ({text}); boş ve sayı öğeler düşer.
    expect(parsePaperRead({ answers: [{ n: 3, lines: [{ text: " b = 2 " }, "", 7] }] })[0]?.lines).toEqual(["b = 2"]);
  });

  it("okuma istemi satır satır aktarmayı ister, çözmeyi ve düzeltmeyi yasaklar; uç tek çağrı kalır", () => {
    expect(PAPER_READ_SYSTEM).toContain("lines dizisine kâğıttaki her satırı kâğıttaki sırayla");
    expect(PAPER_READ_SYSTEM).toContain('{"unreadable":true}');
    expect(PAPER_READ_SYSTEM).toContain("Cevabı sen çözme; yalnız öğrencinin yazdığını oku.");
    const route = read("src/app/api/learning/exam/paper-read/route.ts");
    expect(route.match(/chat\.completions\.create\(/g)).toHaveLength(1);
    const gradeExam = read("src/lib/learning/mock-exam/grade-exam.ts");
    expect(gradeExam.match(/chat\.completions\.create\(/g)).toHaveLength(1);
    // İki notlandırma yolu da (model + yerel yedek) satırları kayda yazar.
    expect(gradeExam).toContain("mergeStepVerdicts(codeSteps, judgement.steps ?? [])");
    expect(gradeExam.match(/workStepFeedback\(/g)).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  affirmedWrongOptions,
  explanationAnswerMismatch,
  explanationFinalValue,
  inlineCarriers,
  mcqAnswerMismatch,
  reasonAffirms,
  reasonRefutes,
  refutedCorrectOptions,
  unresolvedVisualReference,
} from "@/lib/learning/answer-consistency";
import { normalizeNumberText, numbersIn, optionValueIndexes } from "@/lib/learning/result-values";
import { claimedResults, finalResults } from "@/lib/learning/mock-exam/grade";
import { quizStructureIssues, quizSystem, quizVerifySystem, unseenStemReference } from "@/lib/learning/teacher-quiz";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { itemValidity, unseenReference } from "@/lib/learning/item-validity";
import {
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  TOPIC_VERIFY_SYSTEM,
  VERIFY_SYSTEM,
  screenStructureIssues,
  settleCheckKeys,
} from "@/lib/learning/teacher-lesson";
import type { LessonScreen } from "@/lib/learning/lesson-v3";
import type { SectionCheck } from "@/lib/learning/teaching-standards";
import { alignedAnswerIndex, gradeSectionCheck, resolveCheckForGrade } from "@/lib/learning/lesson-play";
import { acceptReviewVariant, reviewItemProblems } from "@/lib/learning/teacher-brain";
import { KEY_CONSISTENCY_RULE, MULTI_POLARITY_RULE, SELF_CONTAINED_STEM_RULE } from "@/lib/learning/teaching-rubric";

/*
  Paket H (29 Ekim 2026): cevap anahtarı ↔ açıklama tutarlılığı ve kökün kendi içinde tamlığı.
  Canlı vaka: ders sorusunun açıklaması "200 × 0,70 = 140 TL" derken anahtar 160 TL'yi gösterdi; öğrencinin
  doğru cevabı yanlış sayıldı. Kural ders-bağımsız: beş disiplinden senaryo (iktisat, fizik, matematik, tarih, tıp).
*/

/* ───────────── İktisat / matematik: ders içi soru ───────────── */

const priceCheck = (over: Partial<SectionCheck> = {}): SectionCheck =>
  ({
    type: "mcq",
    prompt: "Etiket fiyatı 200 TL olan bir ürün %30 indirimle satılıyor. İndirimli fiyat kaç TL'dir?",
    options: ["140 TL", "160 TL", "170 TL", "180 TL"],
    answerIndex: 1,
    explanation: "Fiyatın %70'i: 200 × 0,70 = 140 TL. 160 TL %20, 170 TL %15, 180 TL %10 indirime karşılık gelir.",
    optionWhy: ["%30 indirimle kalan %70.", "%20 indirim alınmış.", "%15 indirim alınmış.", "%10 indirim alınmış."],
    ...over,
  }) as SectionCheck;

const screenOf = (check: SectionCheck, extra: LessonScreen["blocks"] = []): LessonScreen =>
  ({
    heading: "Yüzde hesabı",
    concept: "Yüzde hesabı",
    blocks: [
      { type: "text", text: "İndirimli fiyat, etiket fiyatının kalan yüzdesiyle çarpımıdır; %30 indirimde %70 kalır." },
      ...extra,
      { type: "check", check },
    ],
  }) as LessonScreen;

describe("Paket H · açıklamanın vardığı değer anahtarla karşılaştırılır (ders içi)", () => {
  it("'200 × 0,70 = 140 TL' diyen açıklamanın anahtarı 160 TL'yi gösteriyorsa çelişki", () => {
    const mismatch = mcqAnswerMismatch(priceCheck());
    expect(mismatch).toMatchObject({ value: 140, expected: "140 TL", expectedIndex: 0, keyed: ["160 TL"], source: "explanation" });
  });

  it("settleCheckKeys anahtarı açıklamanın şıkkına alır ve kayda yazar; tutarlı soruya dokunmaz", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const [settled] = settleCheckKeys([screenOf(priceCheck())], { concept: "Yüzde hesabı" });
    const check = settled!.blocks.find((block) => block.type === "check");
    expect(check && check.type === "check" ? check.check.answerIndex : null).toBe(0);
    expect(info).toHaveBeenCalledWith(
      "lesson_check_key_realigned",
      expect.objectContaining({ concept: "Yüzde hesabı", from: "160 TL", to: "140 TL", value: 140 }),
    );
    const consistent = screenOf(priceCheck({ answerIndex: 0 }));
    expect(settleCheckKeys([consistent])[0]).toBe(consistent);
    info.mockRestore();
  });

  it("kayıtlı eski derste notlandırma aynı hizalamayı yapar: 140 TL'yi seçen doğru, ekran aynı indeksi görür", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const graded = gradeSectionCheck(priceCheck(), { pick: 0 });
    expect(graded.correct).toBe(true);
    expect(graded.answerIndex).toBe(0);
    expect(gradeSectionCheck(priceCheck(), { pick: 1 }).correct).toBe(false);
    expect(alignedAnswerIndex(priceCheck())).toBe(0);
    expect(alignedAnswerIndex(priceCheck({ answerIndex: 0 }))).toBe(0);
    expect(info).toHaveBeenCalledWith("lesson_grade_key_realigned", expect.objectContaining({ from: "160 TL", to: "140 TL" }));
    info.mockRestore();
  });

  it("açıklama sayısızsa ipucundaki sonuç okunur; tekrar varyantı da hizalanır", () => {
    const hinted = priceCheck({
      explanation: "Önce indirim oranını yüzden çıkar, kalan yüzdeyi etiket fiyatıyla çarp.",
      hint: "İndirimli fiyat 140 TL'dir.",
    });
    expect(mcqAnswerMismatch(hinted)).toMatchObject({ value: 140, expected: "140 TL", source: "hint" });
    const retry = resolveCheckForGrade(hinted, "retry", "tr", "");
    expect(retry.options![retry.answerIndex!]).toBe("140 TL");
    expect(gradeSectionCheck(retry, { pick: retry.options!.indexOf("140 TL") }).correct).toBe(true);
  });

  it("yapı denetimi aynı çelişkiyi yazar; yazar ve denetçi aynı kuralı okur", () => {
    const issues = screenStructureIssues(screenOf(priceCheck()), 1, {});
    expect(issues.some((issue) => /Açıklama 140 sonucuna varıyor.*'160 TL'.*'140 TL'/.test(issue.problem))).toBe(true);
    for (const prompt of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM, VERIFY_SYSTEM, TOPIC_VERIFY_SYSTEM]) {
      expect(prompt).toContain(KEY_CONSISTENCY_RULE);
      expect(prompt).toContain(SELF_CONTAINED_STEM_RULE);
    }
  });

  it("yanlış alarm kapıları: iki şık değeri taşıyan cümle, olumsuzluk, negatif eşik", () => {
    // Paket C fikstürü: "3² + 4² = 25, karekökü 5" — 25 ve 5 iki şık değeri → okunmaz.
    expect(
      explanationFinalValue({
        options: ["5 cm", "7 cm", "12 cm", "25 cm"],
        keyed: [0],
        explanation: "Pisagor: 3² + 4² = 25, karekökü 5.",
      }),
    ).toBeNull();
    expect(mcqAnswerMismatch(priceCheck({ explanation: "Sonuç 160 TL değildir; indirimli fiyat daha düşüktür." }))).toBeNull();
    // Tıp: eksi işaretli eşik (−2 SD) şıklarda "+2 SD" ile karışmaz.
    const zScore: SectionCheck = {
      type: "mcq",
      prompt: "Z-skoru −2,5 olan bir çocuğun boyu hangi bantta değerlendirilir?",
      options: ["−2 SD altı", "−1 SD altı", "+2 SD üstü", "Ortanca"],
      answerIndex: 0,
      explanation: "Z-skoru −2,5 olan çocuk −2 SD eşiğinin altındadır.",
    };
    expect(mcqAnswerMismatch(zScore)).toBeNull();
    expect(mcqAnswerMismatch({ ...zScore, answerIndex: 2 })).toMatchObject({ value: -2, expected: "−2 SD altı" });
  });
});

/* ───────────── Fizik: konu testi ───────────── */

const speed = (correct: string[], explanation = "v = 20 / 4 = 5 m/s.") =>
  ({
    text: "Bir koşucu 20 metreyi 4 saniyede koşuyor. Ortalama hızı kaç m/s'dir?",
    options: ["5 m/s", "80 m/s", "0,2 m/s", "16 m/s"],
    correct,
    multi: false,
    explanation,
    optionWhy: ["Yol bölü zaman.", "Yol ile zaman çarpılmış.", "Zaman yola bölünmüş.", "Yoldan zaman çıkarılmış."],
  }) as QuizQuestion;

describe("Paket H · konu testinde açıklama ile anahtar", () => {
  it("'v = 20 / 4 = 5 m/s' iken anahtar 80 m/s → yapı sorunu; soru düşer, kod anahtarı değiştirmez", () => {
    const wrong = speed(["80 m/s"]);
    const issues = quizStructureIssues(wrong);
    expect(issues.some((issue) => /Açıklama 5 sonucuna varıyor.*'80 m\/s' değil '5 m\/s'/.test(issue))).toBe(true);
    expect(wrong.correct).toEqual(["80 m/s"]);
  });

  it("anahtar 5 m/s ise temiz; sonuç hiçbir şıkta yoksa (500 cm/s) yanlış alarm yok", () => {
    expect(quizStructureIssues(speed(["5 m/s"]))).toEqual([]);
    expect(quizStructureIssues(speed(["80 m/s"], "v = 20 / 4 = 5 m/s = 500 cm/s.")).some((issue) => /Açıklama/.test(issue))).toBe(false);
  });

  it("test, deneme ve çok cevaplı yazarı ile denetçisi aynı kural metnini okur", () => {
    expect(quizSystem("document")).toContain(SELF_CONTAINED_STEM_RULE);
    expect(quizSystem("document")).toContain(KEY_CONSISTENCY_RULE);
    expect(quizSystem("document", "practice", false, undefined, true)).toContain(KEY_CONSISTENCY_RULE);
    expect(quizSystem("topic", "practice", true)).toContain(MULTI_POLARITY_RULE);
    for (const mode of ["document", "topic"] as const) {
      expect(quizVerifySystem(mode)).toContain(KEY_CONSISTENCY_RULE);
      expect(quizVerifySystem(mode)).toContain(SELF_CONTAINED_STEM_RULE);
      expect(quizVerifySystem(mode)).toContain(MULTI_POLARITY_RULE);
    }
  });
});

/* ───────────── Matematik: çok cevaplı, gerekçenin yönü ───────────── */

const image = (correct: string[], optionWhy: string[]) =>
  ({
    text: "f: A → B fonksiyonu f(x) = x + 3 kuralıyla tanımlıdır ve A kümesi 1, 2 ve 3 sayılarından oluşur. Aşağıdakilerden hangileri doğrudur?",
    options: ["f(1) = 4", "f(A) = {4, 5, 6}", "7 ∈ f(A)", "f(3) = 6"],
    correct,
    multi: true,
    explanation: "f(1) = 4, f(2) = 5, f(3) = 6 olduğundan f(A) = {4, 5, 6}.",
    optionWhy,
  }) as QuizQuestion;

describe("Paket H · çok cevaplıda gerekçe anahtar kümesiyle aynı yönde", () => {
  it("gerekçesi '7, f(A) kümesinde değildir' olan şık doğru listesinde duramaz", () => {
    const refuted = image(["f(1) = 4", "f(A) = {4, 5, 6}", "7 ∈ f(A)"], ["1 + 3 = 4.", "Görüntü kümesi {4, 5, 6}.", "7, f(A) kümesinde değildir.", "3 + 3 = 6 eder."]);
    expect(refutedCorrectOptions(refuted)).toEqual(["7 ∈ f(A)"]);
    expect(quizStructureIssues(refuted, { multi: true }).some((issue) => /Doğru işaretli '7 ∈ f\(A\)' şıkkını gerekçesi çürütüyor/.test(issue))).toBe(true);
  });

  it("gerekçesi 'Doğru: …' olan şık doğru listesinin dışında kalamaz; tutarlı soru temiz", () => {
    const affirmed = image(["f(1) = 4", "f(A) = {4, 5, 6}"], ["1 + 3 = 4.", "Görüntü kümesi {4, 5, 6}.", "7, f(A) kümesinde değildir.", "Doğru: 3 + 3 = 6."]);
    expect(affirmedWrongOptions(affirmed)).toEqual(["f(3) = 6"]);
    expect(quizStructureIssues(affirmed, { multi: true }).some((issue) => /Yanlış bırakılan 'f\(3\) = 6'/.test(issue))).toBe(true);
    const fine = image(["f(1) = 4", "f(A) = {4, 5, 6}", "f(3) = 6"], ["1 + 3 = 4.", "Görüntü kümesi {4, 5, 6}.", "7, f(A) kümesinde değildir.", "3 + 3 = 6 eder."]);
    expect(quizStructureIssues(fine, { multi: true }).filter((issue) => /çürütüyor|onaylıyor|Açıklama/.test(issue))).toEqual([]);
  });

  it("olumsuz içerikli olgu çürütme değildir (biyoloji); çift olumsuz onaydır", () => {
    expect(reasonRefutes("Prokaryot hücrede zarlı çekirdek bulunmaz.")).toBe(false);
    expect(reasonRefutes("Bu ifade yanlıştır.")).toBe(true);
    expect(reasonAffirms("Bu ifade yanlış değildir.")).toBe(true);
    expect(reasonAffirms("Bakteride mitokondri bulunmaz.")).toBe(false);
  });
});

/* ───────────── Tarih / tıp: kök kendi içinde tam ───────────── */

describe("Paket H · kök ekranda olmayan görsele gönderemez", () => {
  it("'haritada işaretli' kök veri taşımıyorsa sorun; ok ya da koordinatla veri taşıyorsa temiz", () => {
    const bare = "Haritada işaretli bölgede 1402'de yapılan savaş hangisidir?";
    expect(unresolvedVisualReference(bare, inlineCarriers(bare))).toBe("Haritada işaretli");
    const arrows = "Haritada işaretli güzergâh şu sırayla geçer: İstanbul → Edirne → Sofya. Bu güzergâh hangi seferin yoludur?";
    expect(unresolvedVisualReference(arrows, inlineCarriers(arrows))).toBeNull();
    const coords = "Haritada işaretli nokta (41, 29) koordinatındadır. Bu noktadaki şehir hangisidir?";
    expect(unresolvedVisualReference(coords, inlineCarriers(coords))).toBeNull();
    expect(unresolvedVisualReference("Aşağıdakilerden hangisi Tanzimat Fermanı'nın sonuçlarından biridir?")).toBeNull();
    expect(unresolvedVisualReference("Bu şekilde yönetilen devlet hangi rejimle anılır?")).toBeNull();
    expect(unseenStemReference(bare)).toBe(true);
    expect(unseenStemReference(arrows)).toBe(false);
    const question = { ...speed(["5 m/s"]), text: "Grafikte görülen eğim hangi büyüklüğü verir?" };
    expect(quizStructureIssues(question).some((issue) => /Kök 'Grafikte görülen' diye ekranda olmayan bir görsele/.test(issue))).toBe(true);
  });

  it("deneme teslim kapısı aynı kuralı okur: denklem atfını şıktaki eşitlik çözer, harita atfını çözmez", () => {
    expect(unseenReference("Yukarıdaki grafiğe göre nüfus artış hızı kaçtır?")).toBe(true);
    expect(unseenReference("Yukarıdaki grafiğe göre nüfus artış hızı kaçtır?", "r = 2")).toBe(true);
    expect(unseenReference("yukarıdaki denkleme göre sonuç kaçtır?", "V = I")).toBe(false);
    expect(itemValidity({ kind: "mcq", text: "Haritada işaretli bölge hangi iklim kuşağındadır?", options: ["Akdeniz", "Karasal"], correct: ["Akdeniz"] }).issues).toContain("unseen_reference");
  });

  it("tıp: 'EKG'de görülen' kök tabloyla ya da tablosuz temiz; 'tabloda verilen' kök yalnız tablo bloğu varsa temiz", () => {
    const table: LessonScreen["blocks"][number] = {
      type: "table",
      table: { columns: ["Bulgu", "Ritim"], rows: [["Düzensiz R-R, P yok", "Atriyal fibrilasyon"], ["Testere dişi P", "Atriyal flutter"]] },
    };
    const check = (prompt: string): SectionCheck =>
      ({
        type: "mcq",
        prompt,
        options: ["Atriyal fibrilasyon", "Atriyal flutter", "Sinüs taşikardisi", "Ventriküler taşikardi"],
        answerIndex: 0,
        explanation: "Düzensiz R-R aralığı ve P dalgasının yokluğu atriyal fibrilasyonun ayırt edici bulgusudur.",
        optionWhy: ["Düzensiz R-R, P yok.", "Testere dişi P dalgaları.", "Düzenli, P var.", "Geniş QRS."],
      }) as SectionCheck;
    const withTable = screenOf(check("Tabloda verilen bulgulardan düzensiz R-R aralığı ve P dalgası yokluğu hangi ritmi düşündürür?"), [table]);
    const withoutTable = screenOf(check("Tabloda verilen bulgulardan düzensiz R-R aralığı ve P dalgası yokluğu hangi ritmi düşündürür?"));
    const ekg = screenOf(check("EKG'de görülen düzensiz R-R aralığı ve P dalgası yokluğu hangi ritmi düşündürür?"));
    const visual = (screen: LessonScreen) => screenStructureIssues(screen, 2, {}).filter((issue) => /görsele gönderme/.test(issue.problem));
    expect(visual(withTable)).toEqual([]);
    expect(visual(ekg)).toEqual([]);
    expect(visual(withoutTable)).toHaveLength(1);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(settleCheckKeys([withoutTable])[0]!.blocks.some((block) => block.type === "check")).toBe(false);
    expect(info).toHaveBeenCalledWith("lesson_check_dropped_visual_ref", expect.objectContaining({ reference: "Tabloda verilen" }));
    expect(settleCheckKeys([withTable])[0]!.blocks.some((block) => block.type === "check")).toBe(true);
    info.mockRestore();
  });
});

/* ───────────── İkinci soru (review) ───────────── */

describe("Paket H · ikinci sorunun anahtarı da açıklamasıyla tutarlı", () => {
  const base = {
    type: "mcq" as const,
    prompt: "Etiket fiyatı 200 TL olan bir ürün %30 indirimle kaç TL'ye satılır?",
    options: ["140 TL", "160 TL", "170 TL", "180 TL"],
    answerIndex: 0,
    explanation: "Fiyatın %70'i: 200 × 0,70 = 140 TL.",
  };

  it("açıklaması 140 TL'ye varan ikinci sorunun anahtarı 155 TL'deyse reddedilir; hizalanınca kabul", () => {
    const review = {
      prompt: "Etiket fiyatı 175 TL olan ürün %20 indirimle kaç TL'ye satılır?",
      options: ["140 TL", "155 TL", "135 TL", "145 TL"],
      answerIndex: 1,
      explanation: "Kalan %80: 175 × 0,80 = 140 TL.",
    };
    const problems = reviewItemProblems({ ...base, review });
    expect(problems.some((problem) => /açıklaması 140 sonucuna varıyor ama answerIndex '155 TL'/.test(problem))).toBe(true);
    expect(acceptReviewVariant({ ...base, review })).toBeNull();
    const [settled] = settleCheckKeys([screenOf({ ...base, review } as SectionCheck)]);
    const check = settled!.blocks.find((block) => block.type === "check");
    const aligned = check && check.type === "check" ? check.check : null;
    expect(aligned?.review?.answerIndex).toBe(0);
    expect(reviewItemProblems(aligned as never)).toEqual([]);
    expect(acceptReviewVariant(aligned as never)?.full).toBe(true);
  });
});

/* ───────────── Sayı okuyucuları ───────────── */

describe("Paket H · sayı okuyucuları tek yerde", () => {
  it("normalize: Unicode eksi, işaret yerindeki uzun tire, binlik noktası, ondalık virgül; aralık tiresi kalır", () => {
    expect(normalizeNumberText("−2,5")).toBe("-2.5");
    expect(normalizeNumberText("= –3")).toBe("= -3");
    expect(normalizeNumberText("3.500 TL")).toBe("3500 TL");
    expect(normalizeNumberText("0.500 mol")).toBe("0.500 mol");
    expect(normalizeNumberText("8–12 mm")).toBe("8–12 mm");
    expect(numbersIn("8–12 mm")).toEqual([8, 12]);
    expect(numbersIn("x-2 = 5 ve 3-5 arası")).toEqual([2, 5, 3, 5]);
    expect(numbersIn("Z-skoru −2,5")).toEqual([-2.5]);
  });

  it("şık değerleri: kesir ve ondalık aynı değer; grade.ts aynı adları dışa aktarır", () => {
    expect(optionValueIndexes(["3/2", "1,5 cm", "2", "0,5"], 1.5)).toEqual([0, 1]);
    expect(claimedResults("x = 3/2 çünkü 2x = 3")).toContain(1.5);
    expect(finalResults("Pmax = 24^2 / (4*12) = 10 W", "Pmax = Vth^2 / (4 Rth) = 12 W")).toEqual([10]);
    // Kesirli şık ondalık sonuçla eşlenir; "2x = 3 ise x = 3/2" ise iki şık değeri (2 ve 3) taşıdığı için okunmaz.
    expect(explanationAnswerMismatch({ options: ["3/2", "2", "3", "6"], keyed: [1], explanation: "x = 1,5." })).toMatchObject({ expected: "3/2", value: 1.5 });
    expect(explanationAnswerMismatch({ options: ["3/2", "2", "3", "6"], keyed: [1], explanation: "2x = 3 ise x = 3/2." })).toBeNull();
  });
});

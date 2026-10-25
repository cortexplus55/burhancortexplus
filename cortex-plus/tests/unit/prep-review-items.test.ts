import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { istanbulDay } from "@/lib/istanbul-day";
import { oralItemReviewable, type OralItemGrade } from "@/lib/learning/oral-exam";
import {
  REVIEW_CAPS,
  gradeReviewAnswer,
  interleaveDue,
  nextReviewStep,
  readStoredReviewItem,
  reviewAfterLine,
  reviewDraftsFromAttempt,
  reviewDueOn,
  reviewPromptKey,
  reviewReveal,
  reviewScheduledLine,
  sealReviewItem,
  servedForm,
  type ReviewItemRow,
  type StoredReviewItem,
} from "@/lib/learning/review-items";

/**
 * Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): yanlışlar ve dersin sınav noktaları
 * 1-3-7-14 gün sonra (sınav gününden önceye sınırlı) kendiliğinden yeniden sorulur; hazırlık
 * sayfasında "Bugün N tekrar"; yolu kilitlemez. Öğe denetlenmiş sorunun kopyası: metin yeniden
 * yazılmaz, yalnız şık sırası karışır; cevap sunucuda notlanır.
 */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const TODAY = "2026-10-20";
const ATTEMPT = "att-1";

describe("merdiven ve sınav günü", () => {
  it("1-3-7-14 gün; sınavdan önceki güne sınırlı; sınav yarınsa sınav günü; sınav geçtiyse yok", () => {
    expect([0, 1, 2, 3].map((step) => reviewDueOn({ today: TODAY, step, examDate: null }))).toEqual([
      "2026-10-21",
      "2026-10-23",
      "2026-10-27",
      "2026-11-03",
    ]);
    expect(reviewDueOn({ today: TODAY, step: 2, examDate: "2026-10-25" })).toBe("2026-10-24");
    expect(reviewDueOn({ today: TODAY, step: 3, examDate: "2026-10-21" })).toBe("2026-10-21");
    expect(reviewDueOn({ today: TODAY, step: 0, examDate: TODAY })).toBeNull();
    expect(reviewDueOn({ today: TODAY, step: 0, examDate: "2026-10-01" })).toBeNull();
    // Basamak 0..3 dışına taşmaz.
    expect(reviewDueOn({ today: TODAY, step: 9, examDate: null })).toBe("2026-11-03");
  });

  it("doğru bir basamak çıkar, 14. günde doğru öğrenildi; yanlış yarına; sınav geçince çıkar", () => {
    // Gün İstanbul'dan: UTC 22:30 Türkiye'de ertesi gün.
    const today = istanbulDay(new Date("2026-10-20T22:30:00Z"));
    expect(today).toBe("2026-10-21");
    expect(nextReviewStep({ step: 0, correct: true, today, examDate: null })).toMatchObject({
      step: 1,
      dueOn: "2026-10-25",
      status: "active",
    });
    expect(nextReviewStep({ step: 3, correct: true, today, examDate: null })).toMatchObject({
      step: 3,
      dueOn: null,
      status: "learned",
    });
    expect(nextReviewStep({ step: 2, correct: false, today, examDate: null })).toMatchObject({
      step: 0,
      dueOn: "2026-10-22",
      status: "active",
    });
    expect(nextReviewStep({ step: 1, correct: true, today, examDate: today })).toMatchObject({ status: "expired", dueOn: null });
  });
});

const mcqPlain = {
  type: "mcq" as const,
  prompt: "İlk iki yılda beyin büyümesine en çok hangi ölçüm ipucu verir?",
  options: ["Boy", "Kilo", "Baş çevresi", "Göğüs çevresi"],
  answerIndex: 2,
  explanation: "Baş çevresi beyin büyümesini yansıtır.",
  optionWhy: ["Boy kronik süreci gösterir.", "Kilo akut süreci gösterir.", "Beyin büyümesini yansıtır.", "Rutin izlenmez."],
  // Yazarın tam ikinci sorusu (20 Ekim 2026): kendi şıkları ve anahtarı; doğru şık ana sorunun doğru şıkkıyla aynı.
  review: {
    prompt: "Bir bebekte beyin büyümesini izlemek için hangi ölçüme bakılır?",
    options: ["Kilo", "Baş çevresi", "Boy", "Göğüs çevresi"],
    answerIndex: 1,
    explanation: "Baş çevresi ilk iki yılda beyin büyümesini yansıtır; kilo akut, boy kronik süreci gösterir.",
  },
};

const mcqExam = {
  type: "mcq" as const,
  prompt: "Büyüme hangi eğri üzerinde izlenir?",
  options: ["Persentil eğrisi", "Isı eğrisi", "Doz eğrisi"],
  answerIndex: 0,
  explanation: "Boy ve kilo persentil eğrisinde izlenir.",
};

const tfRemember = {
  type: "trueFalse" as const,
  prompt: "İlk haftada %10'a kadar kilo kaybı normaldir.",
  options: ["Doğru", "Yanlış"],
  answerIndex: 0,
  explanation: "Yenidoğanda ilk hafta %10'a kadar kayıp fizyolojiktir.",
};

const numerical = {
  type: "numerical" as const,
  prompt: "Doğum ağırlığı 5. ayda kaç katına çıkar?",
  answer: "2",
  explanation: "Doğum ağırlığı 5. ayda iki katına çıkar.",
};

function screen(heading: string, blocks: unknown[]) {
  return { heading, blocks };
}

const lesson = {
  format: 3,
  title: "Büyüme Değerlendirmesi",
  screens: [
    screen("Persentil", [
      { type: "text", text: "Boy ve kilo ==persentil eğrisinde== izlenir; tek ölçüm yetmez." },
      { type: "check", check: mcqExam },
    ]),
    screen("Baş çevresi", [
      { type: "text", text: "Baş çevresi ilk iki yılda beyin büyümesini yansıtır." },
      { type: "check", check: mcqPlain },
    ]),
    screen("Kilo kaybı", [
      { type: "note", note: { title: "Akılda tut", body: "İlk haftada %10'a kadar kayıp normaldir.", tone: "remember" } },
      { type: "check", check: tfRemember },
    ]),
    screen("Genel bilgi", [
      { type: "note", note: { title: "Genel bilgi: aşı", body: "Aşı takvimi ülkeye göre değişir.", tone: "general" } },
      { type: "check", check: { ...mcqExam, prompt: "Genel bilgi kutusunda anlatılan takvim hangisidir?" } },
    ]),
    screen("Sayısal", [
      { type: "text", text: "Doğum ağırlığı ==5. ayda iki katına== çıkar." },
      { type: "check", check: numerical },
    ]),
  ],
};

describe("taslaklar: ders", () => {
  it("ilk cevap yanlış → yanlış; doğru ve sınav noktalı ekran → sınav noktası; düz ve genel ekran, sayısal soru → hiçbir şey", () => {
    const drafts = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "lesson",
      payload: { type: "lesson", lesson },
      answers: { lessonAnswers: { 0: { pick: 0 }, 1: { pick: 0 }, 2: { pick: 0 }, 3: { pick: 0 }, 4: { text: "2" } } },
      topicLabel: "Büyüme",
    });
    expect(drafts.map((draft) => [draft.sourceRef, draft.reason])).toEqual([
      [`${ATTEMPT}:lesson_check:0`, "exam_point"],
      [`${ATTEMPT}:lesson_check:1`, "miss"],
      [`${ATTEMPT}:lesson_check:2`, "exam_point"],
    ]);
    const miss = drafts[1]!.item as Extract<StoredReviewItem, { mode: "choice" }>;
    // Kod metne dokunmaz: kök, şıklar ve doğru cevap yazarınki, bayt bayt.
    expect(miss.prompt).toBe(mcqPlain.prompt);
    expect(miss.options).toEqual(mcqPlain.options);
    expect(miss.correct).toEqual(["Baş çevresi"]);
    expect(miss.optionWhy?.["Baş çevresi"]).toBe("Beyin büyümesini yansıtır.");
    // Yazarın tam ikinci sorusu kabul kuralından geçerse saklanır; doğru cevabı aynı metin.
    expect(miss.variant?.prompt).toBe(mcqPlain.review.prompt);
    expect([...(miss.variant?.options ?? [])].sort()).toEqual([...mcqPlain.review.options].sort());
    expect(miss.variant?.correct).toEqual(["Baş çevresi"]);
    // Tekrar kökü olmayan soruda varyant yok.
    expect((drafts[0]!.item as { variant?: unknown }).variant).toBeUndefined();
    expect((drafts[2]!.item as { trueFalse?: boolean }).trueFalse).toBe(true);
  });

  it("yalnız kökü olan eski ikinci soru varyant olmaz: anahtarı doğrulanamaz (20 Ekim 2026 ikinci soru hatası)", () => {
    const legacy = { ...mcqPlain, review: { prompt: mcqPlain.review.prompt } };
    const drafts = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "lesson",
      payload: { type: "lesson", lesson: { title: "Büyüme", format: 3, screens: [screen("Baş çevresi", [{ type: "text", text: "Baş çevresi beyin büyümesini yansıtır." }, { type: "check", check: legacy }])] } },
      answers: { lessonAnswers: { 0: { pick: 0 } } },
      topicLabel: "Büyüme",
    });
    expect(drafts).toHaveLength(1);
    expect((drafts[0]!.item as { variant?: unknown }).variant).toBeUndefined();
  });

  it("tekrarda doğru olsa da ilk cevap sayılır; sınav noktası ders başına en çok 3; eski istemcinin kaçan listesi", () => {
    const examScreens = Array.from({ length: 5 }, (_, index) =>
      screen(`Kavram ${index}`, [
        { type: "text", text: `Kavram ${index}: ==sınavda sorulan bilgi ${index}== burada.` },
        { type: "check", check: { ...mcqExam, prompt: `${index}. kavramda büyüme hangi eğride izlenir?` } },
      ]),
    );
    const capped = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "lesson",
      payload: { type: "lesson", lesson: { ...lesson, screens: examScreens } },
      answers: { lessonAnswers: Object.fromEntries(examScreens.map((_, index) => [index, { pick: 0 }])) },
      topicLabel: null,
    });
    expect(capped.filter((draft) => draft.reason === "exam_point")).toHaveLength(REVIEW_CAPS.examPointsPerLesson);

    const retried = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "lesson",
      payload: { type: "lesson", lesson },
      answers: { lessonAnswers: { 1: { pick: 1 } }, retryAnswers: { 1: { pick: 2 } } },
      topicLabel: null,
    });
    expect(retried.map((draft) => draft.reason)).toEqual(["miss"]);

    const legacy = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "lesson",
      payload: { type: "lesson", lesson },
      answers: { lessonMisses: [1] },
      topicLabel: null,
    });
    expect(legacy.map((draft) => [draft.sourceRef, draft.reason])).toEqual([[`${ATTEMPT}:lesson_check:1`, "miss"]]);
  });
});

describe("taslaklar: test, doğru/yanlış, kart, sözlü", () => {
  const quizPayload = {
    type: "quiz",
    questions: [
      { text: "Hangisi bir sera gazıdır?", options: ["Azot", "Karbondioksit", "Argon"], correct: "Karbondioksit", explanation: "CO₂ ısıyı tutar.", optionWhy: ["Azot ısıyı tutmaz.", "CO₂ ısıyı tutar.", "Argon soygazdır."] },
      { text: "Hangisi soygazdır?", options: ["Argon", "Oksijen"], correct: "Argon" },
      { text: "Hangileri asittir?", options: ["HCl", "NaOH", "HNO3"], correct: ["HCl", "HNO3"], multi: true },
    ],
  };

  it("test: yanlış cevap modelin metniyle ve doğru cevap metniyle; cevapsız ve yeniden kullanılmış sorular atlanır", () => {
    const drafts = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "quiz",
      payload: quizPayload,
      answers: { 0: "Azot", 2: ["HCl"] },
      topicLabel: "Atmosfer",
    });
    expect(drafts.map((draft) => draft.sourceRef)).toEqual([`${ATTEMPT}:quiz:0`, `${ATTEMPT}:quiz:2`]);
    expect(drafts[0]!.item).toMatchObject({
      mode: "choice",
      prompt: "Hangisi bir sera gazıdır?",
      options: ["Azot", "Karbondioksit", "Argon"],
      correct: ["Karbondioksit"],
      multi: false,
      optionWhy: { Azot: "Azot ısıyı tutmaz.", Karbondioksit: "CO₂ ısıyı tutar.", Argon: "Argon soygazdır." },
    });
    expect(drafts[1]!.item).toMatchObject({ correct: ["HCl", "HNO3"], multi: true });
    expect(
      reviewDraftsFromAttempt({ attemptId: ATTEMPT, kind: "focused", payload: { ...quizPayload, reused: true }, answers: { 0: "Azot" }, topicLabel: null }),
    ).toEqual([]);
    // Yazılı deneme (v1): kayda girmez.
    expect(
      reviewDraftsFromAttempt({ attemptId: ATTEMPT, kind: "written_exam", payload: quizPayload, answers: { 0: "Azot" }, topicLabel: null }),
    ).toEqual([]);
  });

  it("doğru/yanlış türünü korur; kart 'Hayır' hatırlama öğesi; sunumda eklenen kart atlanır", () => {
    const tf = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "true_false",
      payload: {
        type: "true_false",
        items: [
          { text: "Su 50 °C'de kaynar.", correct: false, explanation: "Deniz seviyesinde 100 °C.", correctedStatement: "Su deniz seviyesinde 100 °C'de kaynar." },
          { text: "Buz 0 °C'de erir.", correct: true, explanation: "Erime noktası 0 °C." },
        ],
      },
      answers: { 0: "true", 1: true },
      topicLabel: null,
    });
    expect(tf).toHaveLength(1);
    expect(tf[0]).toMatchObject({ sourceRef: `${ATTEMPT}:true_false:0`, sourceKind: "true_false" });
    expect(tf[0]!.item).toMatchObject({ options: ["Doğru", "Yanlış"], correct: ["Yanlış"], trueFalse: true, corrected: "Su deniz seviyesinde 100 °C'de kaynar." });

    const cards = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "flashcards",
      payload: { type: "cards", cards: [{ front: "Mitoz kaç hücre verir?", back: "İki özdeş hücre." }, { front: "Mayoz?", back: "Dört hücre." }] },
      // 2. dizin sunumda eklenen tekrar kartı: kayıtlı destede yok.
      answers: { 0: false, 1: true, 2: false },
      topicLabel: "Hücre",
    });
    expect(cards).toEqual([
      expect.objectContaining({ sourceKind: "card", sourceRef: `${ATTEMPT}:card:0`, item: { mode: "recall", front: "Mitoz kaç hücre verir?", back: "İki özdeş hücre." } }),
    ]);
  });

  it("sözlü: denetlenmiş çözümü olan yanlış hatırlama öğesi; doğrulanamayan ya da puan etiketi atlanır", () => {
    const base: OralItemGrade = {
      index: 0,
      question: "Fotosentezin ürünleri nelerdir?",
      answer: "Bilmiyorum",
      ratio: 0,
      verdict: "yanlis",
      right: "",
      gap: "",
      missing: [],
      modelAnswer: "Glikoz ve oksijen üretilir.",
      citation: null,
      dontKnow: true,
      numericIssue: null,
      objective: "",
    };
    expect(oralItemReviewable(base)).toBe(true);
    expect(oralItemReviewable({ ...base, modelAnswer: "Doğrulanamadı" })).toBe(false);
    expect(oralItemReviewable({ ...base, modelAnswer: "Tam 10" })).toBe(false);
    expect(oralItemReviewable({ ...base, verdict: "dogru" })).toBe(false);
    const report = {
      fullCount: 0,
      total: 2,
      pct: 0,
      items: [base, { ...base, index: 1, question: "Klorofil nerede bulunur?", modelAnswer: "Doğrulanamadı" }],
      strengths: [],
      weaknesses: [],
      missingObjectives: [],
      correctIndices: [],
      nextStep: null,
    };
    const drafts = reviewDraftsFromAttempt({ attemptId: ATTEMPT, kind: "oral", payload: { type: "oral" }, answers: {}, topicLabel: null, oralReport: report });
    expect(drafts).toEqual([
      expect.objectContaining({ sourceKind: "oral", sourceRef: `${ATTEMPT}:oral:0`, item: { mode: "recall", front: base.question, back: base.modelAnswer } }),
    ]);
  });

  it("uzun vaka sorusu da yazılır ve okunur; okunamayacak öğe hiç yazılmaz (sayılıp sorulamazdı)", () => {
    const vignette = `${"Otuz iki yaşında bir hasta acile başvuruyor ve ".repeat(20)}en olası tanı hangisidir?`;
    const drafts = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "quiz",
      payload: {
        type: "quiz",
        questions: [
          { text: vignette, options: ["Apandisit", "Kolesistit"], correct: "Apandisit" },
        ],
      },
      answers: { 0: "Kolesistit" },
      topicLabel: null,
    });
    expect(drafts).toHaveLength(1);
    expect(readStoredReviewItem(drafts[0]!.item)).not.toBeNull();
    const broken = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "true_false",
      payload: { type: "true_false", items: [{ text: "x".repeat(5000), correct: true }] },
      answers: { 0: false },
      topicLabel: null,
    });
    expect(broken).toEqual([]);
  });

  it("anahtar kök + doğru cevaptan; vurgu ve boşluk fark etmez; kısa (adres satırı şişmesin)", () => {
    const item: StoredReviewItem = { mode: "choice", prompt: "  **Hangisi**  soygazdır? ", options: ["Argon", "Azot"], correct: ["Argon"], multi: false };
    const key = reviewPromptKey(item);
    // Yalnız özet: `.in()` süzgecinde tırnak/ters bölü/parantez bozmasın (20 Ekim inceleme).
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(reviewPromptKey({ ...item, prompt: "Hangisi soygazdır?", options: ["Azot", "Argon"] })).toBe(key);
    expect(reviewPromptKey({ ...item, correct: ["Azot"] })).not.toBe(key);
    const long: StoredReviewItem = { mode: "recall", front: "ş".repeat(400), back: "ğ".repeat(400) };
    expect(reviewPromptKey(long).length).toBeLessThanOrEqual(65);
  });
});

const choiceItem: StoredReviewItem = {
  mode: "choice",
  prompt: "Hangisi bir sera gazıdır?",
  options: ["Azot", "Karbondioksit", "Argon", "Neon"],
  correct: ["Karbondioksit"],
  multi: false,
  explanation: "CO₂ ısıyı tutar.",
  optionWhy: { Azot: "Isıyı tutmaz.", Karbondioksit: "Isıyı tutar." },
  variant: { prompt: "Isıyı tutan gaz hangisidir?", options: ["Neon", "Argon", "Karbondioksit", "Azot"], correct: ["Karbondioksit"] },
};

function row(overrides: Partial<ReviewItemRow> = {}): ReviewItemRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    topic_label: "Atmosfer",
    source_kind: "quiz",
    reason: "miss",
    item: choiceItem,
    interval_step: 0,
    due_on: TODAY,
    status: "active",
    ask_count: 1,
    lapse_count: 0,
    ...overrides,
  };
}

describe("mühür ve not", () => {
  it("istemciye doğru cevap, açıklama ve gerekçe gitmez; şıklar aynı küme, sıra öğe + soruluşa bağlı", () => {
    const sealed = sealReviewItem(row())!;
    expect(sealed).not.toHaveProperty("correct");
    expect(sealed).not.toHaveProperty("explanation");
    expect(sealed).not.toHaveProperty("optionWhy");
    expect(JSON.stringify(sealed)).not.toContain("Isıyı tutar");
    if (sealed.mode !== "choice") throw new Error("choice");
    expect([...sealed.options].sort()).toEqual([...choiceItem.options].sort());
    expect(sealReviewItem(row())).toEqual(sealed);
    const orders = new Set([1, 3, 5, 7, 9].map((askCount) => JSON.stringify((sealReviewItem(row({ ask_count: askCount })) as { options: string[] }).options)));
    expect(orders.size).toBeGreaterThan(1);
    // Çift soruluşta yazarın tekrar kökü, tekte orijinal.
    expect((sealReviewItem(row({ ask_count: 0 })) as { prompt: string }).prompt).toBe("Isıyı tutan gaz hangisidir?");
    expect(sealed.prompt).toBe("Hangisi bir sera gazıdır?");
    expect(servedForm(choiceItem, 2)?.variant).toBe(true);
  });

  it("doğru/yanlış şıkları karışmaz; bozuk kayıt sessizce düşer", () => {
    const tf: StoredReviewItem = { mode: "choice", prompt: "Su 50 °C'de kaynar.", options: ["Yanlış", "Doğru"], correct: ["Yanlış"], multi: false, trueFalse: true };
    expect((sealReviewItem(row({ item: tf, ask_count: 4 })) as { options: string[] }).options).toEqual(["Doğru", "Yanlış"]);
    expect(sealReviewItem(row({ item: { mode: "choice", prompt: "Bozuk", options: ["A"], correct: ["A"], multi: false } }))).toBeNull();
    expect(readStoredReviewItem({ mode: "choice", prompt: "Doğru şık listede yok?", options: ["A", "B"], correct: ["C"], multi: false })).toBeNull();
  });

  it("not: çok cevaplıda küme eşitliği; şık dışı seçim yanlış; boş seçim geçersiz; hatırlama evet/hayır", () => {
    const multi: StoredReviewItem = { mode: "choice", prompt: "Hangileri asittir?", options: ["HCl", "NaOH", "HNO3"], correct: ["HCl", "HNO3"], multi: true };
    expect(gradeReviewAnswer(multi, 1, { pick: ["HNO3", "HCl"] })).toBe(true);
    expect(gradeReviewAnswer(multi, 1, { pick: ["HCl"] })).toBe(false);
    expect(gradeReviewAnswer(choiceItem, 1, { pick: "Karbondioksit" })).toBe(true);
    expect(gradeReviewAnswer(choiceItem, 1, { pick: "Metan" })).toBe(false);
    expect(gradeReviewAnswer(choiceItem, 1, {})).toBeNull();
    const recall: StoredReviewItem = { mode: "recall", front: "Mitoz?", back: "İki hücre." };
    expect(gradeReviewAnswer(recall, 0, { recalled: true })).toBe(true);
    expect(gradeReviewAnswer(recall, 0, { recalled: false })).toBe(false);
    expect(gradeReviewAnswer(recall, 0, { pick: "x" })).toBeNull();
  });

  it("cevaptan sonra: doğru şık, açıklama, sunulan şıkların gerekçesi; 'Doğrusu' yalnız orijinal kökte", () => {
    expect(reviewReveal(choiceItem, 1)).toEqual({
      correctAnswers: ["Karbondioksit"],
      explanation: "CO₂ ısıyı tutar.",
      optionWhy: { Azot: "Isıyı tutmaz.", Karbondioksit: "Isıyı tutar." },
    });
    const tf: StoredReviewItem = { ...choiceItem, corrected: "Doğrusu bu." };
    expect(reviewReveal(tf, 1)).toHaveProperty("corrected", "Doğrusu bu.");
    expect(reviewReveal(tf, 0)).not.toHaveProperty("corrected");
  });
});

describe("sıra ve metinler", () => {
  it("önce yanlışlar, en çok kaçan önde; konular arasında sırayla; sınav noktaları sonda", () => {
    const rows = [
      row({ id: "a", topic_label: "A", reason: "exam_point" }),
      row({ id: "b", topic_label: "A", lapse_count: 2 }),
      row({ id: "c", topic_label: "A" }),
      row({ id: "d", topic_label: "B", due_on: "2026-10-18" }),
      row({ id: "e", topic_label: "B", due_on: "2026-10-19" }),
    ];
    expect(interleaveDue(rows).map((item) => item.id)).toEqual(["b", "d", "c", "e", "a"]);
  });

  it("cevap satırı ve sonuç ekranı satırı gerçeği söyler", () => {
    const base = { mode: "choice" as const, today: TODAY };
    expect(reviewAfterLine({ ...base, correct: true, status: "active", dueOn: "2026-10-23" })).toBe("Doğru · 3 gün sonra yeniden");
    expect(reviewAfterLine({ ...base, correct: true, status: "learned", dueOn: null })).toBe("Doğru · bu soru öğrenildi");
    expect(reviewAfterLine({ ...base, correct: false, status: "active", dueOn: "2026-10-21" })).toBe("Yanlış · yarın yeniden sorulacak");
    expect(reviewAfterLine({ ...base, correct: true, status: "expired", dueOn: null })).toBe("Sınav günü geldi; bu soru tekrar listesinden çıktı");
    expect(reviewAfterLine({ ...base, mode: "recall", correct: false, status: "active", dueOn: "2026-10-21" })).toBe("Hatırlamadın · yarın yeniden sorulacak");
    expect(reviewScheduledLine(0)).toBeNull();
    expect(reviewScheduledLine(1, "quiz")).toBe("Yanlış yaptığın soru yarın yeniden sorulacak.");
    expect(reviewScheduledLine(3, "lesson")).toBe("Yanlış yaptığın 3 soru yarın yeniden sorulacak.");
    expect(reviewScheduledLine(2, "flashcards")).toBe("Hatırlamadığın 2 kart yarın yeniden sorulacak.");
  });
});

describe("bekçi: kaynak", () => {
  it("çekirdek kodla kök kurmaz; teacher-brain'in kök kuran yardımcıları içeri alınmaz", () => {
    const core = read("src/lib/learning/review-items.ts");
    expect(core).not.toContain("reviewQuestionFor");
    expect(core).not.toContain("rewordPracticeQuestion");
    expect(core).not.toMatch(/generateJson|openai|server-only/);
  });

  it("node rotası: tekrar kaydı tamamlama RPC'sinden sonra, kendi kabuğunda; RPC ya da yeni sorgu yok", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    const call = route.indexOf("scheduleReviewsAfterComplete(service");
    expect(call).toBeGreaterThan(route.indexOf('service.rpc("complete_exam_prep_node"'));
    expect(route.slice(call, call + 700)).toContain(".catch(() => 0)");
    expect(route.slice(call, call + 700)).not.toContain(".rpc(");
    expect(route).toContain("reviewScheduled,");
    const store = read("src/lib/learning/review-items-store.ts");
    expect(store).toContain("isFeatureEnabled(service, SPACED_REVIEW_FLAG)");
    expect(store).not.toContain(".rpc(");
    // Önceden yazım tekrar yazmaz: kayıt yalnız "complete" kolunda, tek yerde.
    expect(route.indexOf('if (action === "complete")')).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(route.indexOf('if (action === "complete")'));
    expect(route.match(/scheduleReviewsAfterComplete\(service/g)).toHaveLength(1);
  });

  it("özellik anahtarı tek ad; göç aynı anahtarı açık ekler; hesap silme ve şema yoklaması tabloyu bilir", () => {
    expect(read("src/lib/admin/feature-flags.ts")).toContain('export const SPACED_REVIEW_FLAG = "spaced_review";');
    expect(read("supabase/migrations/20261020160000_prep_review_items.sql")).toContain("VALUES ('spaced_review', true,");
    expect(read("src/app/admin/feature-flags/page.tsx")).toContain('key: "spaced_review"');
    expect(read("src/lib/privacy/account-deletion.ts")).toContain('"exam_prep_review_items"');
    expect(read("src/lib/admin/schema-probe.ts")).toContain('hasTable(service, "exam_prep_review_items")');
  });

  it("tekrar sayfası: force-dynamic, Suspense ve loading.tsx yok, önceden yazım tetiklemez", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/tekrar/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toContain("<Suspense");
    expect(page).not.toMatch(/requestPrepPrefetch|requestNextPrefetch|useSearchParams/);
    expect(page).toContain('chrome="session"');
    expect(existsSync("src/app/deneme-sinavlari/[prepId]/tekrar/loading.tsx")).toBe(false);
  });

  it("hazırlık sayfası sayıyı anahtar arkasından okur; hatırlatma yeni cron açmaz", () => {
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain("dueReviews={await dueReviewCountForPrep(service");
    expect(read("src/lib/learning/review-items-store.ts")).toMatch(/dueReviewCountForPrep[\s\S]*SPACED_REVIEW_FLAG/);
    const cron = read("src/app/api/cron/study-reminders/route.ts");
    expect(cron).toContain("isFeatureEnabled(service, SPACED_REVIEW_FLAG)");
    expect(cron).toContain('.from("exam_prep_review_items")');
    const vercel = JSON.parse(read("vercel.json")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
  });
});

describe("göç (gerçek PostgreSQL)", () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";
  const prep = "22222222-2222-4222-8222-222222222222";
  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.exam_preps(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id));
      CREATE TABLE public.feature_flags(key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text,
        updated_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO public.profiles VALUES ('${user}');
      INSERT INTO public.exam_preps VALUES ('${prep}', '${user}');`);
    await db.exec(read("supabase/migrations/20261020160000_prep_review_items.sql"));
  }, 30_000);
  afterAll(() => db.close());

  const insert = (values: Record<string, unknown> = {}) => {
    const row = {
      user_id: user,
      exam_prep_id: prep,
      source_kind: "quiz",
      reason: "miss",
      source_ref: "a:quiz:0",
      prompt_key: "hangisi?|argon",
      item: JSON.stringify(choiceItem),
      due_on: "2026-10-21",
      ...values,
    };
    const keys = Object.keys(row);
    return db.query(
      `INSERT INTO exam_prep_review_items(${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(row),
    );
  };

  it("kısıtlar: durum, basamak, sayaçlar, hazırlık başına tek soru; hazırlık silinince gider", async () => {
    await insert();
    await expect(insert({ prompt_key: "baska|soru", status: "done" })).rejects.toThrow();
    await expect(insert({ prompt_key: "baska|soru", interval_step: 4 })).rejects.toThrow();
    await expect(insert({ prompt_key: "baska|soru", ask_count: 1, correct_count: 2 })).rejects.toThrow();
    await expect(insert({ prompt_key: "baska|soru", reason: "learned" })).rejects.toThrow();
    await expect(insert({ prompt_key: "baska|soru", source_kind: "podcast" })).rejects.toThrow();
    await expect(insert()).rejects.toThrow();
    const status = await db.query<{ status: string; interval_step: number }>("SELECT status, interval_step FROM exam_prep_review_items");
    expect(status.rows).toEqual([{ status: "active", interval_step: 0 }]);
    await db.query("DELETE FROM exam_preps WHERE id = $1", [prep]);
    const left = await db.query("SELECT 1 FROM exam_prep_review_items");
    expect(left.rows).toHaveLength(0);
  });

  it("satır güvenliği açık, politika yok (yalnız service_role); anahtar açık gelir", async () => {
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'exam_prep_review_items'");
    expect(rls.rows).toEqual([{ relrowsecurity: true }]);
    const policies = await db.query("SELECT 1 FROM pg_policies WHERE tablename = 'exam_prep_review_items'");
    expect(policies.rows).toHaveLength(0);
    const flag = await db.query<{ enabled: boolean }>("SELECT enabled FROM feature_flags WHERE key = 'spaced_review'");
    expect(flag.rows).toEqual([{ enabled: true }]);
    expect(read("supabase/migrations/20261020160000_prep_review_items.sql")).not.toMatch(/DROP POLICY|schema_migrations/i);
  });
});

describe("22 Ekim 2026 inceleme: testedTopic", () => {
  it("hazırlık geneli düğümün tekrar satırı sorulan konunun adını alır", () => {
    const drafts = reviewDraftsFromAttempt({
      attemptId: ATTEMPT,
      kind: "final_check",
      payload: { type: "quiz", testedTopic: "Basınç", questions: [{ text: "Hangisi soygazdır?", options: ["Argon", "Oksijen"], correct: "Argon" }] },
      answers: { 0: "Oksijen" },
      topicLabel: "Isı",
    });
    expect(drafts.map((draft) => draft.topicLabel)).toEqual(["Basınç"]);
  });
});

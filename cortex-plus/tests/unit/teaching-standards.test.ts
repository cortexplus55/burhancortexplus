import { describe, expect, it } from "vitest";
import {
  appendLessonReviewCards,
  cardsFromLessonReviews,
  extractMisconceptions,
  lessonMissDrafts,
  prepareLessonDraft,
  parseSessionMeta,
  scoreFlashcardsV2,
  teachingActivityForKind,
  teachingSessionContext,
  teachingStandardConstraints,
  validateFlashcardPedagogy,
  blockingLessonIssues,
  brokenSuperscript,
  dropScaffoldSections,
  emptyMistake,
  isScaffoldHeading,
  lessonPublishIssues,
  lessonV2Schema,
  validateLessonPedagogy,
  validateLessonV2,
  validateOralPedagogy,
  validatePodcastPedagogy,
  validateQuizPedagogy,
  validateTrueFalsePedagogy,
} from "@/lib/learning/teaching-standards";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

describe("teaching standards contract", () => {
  it("maps node kinds to activities", () => {
    expect(teachingActivityForKind("qa")).toBe("intro_qa");
    expect(teachingActivityForKind("spaced")).toBe("flashcards");
    expect(teachingActivityForKind("written_exam")).toBe("written");
    expect(teachingActivityForKind("quiz")).toBe("quiz");
  });

  it("builds session context from Stage 4 meta", () => {
    const meta = parseSessionMeta({
      topicTitle: "Trigonometri",
      objective: "Birim çemberi öğren",
      sourcePages: [3, 4],
      role: "learn",
      durationMinutes: 25,
    });
    const ctx = teachingSessionContext(meta, "Yedek");
    expect(ctx).toContain("Trigonometri");
    expect(ctx).toContain("Birim çemberi öğren");
    expect(ctx).toContain("3, 4");
    expect(teachingStandardConstraints("lesson")).toContain("yaygın hata");
  });

  it("validates lesson v2 structure", () => {
    const good = {
      title: "Birim çember",
      objective: "Birim çember üzerinde açıları okuyabilmek",
      overview: "Birim çember, merkezi orijinde olan ve yarıçapı 1 olan çemberdir.",
      sections: [
        {
          heading: "Açı Ölçüsü Neyi Sayar",
          body: "Açı ölçüsü yay uzunluğu ile ilişkilidir ve **derece** veya **radyan** ile ifade edilir.",
          check: {
            type: "mcq" as const,
            prompt: "Radyan neyi ölçer?",
            options: ["Yay uzunluğunu", "Alanı", "Çevreyi"],
            answerIndex: 0,
            explanation: "Metinde açı ölçüsünün yay uzunluğuyla ilişkili olduğu söylendi.",
          },
        },
        {
          heading: "Koordinat Nasıl Okunur",
          body: "Önce açı yönünü belirle, sonra kesişim noktasının koordinatlarını oku.",
          check: {
            type: "trueFalse" as const,
            prompt: "Önce koordinat, sonra yön okunur.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Sıra tersidir: önce yön, sonra koordinat.",
          },
        },
        {
          heading: "Sinüs ve Kosinüsü Ayırt Etmek",
          body: "Koordinatları (cos θ, sin θ) olarak hatırla ve sonraki alıştırmaya geç.",
          check: {
            type: "mcq" as const,
            prompt: "Birim çemberde y koordinatı hangisidir?",
            options: ["sin θ", "cos θ", "tan θ"],
            answerIndex: 0,
            explanation: "cos θ x koordinatıdır; y koordinatı sin θ'dır.",
          },
        },
      ],
      example: { prompt: "90° noktası neresi?", solution: "Nokta (0, 1) olur." },
      commonMistake: {
        claim: "sin ve cos yer değiştirir",
        correction: "x = cos θ, y = sin θ",
      },
      infoCheck: { prompt: "0° noktası neresidir?", answer: "(1, 0)" },
      findError: {
        prompt: "Hangi cümle yanlıştır?",
        faultyText: "Birim çemberde x sinüs, y kosinüstür.",
        options: ["x sinüs yazılmış", "yarıçap bir yazılmış"],
        answerIndex: 0,
        explanation: "x kosinüstür; sinüs ile kosinüsü yer değiştirmek sık hatadır.",
      },
      summary: [
        "Yarıçapı bir olan çemberde x kosinüs, y sinüstür.",
        "Açı yönü okunmadan koordinat okunmaz.",
        "Sık hata sin ile cos yer değiştirmektir.",
      ],
      nextFocus: ["Özel açılar"],
    };
    expect(validateLessonPedagogy(good)).toEqual([]);
    expect(validateLessonPedagogy({ title: "x" }).length).toBeGreaterThan(0);

    // Bölüm kontrolü isteğe bağlı; varsa cevabı seçenekler içinde olmalı ve
    // şıklar birbirinden farklı, dolgu olmayan gerçek çeldiriciler olmalı.
    const withCheck = (check: unknown) => ({
      ...good,
      sections: [{ ...good.sections[0], check }, ...good.sections.slice(1)],
    });

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "mcq",
          prompt: "Birim çemberde x koordinatı neye karşılık gelir?",
          options: ["cos θ", "sin θ", "tan θ"],
          answerIndex: 0,
          explanation: "Metinde x = cos θ olduğu belirtildi.",
        }),
      ),
    ).toEqual([]);

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "mcq",
          prompt: "Birim çemberde x koordinatı neye karşılık gelir?",
          options: ["cos θ", "hiçbiri"],
          answerIndex: 0,
          explanation: "Metinde x = cos θ olduğu belirtildi.",
        }),
      ).length,
    ).toBeGreaterThan(0);

    expect(
      validateLessonPedagogy(
        withCheck({
          type: "trueFalse",
          prompt: "x = sin θ mıdır?",
          options: ["Doğru", "Yanlış", "Belki"],
          answerIndex: 1,
          explanation: "x = cos θ olduğu için yanlış.",
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects the lesson template's own skeleton as section headings", () => {
    // Canlıda üretilen zemin dersinin başlıkları "Kısa Açıklama / Kaynağa
    // Dayalı Örnek / Yaygın Hata / Orta Bilgi Kontrolü / Kısa Kapanış" çıktı:
    // öğrenci ne öğreneceğini değil, üretim şablonunu okuyor.
    const withHeadings = (headings: string[]) => ({
      title: "Efektif gerilme",
      objective: "Su tablası değişince efektif gerilmeyi hesaplayabilmek",
      overview: "Zeminin dayanımı toplam gerilmeye değil, efektif gerilmeye bağlıdır.",
      sections: headings.map((heading, index) => ({
        heading,
        body: "**Efektif gerilme**, toplam gerilmeden **boşluk suyu basıncının** çıkarılmasıdır.",
        check:
          index === 0
            ? {
                type: "mcq" as const,
                prompt: "Efektif gerilme hangi işleme eşittir?",
                options: ["Toplam eksi boşluk basıncı", "Toplam artı boşluk basıncı", "Yalnızca boşluk basıncı"],
                answerIndex: 0,
                explanation: "Boşluk suyu basıncı toplam gerilmeden çıkarılır, eklenmez.",
              }
            : {
                type: "trueFalse" as const,
                prompt: "Boşluk suyu basıncı toplam gerilmeye eklenir.",
                options: ["Doğru", "Yanlış"],
                answerIndex: 1,
                explanation: "Eklenmez; efektif gerilme toplam gerilmeden bu basıncı çıkarır.",
              },
      })),
      example: { prompt: "σ = 92 kPa, u = 19,62 kPa ise σ'?", solution: "σ' = σ − u. Sonuç 72,38 kPa olur." },
      commonMistake: {
        claim: "Toplam ve efektif gerilme eşittir",
        correction: "Aralarındaki fark boşluk suyu basıncıdır.",
      },
      infoCheck: { prompt: "Formül nedir?", answer: "σ' = σ − u" },
      findError: {
        prompt: "Hangi ifade yanlıştır?",
        faultyText: "Efektif gerilme toplam gerilme ile boşluk basıncının toplamıdır.",
        options: ["Toplam sanılmış", "Fark doğru yazılmış"],
        answerIndex: 0,
        explanation: "Efektif gerilme toplamdan boşluk basıncını çıkarır; toplamak sık hatadır.",
      },
      numericalCheck: {
        prompt: "σ = 92 kPa ve u = 20 kPa ise efektif gerilme kaçtır?",
        answer: "72 kPa",
        explanation: "σ' = σ − u = 92 − 20 = 72 kPa.",
      },
      summary: [
        "Efektif gerilme toplam gerilmeden boşluk basıncının farkıdır.",
        "Su tablası yükselince efektif gerilme düşer.",
        "Sık hata toplam gerilmeyi efektif sanmaktır.",
      ],
      nextFocus: ["Konsolidasyon"],
    });

    expect(
      validateLessonPedagogy(
        withHeadings(["Kısa Açıklama", "Yaygın Hata", "Kısa Kapanış"]),
      ).some((i) => i.includes("şablon adı")),
    ).toBe(true);

    expect(
      validateLessonPedagogy(
        withHeadings([
          "Su Tablası Yükselince Ne Değişir",
          "Toplam ve Efektif Gerilmeyi Ayırmak",
          "Kaynama Nasıl Başlar",
        ]),
      ),
    ).toEqual([]);
  });

  it("rejects an objective that only restates the title", () => {
    const base = {
      title: "Efektif Gerilme İlkesi",
      overview: "Zeminin dayanımı toplam gerilmeye değil, efektif gerilmeye bağlıdır.",
      sections: [
        {
          heading: "Su Tablası Etkisi",
          body: "**Su tablası** yükselince **efektif gerilme** düşer.",
          check: {
            type: "trueFalse" as const,
            prompt: "Su tablası yükselince efektif gerilme artar.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Boşluk suyu basıncı artar, efektif gerilme düşer.",
          },
        },
        {
          heading: "Formülün Anlamı",
          body: "Efektif gerilme toplam gerilme eksi boşluk suyu basıncıdır.",
          check: {
            type: "trueFalse" as const,
            prompt: "Efektif gerilme toplam gerilmenin kendisidir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Aradaki fark boşluk suyu basıncıdır.",
          },
        },
        {
          heading: "Kaynama Koşulu",
          body: "Efektif gerilme sıfıra inince zemin kaynar.",
          check: {
            type: "mcq" as const,
            prompt: "Efektif gerilme sıfıra inince ne olur?",
            options: ["Zemin kaynar", "Zemin donar", "Değişmez"],
            answerIndex: 0,
            explanation: "Kaynama koşulu efektif gerilmenin sıfır olmasıdır; donma ayrı bir olaydır.",
          },
        },
      ],
      example: { prompt: "σ = 92, u = 19,62 ise σ'?", solution: "σ' = 72,38 kPa." },
      commonMistake: { claim: "İkisi eşittir", correction: "Fark boşluk suyu basıncıdır." },
      infoCheck: { prompt: "Formül nedir?", answer: "σ' = σ − u" },
      findError: {
        prompt: "Hangi ifade yanlıştır?",
        faultyText: "Efektif gerilme toplam gerilmeye eşittir.",
        options: ["Eşit sanılmış", "Fark doğru yazılmış"],
        answerIndex: 0,
        explanation: "Aradaki fark boşluk suyu basıncıdır; eşit oldukları sık hatadır.",
      },
      numericalCheck: {
        prompt: "σ = 90 kPa ve u = 20 kPa ise efektif gerilme kaçtır?",
        answer: "70 kPa",
        explanation: "σ' = σ − u = 90 − 20 = 70 kPa.",
      },
      summary: [
        "Efektif gerilme toplam gerilmeden boşluk basıncının farkıdır.",
        "Su tablası değişince efektif gerilme de değişir.",
        "Sık hata toplam gerilmeyi efektif sanmaktır.",
      ],
      nextFocus: ["Konsolidasyon"],
    };
    expect(
      validateLessonPedagogy({
        ...base,
        objective: "Efektif Gerilme İlkesi konusunu öğren.",
      }).some((i) => i.includes("başlığı tekrarlıyor")),
    ).toBe(true);

    const good = {
      ...base,
      objective: "Su tablası değişince efektif gerilmeyi hesaplayabileceksin.",
    };

    // Canlıda çıkan hâli: edilgen gelecek, dersi tarif ediyor.
    expect(
      validateLessonPedagogy({
        ...good,
        overview:
          "Bu derste Efektif Gerilme İlkesi açıklanacak ve örnekle pekiştirilecektir.",
      }).some((i) => i.includes("dersi tarif ediyor")),
    ).toBe(true);

    // "Bu derste" ile başlayan her genel bakış kötü değil; bu cümle
    // öğrencinin ne yapabilir olacağını söylüyor ve geçmeli. Eski kural
    // bunu da eliyordu ve ders hiç üretilemiyordu.
    expect(
      validateLessonPedagogy({
        ...good,
        overview:
          "Bu derste su tablası yükselince efektif gerilmenin neden düştüğünü hesapla göreceksin.",
      }),
    ).toEqual([]);
  });

  it("rejects an exponent split between superscript and baseline", () => {
    // Canlıda üretilen bir derste "2³+⁴" geçti: model 2⁽³⁺⁴⁾ demek isteyip
    // üssün ortasında normal satıra düşmüş, ekranda anlam tersine dönüyor.
    expect(brokenSuperscript("2³+⁴ = 2⁷")).toBe(true);
    // Meşru olanlar bayraklanmamalı: tamamı üst simge olan üs, iki kuvvetin
    // toplamı, ve düz metin.
    expect(brokenSuperscript("aⁿ⁻¹ terimi")).toBe(false);
    expect(brokenSuperscript("2³ + 2⁴ toplamı")).toBe(false);
    expect(brokenSuperscript("2⁷ = 128")).toBe(false);
    expect(brokenSuperscript("Taban 3, üs 4")).toBe(false);
  });

  it("rejects quiz pedagogy failures", () => {
    const bad: QuizQuestion[] = [
      {
        text: "2+2?",
        options: ["4", "Hepsi doğrudur", "4", "3"],
        correct: ["4"],
        multi: true,
        explanation: "kısa",
      },
    ];
    const issues = validateQuizPedagogy(bad, { requireObjective: true });
    expect(issues.some((i) => i.includes("multi"))).toBe(true);
    expect(issues.some((i) => i.includes("hepsi") || i.includes("tekrar") || i.includes("learningObjective"))).toBe(true);

    const good: QuizQuestion[] = [
      {
        text: "Birim çemberde 90° noktasının koordinatı nedir?",
        options: ["(0, 1)", "(1, 0)", "(0, -1)", "(-1, 0)"],
        correct: ["(0, 1)"],
        multi: false,
        explanation: "90° yukarıda olduğu için x=0 ve y=1 olur.",
        learningObjective: "90° özel açısını okumak",
      },
    ];
    expect(validateQuizPedagogy(good, { requireObjective: true })).toEqual([]);
    expect(
      validateQuizPedagogy(
        [{ ...good[0], learningObjective: undefined }],
        { requireObjective: true },
      ).some((i) => i.includes("learningObjective")),
    ).toBe(true);
  });

  it("flags vague true/false and missing correction", () => {
    expect(
      validateTrueFalsePedagogy([
        {
          text: "Her zaman doğrudur.",
          correct: true,
          explanation: "Bu belirsiz bir genelleme örneğidir.",
        },
      ]).length,
    ).toBeGreaterThan(0);
    expect(
      validateTrueFalsePedagogy([
        {
          text: "180° bir tam açıdır.",
          correct: false,
          explanation: "Tam açı 360° ölçüsündedir.",
          correctedStatement: "360° bir tam açıdır.",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects flashcards that leak the answer", () => {
    const issues = validateFlashcardPedagogy([
      { front: "sin 30° = 1/2", back: "1/2", difficulty: "easy" },
      { front: "cos 0°?", back: "1", difficulty: "medium" },
      { front: "tan 45°?", back: "1", difficulty: "hard" },
      { front: "Birim çember yarıçapı?", back: "1", difficulty: "easy" },
    ]);
    expect(issues.some((i) => i.includes("sızdır") || i.includes("Zor"))).toBe(true);

    expect(
      validateFlashcardPedagogy([
        { front: "sin 30° değeri nedir?", back: "1/2", difficulty: "hard" },
        { front: "cos 0°?", back: "1", difficulty: "medium" },
        { front: "tan 45°?", back: "1", difficulty: "easy" },
        { front: "Birim çember yarıçapı?", back: "1", difficulty: "easy" },
      ]),
    ).toEqual([]);
  });

  it("scores flashcards as participation not mastery", () => {
    const scored = scoreFlashcardsV2(4, { "0": true, "1": true, "2": false, "3": true });
    expect(scored).toMatchObject({ score: 1, total: 1, knownCount: 3, masteryClaim: false });
  });

  it("validates podcast phase structure and short lines", () => {
    // Evre sırası duruyor ama başlıklar kavramın adı — dinleyici bölüm
    // adından ne konuşulduğunu anlıyor.
    const ok = validatePodcastPedagogy({
      title: "Birim çember",
      chapters: [
        { title: "Birim Çemberin Yarıçapı", lines: [{ speaker: "ada", text: "Birim çemberin yarıçapı birdir." }] },
        { title: "Koordinat Olarak Sinüs ve Kosinüs", lines: [{ speaker: "kerem", text: "Bu sayede cos ve sin doğrudan koordinat olur." }] },
        { title: "Doksan Derecedeki Nokta", lines: [{ speaker: "ada", text: "Doksan derecede nokta sıfır bir olur." }] },
        { title: "Sinüs ile Kosinüsü Karıştırmak", lines: [{ speaker: "kerem", text: "Sin ile cosu yer değiştirmek sık hatadır." }] },
        { title: "Çemberde Ne Nerede", lines: [{ speaker: "ada", text: "x kosinüs, y sinüstür." }] },
      ],
    });
    expect(ok).toEqual([]);
  });

  it("rejects podcast chapters named after the production scaffold", () => {
    // Zemin podcast'inde beş bölümün beşi de böyleydi: TANIM / NEDEN /
    // ÖRNEK / YAYGIN HATA / ÖZET. Kural bunları eskiden zorunlu tutuyordu.
    const issues = validatePodcastPedagogy({
      title: "Zemin sınıflandırması",
      chapters: [
        { title: "Tanım", lines: [{ speaker: "ada", text: "Dane boyu tane çapını anlatır." }] },
        { title: "Neden", lines: [{ speaker: "kerem", text: "Sınıflandırma tasarım kararını belirler." }] },
        { title: "Örnek", lines: [{ speaker: "ada", text: "No 200 eleğinden geçen yüzde 8 ise kaba danelidir." }] },
        { title: "Yaygın hata", lines: [{ speaker: "kerem", text: "LL yerine PI kullanmak sınıfı kaydırır." }] },
        { title: "Özet", lines: [{ speaker: "ada", text: "Eşik yüzde 50 geçentir." }] },
      ],
    });
    expect(issues.some((i) => i.includes("şablon adı"))).toBe(true);
  });

  it("rejects advice dressed up as a common mistake", () => {
    expect(emptyMistake("Dane boyu dağılımını anlamadan sınıflandırma yapmak yanlıştır.")).toBe(
      true,
    );
    expect(emptyMistake("Kıvam limitlerini göz ardı etmek zemin davranışını yanlış değerlendirir.")).toBe(
      true,
    );
    // Somut hata: hangi değeri neyin yerine koyduğu belli.
    expect(emptyMistake("LL = 52 yerine PI = 28 kullanmak sınıfı yanlış verir.")).toBe(false);
    expect(emptyMistake("Sinüs ile kosinüsü yer değiştirmek sık hatadır.")).toBe(false);
  });

  it("requires oral rubrics under v2", () => {
    expect(
      validateOralPedagogy([{ prompt: "Birim çemberi anlat." }]).some((i) =>
        i.includes("rubric"),
      ),
    ).toBe(true);
    expect(
      validateOralPedagogy([
        {
          prompt: "Birim çemberi anlat.",
          rubricCriteria: ["Tanım", "Koordinat"],
          expectedPoints: ["yarıçap 1", "x=cos"],
        },
      ]),
    ).toEqual([]);
  });

  it("extracts misconceptions from wrong quiz/tf answers", () => {
    const drafts = extractMisconceptions({
      kind: "quiz",
      topicLabel: "Trig",
      answers: { "0": "(1, 0)" },
      payload: {
        type: "quiz",
        questions: [
          {
            text: "90° noktası?",
            options: ["(0, 1)", "(1, 0)"],
            correct: ["(0, 1)"],
            multi: false,
            misconceptionTag: "cos_sin_swap",
          },
        ],
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].wrongType).toBe("cos_sin_swap");
  });

  it("queues a missed lesson check as a rephrased variant", () => {
    const drafts = lessonMissDrafts({
      topicLabel: "Sistemler",
      missedSectionIndexes: [0, 0, 9],
      lesson: {
        sections: [
          {
            heading: "Açık sistem",
            body: "**Açık sistem** sınırından kütle geçirir.",
            check: {
              type: "mcq",
              prompt: "Sınırından kütle geçen düzeneğe ne denir?",
              options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
              answerIndex: 1,
              explanation: "Kütle geçişi olan düzenek açık sistemdir.",
              review: {
                prompt: "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
                options: ["Yalıtılmış sistem", "Kapalı sistem", "Açık sistem"],
                answerIndex: 2,
              },
            },
          },
        ],
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].sourceKind).toBe("lesson_review");
    expect(drafts[0].wrongType).toBe("lesson_check_miss");
    expect(drafts[0].questionPreview).toBe(
      "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
    );
    expect(drafts[0].questionPreview).not.toContain("Sınırından kütle");
    expect(drafts[0].corrected).toContain("Açık sistem");
  });

  it("drops a review that invents an option or copies the stem", () => {
    const base = {
      title: "Sistemler",
      objective: "Açık ve kapalı sistemi ayırt edebileceksin.",
      overview: "Sistem, inceleme altına alınan bölgedir ve sınırı vardır.",
      sections: [
        {
          heading: "Açık sistem",
          body: "**Açık sistem** sınırından kütle de enerji de geçebilir.",
          check: {
            type: "mcq" as const,
            prompt: "Sınırından kütle geçen düzeneğe ne denir?",
            options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
            answerIndex: 1,
            explanation: "Kütle geçişi olan düzenek açık sistemdir.",
            review: {
              prompt: "Sınırından kütle geçen düzeneğe ne denir?",
              options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
              answerIndex: 1,
            },
          },
        },
        {
          heading: "Kapalı sistem",
          body: "**Kapalı sistem** kütle geçirmez ama enerji geçirebilir.",
          check: {
            type: "mcq" as const,
            prompt: "Kütle geçirmeyen sistem hangisidir?",
            options: ["Açık sistem", "Kapalı sistem"],
            answerIndex: 1,
            explanation: "Kütle geçirmeyen sistem kapalı sistemdir.",
            review: {
              prompt: "Enerji geçer ama madde geçmezse sistem nedir?",
              options: ["Açık sistem", "Kontrol hacmi"],
              answerIndex: 1,
            },
          },
        },
      ],
      example: { prompt: "Türbin hangi sistemdir?", solution: "Açık sisteme örnektir." },
      commonMistake: {
        claim: "Kapalı sistem enerji de geçirmez.",
        correction: "Kapalı sistem enerji geçirebilir.",
      },
      infoCheck: { prompt: "Açık sistem nedir?", answer: "Kütle geçiren sistem." },
      summary: ["Açık sistem kütle geçirir.", "Kapalı sistem kütle geçirmez."],
      nextFocus: ["Özellikler"],
    };
    const cleaned = prepareLessonDraft(base);
    expect(cleaned?.sections[0].check?.review).toBeUndefined();
    expect(cleaned?.sections[1].check?.review).toBeUndefined();
    expect(cleaned?.sections[0].check?.prompt).toContain("kütle geçen");
  });

  it("keeps the lesson when a review is missing, huge, or the wrong type", () => {
    const section = (
      heading: string,
      review: unknown,
    ) => ({
      heading,
      body: `**${heading}** sınırından geçenleri anlatır ve sınavda ayırt edilir.`,
      check: {
        type: "mcq" as const,
        prompt: `${heading} için hangi tanım doğrudur?`,
        options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
        answerIndex: 1,
        explanation: "Kütle geçişi olan düzenek açık sistemdir.",
        review,
      },
    });
    const cleaned = prepareLessonDraft({
      title: "Sistemler",
      objective: "Açık ve kapalı sistemi ayırt edebileceksin.",
      overview: "Sistem, inceleme altına alınan bölgedir ve sınırı vardır.",
      sections: [
        section("Açık sistem", undefined),
        section("Kapalı sistem", "bu bir cümle değil"),
        section("Yalıtılmış sistem", {
          prompt: "x".repeat(4000),
          options: Array.from({ length: 30 }, (_, i) => `uydurma-${i}`),
          answerIndex: 9,
          extra: { nested: true },
        }),
      ],
      example: { prompt: "Türbin hangi sistemdir?", solution: "Açık sisteme örnektir." },
      commonMistake: {
        claim: "Kapalı sistem enerji de geçirmez.",
        correction: "Kapalı sistem enerji geçirebilir.",
      },
      infoCheck: { prompt: "Açık sistem nedir?", answer: "Kütle geçiren sistem." },
      summary: ["Açık sistem kütle geçirir.", "Kapalı sistem kütle geçirmez."],
      nextFocus: ["Özellikler"],
    });
    expect(cleaned?.sections).toHaveLength(3);
    expect(cleaned?.sections.every((item) => item.check?.review == null)).toBe(true);
    expect(cleaned?.title).toBe("Sistemler");
  });

  it("keeps a short prompt-only review and shuffles the original options later", () => {
    const cleaned = prepareLessonDraft({
      title: "Sistemler",
      objective: "Açık ve kapalı sistemi ayırt edebileceksin.",
      overview: "Sistem, inceleme altına alınan bölgedir ve sınırı vardır.",
      sections: [
        {
          heading: "Açık sistem",
          body: "**Açık sistem** sınırından kütle de enerji de geçebilir.",
          check: {
            type: "mcq",
            prompt: "Sınırından kütle geçen düzeneğe ne denir?",
            options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
            answerIndex: 1,
            explanation: "Kütle geçişi olan düzenek açık sistemdir.",
            review: { prompt: "Hem madde hem enerji çıkan türbin hangi sınıftadır?" },
          },
        },
        {
          heading: "Kapalı sistem",
          body: "**Kapalı sistem** kütle geçirmez ama enerji geçirebilir.",
        },
      ],
      example: { prompt: "Türbin hangi sistemdir?", solution: "Açık sisteme örnektir." },
      commonMistake: {
        claim: "Kapalı sistem enerji de geçirmez.",
        correction: "Kapalı sistem enerji geçirebilir.",
      },
      infoCheck: { prompt: "Açık sistem nedir?", answer: "Kütle geçiren sistem." },
      summary: ["Açık sistem kütle geçirir.", "Kapalı sistem kütle geçirmez."],
      nextFocus: ["Özellikler"],
    });
    expect(cleaned?.sections[0].check?.review?.prompt).toContain("türbin");
    expect(cleaned?.sections[0].check?.review?.options).toBeUndefined();
  });

  it("keeps a grounded review and appends it after existing cards", () => {
    const cleaned = prepareLessonDraft({
      title: "Sistemler",
      objective: "Açık ve kapalı sistemi ayırt edebileceksin.",
      overview: "Sistem, inceleme altına alınan bölgedir ve sınırı vardır.",
      sections: [
        {
          heading: "Açık sistem",
          body: "**Açık sistem** sınırından kütle de enerji de geçebilir.",
          check: {
            type: "mcq",
            prompt: "Sınırından kütle geçen düzeneğe ne denir?",
            options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
            answerIndex: 1,
            explanation: "Kütle geçişi olan düzenek açık sistemdir.",
            review: {
              prompt: "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
              options: ["Yalıtılmış sistem", "Kapalı sistem", "Açık sistem"],
              answerIndex: 2,
            },
          },
        },
        {
          heading: "Kapalı sistem",
          body: "**Kapalı sistem** kütle geçirmez ama enerji geçirebilir.",
        },
      ],
      example: { prompt: "Türbin hangi sistemdir?", solution: "Açık sisteme örnektir." },
      commonMistake: {
        claim: "Kapalı sistem enerji de geçirmez.",
        correction: "Kapalı sistem enerji geçirebilir.",
      },
      infoCheck: { prompt: "Açık sistem nedir?", answer: "Kütle geçiren sistem." },
      summary: ["Açık sistem kütle geçirir.", "Kapalı sistem kütle geçirmez."],
      nextFocus: ["Özellikler"],
    });
    expect(cleaned?.sections[0].check?.review?.prompt).toContain("türbin");
    const cards = appendLessonReviewCards(
      [{ front: "Eski kart", back: "eski" }],
      cardsFromLessonReviews([
        {
          source_kind: "lesson_review",
          question_preview: "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
          corrected: "Açık sistem. Kütle geçişi olan düzenek açık sistemdir.",
        },
        {
          source_kind: "quiz_miss",
          question_preview: "Bu kart karışmasın",
          corrected: "hayır",
        },
      ]),
    );
    expect(cards.map((card) => card.front)).toEqual([
      "Eski kart",
      "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
    ]);
  });
});

describe("podcast advice tolerance", () => {
  const chapter = (title: string, texts: string[]) => ({
    title,
    lines: texts.map((text, i) => ({
      speaker: (i % 2 === 0 ? "ada" : "kerem") as "ada" | "kerem",
      text,
    })),
  });

  const base = [
    chapter("Aşı Takviminin Yapısı", ["Takvim doğumdan itibaren başlar."]),
    chapter("Doz Aralıkları", ["İki doz arası en az dört hafta olmalıdır."]),
    chapter("Kaçırılan Doz", ["Kaçırılan doz takvimi baştan başlatmaz."]),
    chapter("Son Bakış", ["Takvim yaşa göre okunur."]),
  ];

  it("tolerates a single advice-shaped sentence", () => {
    // Her satırı ayrı ayrı reddetmek üretimi tümden düşürüyordu: pediatri
    // podcast'i üst üste iki denemede "oluşturulamadı" verdi.
    const one = [...base];
    one[2] = chapter("Kaçırılan Doz", [
      "Takvimi dikkate almadan doz yapmak yanlıştır.",
    ]);
    expect(validatePodcastPedagogy({ chapters: one })).toEqual([]);
  });

  it("still rejects a podcast whose mistakes are all advice", () => {
    const many = [...base];
    many[2] = chapter("Kaçırılan Doz", [
      "Takvimi dikkate almadan doz yapmak yanlıştır.",
      "Doz aralıklarını göz ardı etmek hatalı olur.",
    ]);
    expect(
      validatePodcastPedagogy({ chapters: many }).some((i) => i.includes("öğüt")),
    ).toBe(true);
  });
});

describe("scaffold headings keep leaking", () => {
  it("rejects the new variants seen in live lessons", () => {
    // Pediatri dersinde dört başlığın üçü kavramdı, dördüncüsü
    // "Kontrol Noktası" idi — listede yoktu, geçti.
    for (const heading of [
      "Kontrol Noktası",
      "Kısa Kontrol",
      "Değerlendirme",
      "Uygulama",
      "Tanım",
      "Özet",
      "Bölüm 1",
    ]) {
      expect(isScaffoldHeading(heading)).toBe(true);
    }
  });

  it("keeps conceptual headings", () => {
    for (const heading of [
      "GBP Aşı Takvimi",
      "Zamanında Aşılama",
      "Su Tablası Yükselince Ne Değişir",
      "Ayrışma Türleri",
    ]) {
      expect(isScaffoldHeading(heading)).toBe(false);
    }
  });
});

describe("echo, broken feedback, and summary synthesis", () => {
  const lesson = {
    title: "Tanzimat Fermanı",
    objective: "Fermanın ilan yılını ve getirdiği ilkeyi ayırt edebilmek",
    overview: "Tanzimat fermanı 1839'da ilan edildi ve kanun önünde eşitliği duyurdu.",
    sections: [
      {
        heading: "İlan Yılı",
        body: "Ferman **1839** yılında **Gülhane**'de okundu.",
        check: {
          type: "trueFalse" as const,
          prompt: "Tanzimat fermanı 1839'da ilan edildi.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Metin ilan yılını 1839 olarak kurar.",
        },
      },
      {
        heading: "Eşitlik İlkesi",
        body: "**Kanun önünde eşitlik** fermanın temel vaadidir.",
        check: {
          type: "mcq" as const,
          prompt: "Fermanın temel vaadi hangisidir?",
          options: ["Kanun önünde eşitlik", "Saltanatın kaldırılması", "Harf devrimi"],
          answerIndex: 0,
          explanation: "Temel vaat eşitliktir; saltanatın kaldırılması bu fermanın konusu değildir.",
        },
      },
    ],
    example: { prompt: "Ferman hangi yılda okundu?", solution: "1839 yılında okundu." },
    commonMistake: {
      claim: "Ferman 1923'te ilan edildi",
      correction: "İlan yılı 1839'dur.",
    },
    infoCheck: { prompt: "Ferman nerede okundu?", answer: "Gülhane" },
    findError: {
      prompt: "Hangi cümle yanlıştır?",
      faultyText: "Tanzimat fermanı Cumhuriyet ile aynı yıl ilan edildi.",
      options: ["Yıl karıştırılmış", "Yer doğru yazılmış"],
      answerIndex: 0,
      explanation: "Ferman 1839'da okundu; 1923 Cumhuriyetin ilanıdır.",
    },
    summary: [
      "Tanzimat fermanı 1839'da ilan edildi ve kanun önünde eşitliği duyurdu.",
      "Diğer madde veya maddeler ise artar.",
      "Sık hata ilan yılını 1923 sanmaktır.",
    ],
    nextFocus: ["Islahat fermanı"],
  };

  it("yankı doğru/yanlış sorusunu ve kopya özeti düşürür", () => {
    const issues = validateLessonPedagogy(lesson, { minSections: 2 });
    expect(issues.some((issue) => issue.includes("kopyası"))).toBe(true);
    expect(issues.some((issue) => issue.includes("anlaşılmıyor"))).toBe(true);
  });

  it("edebiyatta bozuk açıklamayı düşürür", () => {
    expect(
      validateTrueFalsePedagogy([
        {
          text: "Redif ile kafiye aynı sestir.",
          correct: false,
          explanation: "Hangi dizenin ters çevrilirse cümle, kaynağın kurduğu tanımdan kopar.",
          correctedStatement: "Redif ek, kafiye kökte benzer sestir.",
        },
      ]).some((issue) => issue.includes("şablon") || issue.includes("yarım")),
    ).toBe(true);
  });
});

describe("validateLessonV2 is the publish gate", () => {
  const section = (
    heading: string,
    check: {
      type: "mcq" | "trueFalse";
      prompt: string;
      options: string[];
      answerIndex: number;
      explanation: string;
    },
  ) => ({
    heading,
    body: "Açı **derece** veya **radyan** ile ölçülür ve yay uzunluğuna bağlanır.",
    check,
  });

  const sound = {
    title: "Birim çember",
    objective: "Özel açıların koordinatını çemberden okuyabileceksin.",
    overview: "Birim çemberin yarıçapı 1'dir; açı, eksenle yaptığı yayı sayar.",
    sections: [
      section("Açı Ölçüsü Neyi Sayar", {
        type: "mcq",
        prompt: "Radyan neyi ölçer?",
        options: ["Yay uzunluğunu", "Alan", "Çevre"],
        answerIndex: 0,
        explanation: "Alan bir yüzey ölçüsüdür; radyan yay uzunluğunu sayar.",
      }),
      section("Koordinat Nasıl Okunur", {
        type: "trueFalse",
        prompt: "Önce koordinat, sonra yön okunur.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Sıra tersidir: önce yön, sonra koordinat okunur.",
      }),
      section("Sinüs ve Kosinüsü Ayırt Etmek", {
        type: "mcq",
        prompt: "x koordinatı hangisidir?",
        options: ["cos θ", "sin θ", "tan θ"],
        answerIndex: 0,
        explanation: "sin θ y koordinatıdır; x koordinatı cos θ'dır.",
      }),
    ],
    example: {
      prompt: "90° noktası neresi?",
      solution: "90° yukarıdadır, bu yüzden x 0 ve y 1 olur.",
    },
    commonMistake: {
      claim: "x koordinatı ile y koordinatı yer değiştirir",
      correction: "x koordinatı cos θ, y koordinatı sin θ'dır.",
    },
    infoCheck: { prompt: "0° noktası neresidir?", answer: "(1, 0)" },
    findError: {
      prompt: "Hangi ifade yanlıştır?",
      faultyText: "Birim çemberde x koordinatı sin θ'dır.",
      options: ["x ve y karıştırılmış", "Yarıçap yanlış yazılmış"],
      answerIndex: 0,
      explanation: "x koordinatı cos θ'dır; sin θ y koordinatını verir.",
    },
    summary: [
      "Birim çemberde yarıçap 1'dir.",
      "x koordinatı cos θ, y koordinatı sin θ'dır.",
      "Sık hata x ve y koordinatını birbirine karıştırmaktır.",
    ],
    nextFocus: ["Özel açılar"],
  };

  it("accepts a lesson with a check and explanation on every section", () => {
    expect(validateLessonV2(sound)).toEqual([]);
  });

  it("rejects a section that has no inline check", () => {
    const broken = {
      ...sound,
      sections: sound.sections.map((item, index) =>
        index === 2 ? { heading: item.heading, body: item.body } : item,
      ),
    };
    expect(validateLessonV2(broken).some((issue) => issue.includes("kontrolü yok"))).toBe(
      true,
    );
  });

  it("rejects an explanation that only restates the correct option", () => {
    const broken = {
      ...sound,
      sections: [
        {
          ...sound.sections[0],
          check: {
            ...sound.sections[0].check,
            explanation: "Doğru yanıt yay uzunluğudur.",
          },
        },
        sound.sections[1],
        sound.sections[2],
      ],
    };
    expect(
      validateLessonV2(broken).some((issue) => issue.includes("çürütmüyor")),
    ).toBe(true);
  });

  it("rejects a section without a bold exam term and a bare answer", () => {
    const plain = {
      ...sound,
      sections: sound.sections.map((item, index) =>
        index === 0
          ? { ...item, body: "Açı derece veya radyan ile ölçülür ve yay uzunluğuna bağlanır." }
          : item,
      ),
      example: { prompt: "90° noktası neresi?", solution: "Sonuç (0, 1) olur." },
    };
    const issues = validateLessonV2(plain);
    expect(issues.some((issue) => issue.includes("koyu değil"))).toBe(true);
    expect(issues.some((issue) => issue.includes("gerekçeli"))).toBe(true);
  });

  it("drops a numbered chapter heading and keeps the two real concepts", () => {
    const numbered = {
      ...sound,
      sections: sound.sections.map((item, index) =>
        index === 2 ? { ...item, heading: "Bölüm 1" } : item,
      ),
    };
    const prepared = prepareLessonDraft(numbered);
    expect(prepared?.sections.map((section) => section.heading)).not.toContain("Bölüm 1");
    expect(prepared?.sections).toHaveLength(2);
    expect(validateLessonV2(numbered)).toEqual([]);
  });
});

describe("quiz tag and distractor gate", () => {
  it("requires a misconception tag and a refutation when the exam gate is on", () => {
    const question: QuizQuestion = {
      text: "90° noktasının y koordinatı nedir?",
      options: ["bir", "sıfır", "eksi"],
      correct: ["bir"],
      multi: false,
      explanation: "90° yukarıdadır. Sıfır yatay eksendedir, y değeri değildir.",
      learningObjective: "Özel açıyı okumak",
    };
    expect(
      validateQuizPedagogy([question], {
        requireMisconceptionTag: true,
        requireDistractorRefutation: true,
      }).some((issue) => issue.includes("misconceptionTag")),
    ).toBe(true);
    expect(
      validateQuizPedagogy(
        [{ ...question, misconceptionTag: "sin_cos_swap" }],
        { requireMisconceptionTag: true, requireDistractorRefutation: true },
      ),
    ).toEqual([]);
  });
});

describe("true/false exam gate", () => {
  it("requires the tag and an explanation that uses the correction", () => {
    const weak = {
      text: "Pi tam olarak 22/7'ye eşittir.",
      correct: false,
      explanation: "Bu ifade yanlıştır.",
      correctedStatement: "Pi yaklaşık 22/7 değerindedir.",
      misconceptionTag: "pi_fraction",
    };
    expect(
      validateTrueFalsePedagogy([weak], { requireMisconceptionTag: true }).some((issue) =>
        issue.includes("çürütmüyor"),
      ),
    ).toBe(true);
    expect(
      validateTrueFalsePedagogy(
        [
          {
            ...weak,
            explanation: "22/7 bir kesirdir; pi yalnızca yaklaşık o değere yakındır.",
          },
        ],
        { requireMisconceptionTag: true },
      ),
    ).toEqual([]);
  });
});

describe("quiz explanations must refute a distractor", () => {
  const q = (
    text: string,
    options: string[],
    correct: string[],
    explanation: string,
  ): QuizQuestion => ({ text, options, correct, multi: false, explanation });

  it("rejects a set where every explanation only restates the answer", () => {
    // Canlıda üretilmiş beşlinin aynısı: hepsi doğruyu tekrarlıyor.
    const questions = [
      q(
        "Hangi açı için kosinüs -1 olur?",
        ["180°", "90°", "270°", "360°"],
        ["180°"],
        "Kosinüs -1 sadece 180° için elde edilir.",
      ),
      q(
        "Sinüs 1/2 olan açı grubu hangisidir?",
        ["30°, 150°", "120°, 240°", "45°, 225°", "60°, 300°"],
        ["30°, 150°"],
        "Sinüs 1/2 olan açılar 30° ve 150°'dir.",
      ),
    ];
    expect(
      validateQuizPedagogy(questions).some((i) => i.includes("yalnızca doğruyu tekrarlıyor")),
    ).toBe(true);
  });

  it("accepts a set whose explanations say what a wrong option actually is", () => {
    const questions = [
      q(
        "90° ve 270°'de tanımsız olan fonksiyon hangisidir?",
        ["Tanjant", "Sinüs", "Kosinüs", "Kotanjant"],
        ["Tanjant"],
        "Tanjant sinüs/kosinüs olduğundan kosinüs sıfırken tanımsızdır. Sinüs 90°'de 1 değerini alır, tanımsız değildir.",
      ),
      q(
        "Hangi açı için kosinüs -1 olur?",
        ["180°", "90°", "270°", "360°"],
        ["180°"],
        "Kosinüs x koordinatıdır; 180°'de -1 olur. 90° ve 270°'de kosinüs sıfırdır.",
      ),
    ];
    expect(validateQuizPedagogy(questions)).toEqual([]);
  });
});

describe("blocking vs cosmetic lesson issues", () => {
  const sound = {
    title: "Dane Boyu Dağılımı",
    objective: "Cu ve Cc değerlerine bakarak derecelenmeyi söyleyebileceksin.",
    overview: "Derecelenme, dağılım eğrisinin iki katsayısıyla değerlendirilir.",
    sections: [
      {
        heading: "Derecelenme Katsayıları",
        body: "Kum için **Cu** ≥ 6 ve 1 ≤ **Cc** ≤ 3 sağlanmalıdır.",
        check: {
          type: "mcq" as const,
          prompt: "Kum için iyi derecelenme şartı hangisidir?",
          options: ["Cu ≥ 6", "Cu < 4", "Cc < 1", "Cc ≥ 5"],
          answerIndex: 0,
          explanation: "Cu ≥ 6 gerekir; Cu < 4 kötü derecelenmeyi gösterir.",
        },
      },
      { heading: "Elek Analizi", body: "Kaba danelilerde elek analizi kullanılır." },
      { heading: "Hidrometre", body: "İnce danelilerde hidrometre kullanılır." },
    ],
    example: { prompt: "Cu = 8, Cc = 2 olan kum?", solution: "İyi derecelenmiştir." },
    commonMistake: { claim: "Cc tek başına yeter", correction: "Cu ile birlikte bakılır." },
    infoCheck: { prompt: "Cu neyi gösterir?", answer: "Düzgünsüzlük katsayısı" },
    summary: ["Cu ≥ 6", "1 ≤ Cc ≤ 3"],
    nextFocus: ["Atterberg limitleri"],
  };

  it("passes a sound lesson", () => {
    expect(blockingLessonIssues(sound)).toEqual([]);
  });

  it("blocks raw LaTeX that reaches the student verbatim", () => {
    // Canlıda ekranda böyle göründü.
    const latex = {
      ...sound,
      sections: [
        {
          ...sound.sections[0],
          body: String.raw`Dağılım eğrisi \( C_u = \frac{D_{60}}{D_{10}} \) içerir.`,
        },
        ...sound.sections.slice(1),
      ],
    };
    expect(blockingLessonIssues(latex).some((i) => i.includes("LaTeX"))).toBe(true);
  });

  it("blocks a filler option", () => {
    const filler = {
      ...sound,
      sections: [
        {
          ...sound.sections[0],
          check: { ...sound.sections[0].check!, options: ["Cu ≥ 6", "Cu < 4", "Cc < 1", "Hepsi"] },
        },
        ...sound.sections.slice(1),
      ],
    };
    expect(blockingLessonIssues(filler).some((i) => i.includes("Dolgu şık"))).toBe(true);
  });

  it("treats a scaffold heading as cosmetic, not blocking", () => {
    // Başlığın adı hoş olmaması ile sorunun cevaplanamaz olması aynı şey
    // değil; yedek birincisini geçirebilir, ikincisini geçiremez.
    const scaffold = {
      ...sound,
      sections: [
        { ...sound.sections[0], heading: "Bilgi Kontrolü" },
        ...sound.sections.slice(1),
      ],
    };
    expect(blockingLessonIssues(scaffold)).toEqual([]);
    expect(validateLessonPedagogy(scaffold).some((i) => i.includes("şablon adı"))).toBe(true);
  });
});

describe("key terms and in-place warnings", () => {
  const withTerms = {
    title: "Üç Fazlı Zemin Modeli",
    objective: "Faz diyagramındaki hacim ve ağırlıkları ayırt edebileceksin.",
    overview: "Zemin katı, sıvı ve gaz olmak üzere üç fazdan oluşur.",
    sections: [
      {
        heading: "Faz Diyagramının Bileşenleri",
        body: "**Katı faz** mineral taneleridir; **sıvı faz** boşluklardaki sudur.",
        note: {
          title: "Havanın Ağırlığı",
          body: "Havanın hacmi hesaba dahildir, ağırlığı değil.",
        },
        check: {
          type: "trueFalse" as const,
          prompt: "Sıvı faz mineral taneleridir.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 1,
          explanation: "Mineral taneler katı fazdır; sıvı faz sudur.",
        },
      },
      {
        heading: "Boşluk Oranı",
        body: "Boşluk hacminin katı hacmine oranıdır.",
        check: {
          type: "trueFalse" as const,
          prompt: "Boşluk oranı toplam hacme bölünür.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 1,
          explanation: "Payda katı hacimdir, toplam hacim değil.",
        },
      },
      {
        heading: "Porozite",
        body: "Boşluk hacminin toplam hacme oranıdır.",
        check: {
          type: "mcq" as const,
          prompt: "Porozite hangi hacme bölünerek bulunur?",
          options: ["Toplam hacim", "Katı hacim", "Sıvı hacim"],
          answerIndex: 0,
          explanation: "Boşluk oranı katı hacmi kullanır; porozite toplam hacmi kullanır.",
        },
      },
    ],
    example: { prompt: "e = 0,5 ise n nedir?", solution: "n = e/(1+e) = 0,333." },
    commonMistake: { claim: "e ile n aynıdır", correction: "Paydaları farklıdır." },
    infoCheck: { prompt: "Boşluk oranı nedir?", answer: "Vv / Vs" },
    findError: {
      prompt: "Hangi ifade yanlıştır?",
      faultyText: "Boşluk oranı ile porozite aynı paydada hesaplanır.",
      options: ["Aynı payda sanılmış", "Paydalar ayrı yazılmış"],
      answerIndex: 0,
      explanation: "Paydaları farklıdır; boşluk oranı katı hacme, porozite toplam hacme bölünür.",
    },
    summary: [
      "Boşluk oranı boşluk hacminin katı hacmine bölümüdür.",
      "Porozite boşluk hacminin toplam hacme bölümüdür.",
      "Sık hata e ile n değerini aynı sanmaktır; paydaları farklıdır.",
    ],
    nextFocus: ["Doygunluk derecesi"],
  };

  it("accepts a lesson whose terms are marked", () => {
    expect(validateLessonPedagogy(withTerms)).toEqual([]);
  });

  it("rejects a lesson with no marked terms", () => {
    // Sınava iki gün kala geri dönen öğrenci düz paragraftan neye
    // bakacağını çıkaramıyor.
    const plain = {
      ...withTerms,
      sections: withTerms.sections.map((s) => ({
        ...s,
        body: s.body.replaceAll("**", ""),
      })),
    };
    expect(
      validateLessonPedagogy(plain).some((i) => i.includes("Anahtar terimler")),
    ).toBe(true);
  });

  it("treats the in-place warning as optional", () => {
    // Her bölüme kutu koymak uyarıyı değersizleştirir.
    const noNote = {
      ...withTerms,
      sections: withTerms.sections.map(({ note: _note, ...rest }) => rest),
    };
    expect(validateLessonPedagogy(noNote)).toEqual([]);
  });
});

describe("dropScaffoldSections", () => {
  const section = (heading: string) => ({
    heading,
    body: "Bu bölümün gövdesi; kavramı anlatan birkaç cümle burada duruyor.",
  });

  it("keeps only the concept sections", () => {
    // Referans ürünün dersinde "Yaygın Hata" ya da "Bilgi Kontrolü" diye bir
    // bölüm yok: uyarı bölümün içinde bir kutu, kontrol soru olarak
    // soruluyor. Bizde bu alanlar zaten ayrı duruyordu, model bir de
    // bölüm olarak yazınca öğrenci aynı şeyi iki kez görüyordu.
    const lesson = {
      sections: [
        section("Dane Boyu Dağılımı"),
        section("Atterberg Limitleri"),
        section("Kıvam İndisi"),
        section("Yaygın Hata"),
        section("Kapanış"),
      ],
    };
    expect(dropScaffoldSections(lesson).sections.map((s) => s.heading)).toEqual([
      "Dane Boyu Dağılımı",
      "Atterberg Limitleri",
      "Kıvam İndisi",
    ]);
  });

  it("still trims when only two concept sections survive", () => {
    // Canlıda tam bu çıktı: model şemanın alt sınırı olan üç bölümü
    // yazıp üçüncüyü "Yaygın Hata" ile doldurdu. Eşik üç olduğu için
    // ayıklama hiç çalışmadı ve ders şablon başlıkla yayına gitti.
    const lesson = {
      sections: [
        section("Dane Boyu Dağılımı"),
        section("Atterberg Limitleri"),
        section("Yaygın Hata"),
      ],
    };
    expect(dropScaffoldSections(lesson).sections.map((s) => s.heading)).toEqual([
      "Dane Boyu Dağılımı",
      "Atterberg Limitleri",
    ]);
  });

  it("leaves the lesson alone when a single concept would remain", () => {
    // Tek bölümlük ders ders değil; başlığı kötü olanı yollamak yeğdir.
    const lesson = {
      sections: [section("Boşluk Oranı"), section("Özet"), section("Kapanış")],
    };
    expect(dropScaffoldSections(lesson)).toBe(lesson);
  });

  it("returns the same object when nothing is scaffold", () => {
    const lesson = {
      sections: [section("Boşluk Oranı"), section("Porozite"), section("Doygunluk")],
    };
    expect(dropScaffoldSections(lesson)).toBe(lesson);
  });
});

describe("two concept sections are a complete lesson", () => {
  const twoSectionLesson = {
    title: "Dane Boyu Dağılımı",
    objective: "Elek ve hidrometre analizini ayırt edip derecelenmeyi okuyabilmek",
    overview: "Zeminler dane boyuna göre ayrılır; ölçüm yöntemi dane boyuna bağlıdır.",
    sections: [
      {
        heading: "Dane Boyu Dağılımı",
        body: "Kaba daneliler için **elek analizi**, ince daneliler için **hidrometre** kullanılır.",
        check: {
          type: "mcq" as const,
          prompt: "İnce dane hangi yöntemle ölçülür?",
          options: ["Hidrometre", "Elek", "Cetvel"],
          answerIndex: 0,
          explanation: "İnce daneler hidrometreyle ölçülür; elek kaba dane içindir.",
        },
      },
      {
        heading: "Atterberg Limitleri",
        body: "**Likit limit** akmanın, **plastik limit** ise çatlamanın başladığı su içeriğidir.",
        check: {
          type: "trueFalse" as const,
          prompt: "Plastik limit akmanın başladığı su içeriğidir.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 1,
          explanation: "Akmanın başı likit limittir; plastik limit çatlamanın başıdır.",
        },
      },
    ],
    example: { prompt: "LL = 45, PL = 22 ise PI?", solution: "PI = LL − PL. PI = 45 − 22 = 23." },
    commonMistake: { claim: "PI ile LI aynıdır", correction: "LI su içeriğine bağlıdır." },
    infoCheck: { prompt: "Plastisite indisi nedir?", answer: "LL − PL" },
    findError: {
      prompt: "Hangi ifade yanlıştır?",
      faultyText: "Plastisite indisi ile likitlik indisi aynı büyüklüktür.",
      options: ["Aynı sanılmış", "Ayrı tanım yazılmış"],
      answerIndex: 0,
      explanation: "Likitlik indisi su içeriğine bağlıdır; plastisite indisi limitlerin farkıdır.",
    },
    numericalCheck: {
      prompt: "LL = 45 ve PL = 22 ise plastisite indisi kaçtır?",
      answer: "23",
      explanation: "PI = LL − PL = 45 − 22 = 23.",
    },
    summary: [
      "Plastisite indisi likit limit ile plastik limitin farkıdır.",
      "Elek kaba daneyi, hidrometre ince daneyi ölçer.",
      "Sık hata likitlik indisini plastisite sanmaktır; likitlik su içeriğine bağlıdır.",
    ],
    nextFocus: ["Zemin sınıflandırma"],
  };

  it("parses, so a trimmed lesson still reaches the screen", () => {
    // Ayıklanmış ders hem sunucuda hem tarayıcıda yeniden bu şemadan
    // geçiyor; şema üçte kalsaydı ekran boş çizilirdi.
    expect(lessonV2Schema.safeParse(twoSectionLesson).success).toBe(true);
  });

  it("accepts two concept sections and does not reject on count alone", () => {
    expect(
      validateLessonPedagogy(twoSectionLesson).some((i) => i.includes("en az 3 bölüm")),
    ).toBe(false);
    expect(validateLessonPedagogy(twoSectionLesson)).toEqual([]);
    expect(
      lessonPublishIssues(twoSectionLesson).some((issue) => /en az \d+/.test(issue) && /bölüm/.test(issue)),
    ).toBe(false);
  });

  it("follows the source backbone when it asks for fewer", () => {
    // Kaynaktan gelen omurga iki başlıksa prompt iki bölüm istiyor.
    // Burada üç dayatmak her taslağı reddediyor ve ders hiç üretilmiyordu —
    // canlıda "Yük Altında Gerilme Dağılımı" tam bundan düştü.
    expect(
      validateLessonPedagogy(twoSectionLesson, { minSections: 2 }),
    ).toEqual([]);
  });
});

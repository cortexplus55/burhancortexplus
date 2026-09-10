import { describe, expect, it } from "vitest";
import {
  extractMisconceptions,
  parseSessionMeta,
  scoreFlashcardsV2,
  teachingActivityForKind,
  teachingSessionContext,
  teachingStandardConstraints,
  validateFlashcardPedagogy,
  brokenSuperscript,
  emptyMistake,
  validateLessonPedagogy,
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
          body: "Açı ölçüsü yay uzunluğu ile ilişkilidir ve derece veya radyan ile ifade edilir.",
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
        },
      ],
      example: { prompt: "90° noktası neresi?", solution: "Nokta (0, 1) olur." },
      commonMistake: {
        claim: "sin ve cos yer değiştirir",
        correction: "x = cos θ, y = sin θ",
      },
      infoCheck: { prompt: "0° noktası neresidir?", answer: "(1, 0)" },
      summary: ["Yarıçap 1", "x=cos, y=sin"],
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
      sections: headings.map((heading) => ({
        heading,
        body: "Efektif gerilme, toplam gerilmeden boşluk suyu basıncının çıkarılmasıdır.",
        check: {
          type: "trueFalse" as const,
          prompt: "σ' = σ − u doğru mu?",
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: "Metinde bu formül verildi.",
        },
      })),
      example: { prompt: "σ = 92 kPa, u = 19,62 kPa ise σ'?", solution: "σ' = 72,38 kPa." },
      commonMistake: {
        claim: "Toplam ve efektif gerilme eşittir",
        correction: "Aralarındaki fark boşluk suyu basıncıdır.",
      },
      infoCheck: { prompt: "Formül nedir?", answer: "σ' = σ − u" },
      summary: ["σ' = σ − u", "Su tablası efektif gerilmeyi değiştirir"],
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
        { heading: "Su Tablası Etkisi", body: "Su tablası yükselince efektif gerilme düşer." },
        { heading: "Formülün Anlamı", body: "Efektif gerilme toplam gerilme eksi boşluk suyu basıncıdır." },
        { heading: "Kaynama Koşulu", body: "Efektif gerilme sıfıra inince zemin kaynar." },
      ],
      example: { prompt: "σ = 92, u = 19,62 ise σ'?", solution: "σ' = 72,38 kPa." },
      commonMistake: { claim: "İkisi eşittir", correction: "Fark boşluk suyu basıncıdır." },
      infoCheck: { prompt: "Formül nedir?", answer: "σ' = σ − u" },
      summary: ["σ' = σ − u", "Su tablası önemlidir"],
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

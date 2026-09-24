import { describe, expect, it } from "vitest";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import {
  analysisCreditOk,
  chunkPagesForAnalysis,
  FREE_PDF_PAGE_CAP,
  detectMaterialLanguage,
  mergeTeacherAnalyses,
  parseTeacherAnalysis,
  podcastDialogueIssues,
  podcastNarrationBrief,
  prepLanguage,
  acceptReviewVariant,
  rephraseSectionCheck,
  sanitizeAnalysisAgainstSource,
  selectAnalysisPages,
  shouldRetryLessonWithoutBrief,
  teacherBriefForTopic,
  teacherBriefForTopicMap,
  teacherPersona,
  teacherTurnGuidance,
  teachingIntent,
  topicMapTeacherNote,
  unsupportedQuantities,
  voiceReplySchemaHint,
  type TeacherAnalysis,
} from "@/lib/learning/teacher-brain";

const sample = {
  language: "tr",
  summary: "Belge efektif gerilmeyi ve boşluk basıncını anlatır.",
  objectives: [
    { statement: "Öğrenci efektif gerilmeyi hesaplar.", pageNumbers: [2] },
  ],
  examFocus: {
    questionTypes: ["hesap"],
    keyFormulas: [
      { expression: "σ' = σ − u", meaning: "efektif gerilme", pageNumbers: [2] },
    ],
    keyDefinitions: [
      { term: "boşluk basıncı", definition: "Suyun taneler arasındaki basıncı.", pageNumbers: [2] },
    ],
  },
  misconceptions: [
    {
      mistake: "Toplam gerilme ile efektif gerilme aynı sanılır.",
      correction: "Efektif gerilme toplam gerilmeden boşluk basıncının çıkarılmasıdır.",
      pageNumbers: [2],
    },
  ],
  topics: [
    {
      title: "Efektif Gerilme",
      emphasis: "core",
      prerequisites: ["Toplam gerilme"],
      pageNumbers: [2],
      strategy: {
        examples: ["σ = 100 kPa ve u = 40 kPa"],
        analogies: ["İskelet yükü taşır, su değil"],
        mnemonics: ["Toplam eksi su"],
        workedExamplePlan: "Önce σ, sonra u, sonra fark.",
        checkQuestions: ["u artarsa efektif gerilme ne olur?"],
      },
    },
  ],
};

describe("öğretmen analizi ayrıştırma", () => {
  it("geçerli taslağı saklar ve sürüm ekler", () => {
    const parsed = parseTeacherAnalysis(sample);
    expect(parsed?.version).toBe(1);
    expect(parsed?.topics[0].title).toBe("Efektif Gerilme");
    expect(parsed?.examFocus.keyFormulas[0].expression).toBe("σ' = σ − u");
  });

  it("konu veya hedef yoksa null döner", () => {
    expect(parseTeacherAnalysis({ summary: "kısa" })).toBeNull();
    expect(parseTeacherAnalysis({ ...sample, topics: [] })).toBeNull();
  });

  it("uzun metni keser, bilinmeyen vurguyu desteğe çeker", () => {
    const parsed = parseTeacherAnalysis({
      ...sample,
      summary: "a".repeat(900),
      topics: [{ ...sample.topics[0], emphasis: "banner", title: "x".repeat(200) }],
    });
    expect(parsed?.summary.length).toBe(600);
    expect(parsed?.topics[0].emphasis).toBe("support");
    expect(parsed?.topics[0].title.length).toBe(120);
  });

  it("parçaları aynı konuda birleştirir", () => {
    const first = parseTeacherAnalysis(sample);
    const second = parseTeacherAnalysis({
      ...sample,
      summary: "İkinci parça kayma mukavemetini ekler.",
      objectives: [
        { statement: "Öğrenci kayma mukavemetini ayırt eder.", pageNumbers: [4] },
      ],
      topics: [
        {
          ...sample.topics[0],
          emphasis: "support",
          pageNumbers: [3],
          prerequisites: ["Boşluk oranı"],
        },
        {
          title: "Kayma Mukavemeti",
          emphasis: "core",
          prerequisites: [],
          pageNumbers: [4],
          strategy: {
            examples: ["φ = 30°"],
            analogies: [],
            mnemonics: [],
            workedExamplePlan: "Mohr dairesini çiz.",
            checkQuestions: ["φ artarsa dayanım ne olur?"],
          },
        },
      ],
    });
    const merged = mergeTeacherAnalyses([first!, second!]);
    const efektif = merged?.topics.find((topic) => topic.title === "Efektif Gerilme");
    expect(efektif?.pageNumbers).toEqual([2, 3]);
    expect(efektif?.emphasis).toBe("core");
    expect(efektif?.prerequisites).toContain("Boşluk oranı");
    expect(merged?.topics.map((topic) => topic.title)).toContain("Kayma Mukavemeti");
    expect(merged?.objectives).toHaveLength(2);
  });
});

describe("parça ve kota", () => {
  it("kısa metni modele göndermez", () => {
    expect(chunkPagesForAnalysis([{ pageNumber: 1, text: "çok kısa" }])).toEqual([]);
  });

  it("uzun belgeyi üç parçada tutar ve her sayfayı taşır", () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Sayfa ${index + 1} `.repeat(80),
    }));
    const chunks = chunkPagesForAnalysis(pages);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.flat().map((page) => page.pageNumber)).toEqual(
      pages.map((page) => page.pageNumber),
    );
  });

  it("ücretsiz PDF'i yayınlanan sayfa tavanında keser, slaytı kesmez", () => {
    const pages = [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      text: `sayfa ${pageNumber}`,
    }));
    expect(FREE_PDF_PAGE_CAP).toBe(PHOTO_PAGE_LIMITS.free);
    expect(selectAnalysisPages(pages, { mimeType: "application/pdf", tier: "free" })).toHaveLength(
      PHOTO_PAGE_LIMITS.free,
    );
    expect(
      selectAnalysisPages(pages, {
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        tier: "free",
      }),
    ).toHaveLength(4);
    expect(selectAnalysisPages(pages, { mimeType: "application/pdf", tier: "plus" })).toHaveLength(
      4,
    );
  });

  it("konu haritasına yetecek kredi yoksa analizi ertelemez, vazgeçer", () => {
    expect(analysisCreditOk(1, 1, 1)).toBe(false);
    expect(analysisCreditOk(2, 1, 1)).toBe(true);
    expect(analysisCreditOk(3, 1, 2)).toBe(true);
    expect(analysisCreditOk(5, 0, 1)).toBe(false);
  });
});

describe("kaynağa bağlama", () => {
  const source = "σ' = σ − u. Boşluk basıncı u ile gösterilir. Örnekte σ = 100 kPa.";

  it("kaynakta olmayan yüzde ve denklem katsayısını işaretler", () => {
    expect(unsupportedQuantities("Eşik %50 geçince ince danelidir.", source)).toEqual(["%50"]);
    expect(unsupportedQuantities("σ' = 5σ − u", source)).toContain("5");
    expect(unsupportedQuantities("Üçüncü adım budur.", source)).toEqual([]);
    expect(unsupportedQuantities("σ' = σ − u", source)).toEqual([]);
  });

  it("uydurma formülü ve tanımsız terimi analizden çıkarır", () => {
    const analysis = parseTeacherAnalysis({
      ...sample,
      examFocus: {
        ...sample.examFocus,
        keyFormulas: [
          ...sample.examFocus.keyFormulas,
          { expression: "Δσ = 5Q / z²", meaning: "uydurma", pageNumbers: [9] },
        ],
        keyDefinitions: [
          ...sample.examFocus.keyDefinitions,
          { term: "Boussinesq", definition: "Belgede geçmeyen bir ad.", pageNumbers: [9] },
        ],
      },
    }) as TeacherAnalysis;
    const checked = sanitizeAnalysisAgainstSource(analysis, source);
    expect(checked.droppedFormulas).toEqual(["Δσ = 5Q / z²"]);
    expect(checked.analysis.examFocus.keyFormulas.map((item) => item.expression)).toEqual([
      "σ' = σ − u",
    ]);
    expect(checked.analysis.examFocus.keyDefinitions.map((item) => item.term)).toEqual([
      "boşluk basıncı",
    ]);
  });

  it("örnek ve plan metnindeki uydurma sayıyı da atar", () => {
    const analysis = parseTeacherAnalysis({
      ...sample,
      topics: [
        {
          ...sample.topics[0],
          strategy: {
            ...sample.topics[0].strategy,
            examples: ["σ = 100 kPa ve u = 40 kPa", "Δσ = 5Q / z² ile hesap"],
            workedExamplePlan: "Önce σ = 100, sonra uydurma Δσ = 8Q.",
          },
        },
      ],
    }) as TeacherAnalysis;
    const checked = sanitizeAnalysisAgainstSource(
      analysis,
      "σ' = σ − u. Örnekte σ = 100 kPa ve u = 40 kPa.",
    );
    expect(checked.analysis.topics[0].strategy.examples).toEqual([
      "σ = 100 kPa ve u = 40 kPa",
    ]);
    expect(checked.analysis.topics[0].strategy.workedExamplePlan).toBe("");
    const brief = teacherBriefForTopic(checked.analysis, "Efektif Gerilme");
    expect(brief).not.toContain("5Q");
    expect(brief).not.toContain("8Q");
    expect(brief).toContain("σ' = σ − u");
  });
});

describe("akış notu ve tekrar sorusu", () => {
  const analysis = parseTeacherAnalysis(sample) as TeacherAnalysis;

  it("harita notu kutuyu ayrı konu yapmaz", () => {
    const note = topicMapTeacherNote(teacherBriefForTopicMap(analysis));
    expect(note).toContain("Efektif Gerilme");
    expect(note).toContain("ayrı konu olmaz");
    expect(topicMapTeacherNote("")).toBe("");
    expect(topicMapTeacherNote(null)).toBe("");
  });

  it("konu notunda yanılgı ve örnek planı durur", () => {
    const brief = teacherBriefForTopic(analysis, "Efektif gerilme ilkesi");
    expect(brief).toContain("Toplam gerilme ile efektif gerilme");
    expect(brief).toContain("Önce σ, sonra u");
    expect(brief).toContain("Kapsam listesi");
    expect(brief).toContain("σ' = σ − u");
    expect(brief).toContain("important");
    expect(teacherBriefForTopicMap(analysis)).toContain("Efektif Gerilme");
    expect(teacherBriefForTopicMap(analysis)).not.toContain("Ayrı konu açma");
  });

  it("sayfasız formülü ve kısa başlığı nota yazmaz", () => {
    const wide = parseTeacherAnalysis({
      ...sample,
      examFocus: {
        ...sample.examFocus,
        keyFormulas: [
          { expression: "σ' = σ − u", meaning: "efektif gerilme", pageNumbers: [2] },
          { expression: "E = 9 kPa", meaning: "sayfasız formül", pageNumbers: [] },
          { expression: "q = 12 kN", meaning: "başka sayfa", pageNumbers: [9] },
        ],
      },
      topics: [
        sample.topics[0],
        {
          title: "Su",
          emphasis: "support",
          prerequisites: [],
          pageNumbers: [1],
          strategy: {
            examples: ["Kısa su notu burada."],
            analogies: [],
            mnemonics: [],
            workedExamplePlan: "",
            checkQuestions: ["Su nedir bugün?"],
          },
        },
        {
          title: "Su Akışı",
          emphasis: "core",
          prerequisites: [],
          pageNumbers: [4],
          strategy: {
            examples: ["Debi süreklidir ve kütle korunur."],
            analogies: [],
            mnemonics: [],
            workedExamplePlan: "Önce debiyi yaz.",
            checkQuestions: ["Debi nasıl korunur burada?"],
          },
        },
      ],
    }) as TeacherAnalysis;
    const scoped = teacherBriefForTopic(wide, "Efektif gerilme ilkesi");
    expect(scoped).toContain("σ' = σ − u");
    expect(scoped).not.toContain("E = 9");
    expect(scoped).not.toContain("q = 12");
    const unmatched = teacherBriefForTopic(wide, "Kuantum dolanıklık");
    expect(unmatched).not.toContain("σ'");
    expect(unmatched).not.toContain("E = 9");
    const flow = teacherBriefForTopic(wide, "Su Akışı nedir");
    expect(flow).toContain("Debi süreklidir");
    expect(flow).not.toContain("Kısa su notu");
    const short = teacherBriefForTopic(wide, "Su");
    expect(short).not.toContain("Kısa su notu");
    expect(short).not.toContain("Debi süreklidir");
  });

  it("nicelik reddinde notu bir kez çıkarır, ikinci turda çıkarmaz", () => {
    expect(
      shouldRetryLessonWithoutBrief({
        brief: "ṁ = 0,60 kg/s",
        rejectedForQuantity: true,
        retried: false,
      }),
    ).toBe(true);
    expect(
      shouldRetryLessonWithoutBrief({
        brief: "ṁ = 0,60 kg/s",
        rejectedForQuantity: true,
        retried: true,
      }),
    ).toBe(false);
    expect(
      shouldRetryLessonWithoutBrief({
        brief: "",
        rejectedForQuantity: true,
        retried: false,
      }),
    ).toBe(false);
    expect(
      shouldRetryLessonWithoutBrief({
        brief: "not",
        rejectedForQuantity: false,
        retried: false,
      }),
    ).toBe(false);
  });

  it("yanlışın tekrarını başka cümle ve başka şık yeriyle sorar", () => {
    const check = rephraseSectionCheck({
      type: "mcq" as const,
      prompt: "Aşağıdakilerden hangisi efektif gerilmedir?",
      options: ["σ", "σ − u", "u", "σ + u"],
      answerIndex: 1,
      explanation: "Efektif gerilme toplam gerilmeden boşluk basıncının çıkarılmasıdır.",
    });
    expect(check.prompt).not.toBe("Aşağıdakilerden hangisi efektif gerilmedir?");
    expect(check.options[check.answerIndex]).toBe("σ − u");
    expect(check.answerIndex).not.toBe(1);
  });

  it("yeni şık veya yeni sayı taşıyan tekrarı kabul etmez", () => {
    const check = {
      type: "mcq" as const,
      prompt: "Efektif gerilme nasıl bulunur?",
      options: ["σ", "σ − u", "u"],
      answerIndex: 1,
      explanation: "Efektif gerilme toplam gerilmeden boşluk basıncının çıkarılmasıdır.",
    };
    expect(
      acceptReviewVariant({
        ...check,
        review: {
          prompt: "Boşluk basıncı toplam gerilmeden düşünce kalan büyüklük nedir?",
          options: ["u", "σ", "σ − u"],
          answerIndex: 2,
        },
      })?.options[2],
    ).toBe("σ − u");
    expect(
      acceptReviewVariant({
        ...check,
        review: {
          prompt: "300 kPa boşluk basıncında efektif gerilme nedir?",
          options: ["u", "σ", "σ − u"],
          answerIndex: 2,
        },
      }),
    ).toBeNull();
    expect(
      acceptReviewVariant({
        ...check,
        review: {
          prompt: "Efektif gerilme nasıl bulunur?",
          options: ["σ", "σ − u", "u"],
          answerIndex: 1,
        },
      }),
    ).toBeNull();
    expect(
      acceptReviewVariant({
        ...check,
        review: {
          prompt: "Toplam gerilmeden boşluk basıncı çıkınca ne kalır?",
          options: ["σ", "σ − u", "kontrol hacmi"],
          answerIndex: 1,
        },
      }),
    ).toBeNull();
  });

  it("İngilizce dersin tekrarını İngilizce kurar", () => {
    const check = rephraseSectionCheck(
      {
        type: "mcq",
        prompt: "Which quantity is effective stress?",
        options: ["sigma", "sigma minus u", "pore pressure"],
        answerIndex: 1,
        explanation: "Effective stress subtracts pore pressure.",
      },
      "en",
    );
    expect(check.prompt.startsWith("On the exam")).toBe(true);
    expect(check.prompt).not.toMatch(/sınavda|aşağıdaki/i);
    expect(check.options[check.answerIndex]).toBe("sigma minus u");
  });
});

describe("öğretmen personası", () => {
  it("test, özel ders ve eğit komutlarını ayırır", () => {
    expect(teachingIntent("beni test et")).toBe("quiz");
    expect(teachingIntent("Konuyu ne kadar iyi anladığımı test et")).toBe("quiz");
    expect(teachingIntent("Bana özel ders ver")).toBe("lesson");
    expect(teachingIntent("beni eğit")).toBe("lesson");
    expect(teachingIntent("teach me this")).toBe("lesson");
    expect(teachingIntent("formül neydi")).toBe("none");
  });

  it("belge yüklüyse belgeye göre, değilse personasına göre konuşur", () => {
    const open = teacherTurnGuidance({
      message: "σ ile u aynı şey",
      lastAssistant: "Efektif gerilme nedir?",
    });
    expect(open).toContain("profesör");
    expect(open).not.toContain("Materyal dışı:");
    expect(open).not.toContain("belgede");
    const sourced = teacherTurnGuidance({
      message: "σ ile u aynı şey",
      lastAssistant: "Efektif gerilme nedir?",
      hasSource: true,
    });
    expect(sourced).toContain("Materyal dışı:");
    expect(sourced).toContain("belgede");
  });

  it("İngilizce hazırlıkta İngilizce persona kullanır", () => {
    expect(prepLanguage({ language: "en" })).toBe("en");
    expect(teacherPersona("en")).toContain("professor");
    expect(teacherPersona("en")).not.toContain("uploaded material");
    expect(teacherTurnGuidance({ message: "test me", language: "en" })).toContain(
      "exam-style question",
    );
    expect(teacherTurnGuidance({ message: "test me", language: "en" })).not.toContain(
      "Outside the material",
    );
    expect(voiceReplySchemaHint("en")).toContain("short English");
    expect(voiceReplySchemaHint("en")).not.toContain("Türkçe");
    expect(voiceReplySchemaHint("tr")).toContain("Türkçe");
    expect(podcastNarrationBrief("en")).toContain("One expert teacher");
    expect(
      detectMaterialLanguage(
        "The shear strength of soil depends on friction and cohesion for the exam.",
      ),
    ).toBe("en");
  });

  it("tek anlatıcıyı diyalogdan ayırır", () => {
    expect(
      podcastDialogueIssues([{ lines: [{ speaker: "ada", text: "Efektif gerilme σ eksi u dur." }] }]),
    ).toEqual([]);
    expect(
      podcastDialogueIssues([
        { lines: [{ speaker: "kerem", text: "Ada, bir de sen söyle." }] },
      ]).length,
    ).toBeGreaterThan(0);
  });
});

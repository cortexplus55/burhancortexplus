import { describe, expect, it, vi } from "vitest";
import { recordValidationEvent } from "@/lib/learning/validation-metrics";
import { parseModelJson, publishLessonDraft, lessonPublishIssues, normalizeMathNotation } from "@/lib/learning/teaching-standards";
import { keyTermsFromTeacherNote } from "@/lib/learning/teacher-brain";
import {
  runIndependentValidation,
  verifierIssuesRejectLesson,
} from "@/lib/learning/validation-pipeline";

/**
 * Canlı red, 28ffcfb sonrası. Doğrulayıcı formüllerin doğru olduğunu
 * söylüyor; şikâyet LaTeX, koyu yazım, başlık ve "daha anlamlı olsun".
 */
const after85Structural = [
  "Çıktı geçerli JSON değil.",
  "Çıktı istenen JSON şemasını veya etkinlik kurallarını karşılamıyor. Format alanındaki bütün kuralları uygula.",
  "'Basınç Tanımı ve Çeşitleri' bölümündeki basınç formülünde semboller LaTeX formatına yanlış çevrildi; kaynakta yazılan biçimde kullanılması gerekirdi.",
  "'Sıcaklık Kavramı ve Termodinamiğin Sıfırıncı Yasası' bölümünde, dönüşüm formülü ve açıklamalar doğru olarak verilmiş fakat format hatası var (LaTeX kullanılmam",
  "'Hidrostatik Basınç Hesaplama' bölümünde verilen hidrostatik basınç formülü ve hesaplama aşamaları doğru ancak yine LaTeX formatında hatalar var.",
  "Örnek çözümde tüm ara adımlar sayfa 6'daki formüllerle uyumlu olmalı ancak format ve birimlerin kontrol edilmesi gerekiyor.",
  "Birimlerin açıklanmadığı kısımlar var, kaynakta geçtiği şekliyle sunulmalı.",
  "Belirtilen 'commonMistake' ve 'infoCheck' alanları, basınç ve sıcaklık ile ilgili konular için daha anlamlı hale getirilmeli.",
];

const after85Pedagogy = [
  "Çözüm adım adım ve gerekçeli olmalı; yalnızca sonucu yazma.",
  "En az 2 kontrol sorusu kalmalı; öğretmeyenler çıkarıldı.",
  "Çıktı istenen JSON şemasını veya etkinlik kurallarını karşılamıyor.",
  "Çıktı istenen JSON şemasını veya etkinlik kurallarını karşılamıyor. Format alanındaki bütün kuralları uygula.",
  "Json formatında hata var, formatı kontrol et.",
  "Ders planında tutarsızlık var: Başlıklar konuyu tam yansıtmıyor.",
  "Önemli terimler eksik işaretlenmiş: 'mutlak basınç' gibi terimler ** ile işaretlenmeli.",
  "Kavramların ve formüllerin kaynakla uyumunu kontrol et.",
];

/** e58afd8. PV = nRT kaynak sayfada yok. */
const idealGasRejection = [
  "Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü).",
  "Çıktı istenen JSON şemasını veya etkinlik kurallarını karşılamıyor.",
  "Örnek çözümde, basınç birimi yanlış çevrilmiş. 50000 Pa = 50 kPa dönüşümü yerine 50000 Pa doğru olup 50 kPa yanlıştır, çünkü 1 kPa = 1000 Pa.",
  "Kaynakta olmayan bilgi ve formüller kullanılmış. İdeal gaz yasası (PV = nRT) örneği, dokümanda yer almıyor.",
  "Yanlış terminoloji kullanışı. Örneğin, \"Basınç her zaman atmosfer basıncına eşittir.\" şeklinde belirtilen hata örneği tutarsız.",
  "Bazı açıklamalar genel ve yüzeysel, netlikten yoksun.",
  "[pedagogy] Ders v2 şemasını karşılamıyor (hedef, bölümler, örnek, yaygın hata, bilgi kontrolü).",
];

const idealGasSecondPass = [
  "Anahtar terim koyu değil: Basınç ve Sıcaklık İlişkisi. Sınav terimini **iki yıldız** arasına al.",
  "Giriş bölümü eksik, doğrudan kavram bölümleriyle başlamış.",
  "Kaynakta olmayan bilgi ve formül (İdeal Gaz Yasası) eklenmiş.",
  "Örnek çözümünde yanlış adımlar ve eksik birimler kullanılmış; açıklamalar yetersiz.",
  "'Basınç ve Sıcaklık İlişkisi' bölümünde verilen bilgiler kaynakla uyumsuz.",
  "Kaynak sayfalarda İdeal Gaz Yasası ile ilgili bilgi yokken, taslakta bu yasa üzerinden açıklamalar yapılmış.",
];

const check = {
  type: "mcq" as const,
  prompt: "Basınç hangi oranla tanımlanır?",
  options: ["Kuvvet bölü alan", "Kütle bölü hacim", "Enerji bölü zaman"],
  answerIndex: 0,
  explanation: "Kütle bölü hacim yoğunluktur; basınç kuvvetin alana bölümüdür.",
};

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    title: "Basınç ve sıcaklık",
    objective: "Basıncı kuvvet ve alandan okuyabileceksin.",
    overview: "Basınç birim alana gelen kuvvettir; mutlak basınç da buradan okunur.",
    sections: [
      {
        heading: "Basınç Tanımı",
        body: "Basınç birim alana gelen kuvvettir ve tablodan okunur.",
        check,
      },
      {
        heading: "Sıcaklık Ölçeği",
        body: "Sıcaklık termometre ile ölçülür ve santigrattan okunur.",
        check: {
          type: "trueFalse" as const,
          prompt: "Santigrat değer mutlak sıcaklığın kendisidir.",
          options: ["Doğru", "Yanlış"],
          answerIndex: 1,
          explanation: "Mutlak sıcaklık santigrata 273 eklenerek bulunur, kendisi değildir.",
        },
      },
      {
        heading: "Hidrostatik Basınç",
        body: "Mutlak basınç, gösterge basıncına atmosfer basıncı eklenerek bulunur.",
        check,
      },
    ],
    example: {
      prompt: "50000 Pa kaç kPa eder?",
      solution: "Sonuç 50 kPa olarak okunur.",
    },
    commonMistake: {
      claim: "Santigrat ile kelvin aynı sayıdır.",
      correction: "Kelvin, santigrata 273 eklenmiş ölçektir.",
    },
    infoCheck: { prompt: "Basınç nedir?", answer: "Birim alana gelen kuvvettir." },
    summary: ["Basınç kuvvet bölü alandır.", "Kelvin santigrata 273 ekler."],
    nextFocus: ["Hal değişimi"],
    ...overrides,
  };
}

describe("verifier issue severity", () => {
  it("lets the post-85 cosmetic lists through", () => {
    expect(verifierIssuesRejectLesson(after85Structural)).toBe(false);
    expect(verifierIssuesRejectLesson(after85Pedagogy)).toBe(false);
  });

  it("still rejects a list that invents the ideal gas law", () => {
    expect(verifierIssuesRejectLesson(idealGasRejection)).toBe(true);
    expect(verifierIssuesRejectLesson(idealGasSecondPass)).toBe(true);
  });

  it("does not treat a correct pascal conversion as a wrong number", () => {
    expect(
      verifierIssuesRejectLesson([
        "50000 Pa = 50 kPa dönüşümü yanlıştır, çünkü 1 kPa = 1000 Pa.",
      ]),
    ).toBe(false);
  });
});

describe("lenient lesson JSON", () => {
  it("parses LaTeX backslashes instead of calling the draft invalid JSON", () => {
    const raw = String.raw`{"overview":"Basınç \( P = \frac{F}{A} \) ile okunur.","sections":[{"heading":"Basınç",}],}`;
    const parsed = parseModelJson(raw) as { overview: string };
    expect(parsed.overview).toContain("frac");
    const gate = runIndependentValidation({ draft: raw, parsed });
    expect(gate.issues.some((issue) => issue.code === "invalid_json")).toBe(false);
    expect(normalizeMathNotation(parsed.overview)).not.toMatch(/\\frac|\\\(/);
  });

  it("still reports invalid_json when the text is not JSON at all", () => {
    expect(parseModelJson("bu bir ders cümlesi, json değil")).toBeNull();
    const gate = runIndependentValidation({
      draft: "bu bir ders cümlesi, json değil",
      parsed: null,
    });
    expect(gate.failedStage).toBe("structural");
    expect(gate.issues[0]?.code).toBe("invalid_json");
  });
});

describe("deterministic lesson fixes", () => {
  it("bolds a key term, normalises a formula, and does not fail a one-line solution", () => {
    const raw = lesson({
      sections: [
        {
          heading: "Basınç Tanımı",
          body: String.raw`Basınç \( P = \frac{F}{A} \) bağıntısıyla okunur.`,
          check,
        },
        lesson().sections[1],
        lesson().sections[2],
      ],
    });
    const terms = keyTermsFromTeacherNote(
      "- (high) concept: mutlak basınç: gösterge ve atmosfer toplamı",
    );
    expect(terms).toContain("mutlak basınç");
    const published = publishLessonDraft(raw, { keyTerms: terms });
    expect(published?.sections[0].body).not.toMatch(/\\frac|\\\(/);
    expect(published?.sections[2].body).toContain("**");
    expect(published?.sections[2].body.toLocaleLowerCase("tr")).toContain("mutlak basınç");
    expect(lessonPublishIssues(raw, { keyTerms: terms }).some((issue) => /adım adım|LaTeX|kontrol sorusu/.test(issue))).toBe(
      false,
    );
  });
});

describe("validation event severity log", () => {
  it("writes recheck_passed and the severity split without storing the draft", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await recordValidationEvent(null, {
      userId: "student-1",
      actionCode: "STUDY_PLAN_GENERATE",
      activityKind: "lesson",
      issueSeverity: {
        blocking: ["Kaynakta olmayan formül PV = nRT."],
        nonBlocking: ["Semboller LaTeX formatına yanlış çevrildi."],
      },
      metrics: {
        generationMs: 1,
        validationMs: 2,
        stagesMs: { repair: 3, recheck: 4 },
        failedStage: "pedagogy",
        failureCodes: ["rejected"],
        repairAttempted: true,
        recheckPassed: false,
        outcome: "rejected",
      },
    });
    expect(spy).toHaveBeenCalledWith(
      "ai_validation_event",
      expect.objectContaining({
        repair_attempted: true,
        recheck_passed: false,
        issue_severity: {
          blocking: ["Kaynakta olmayan formül PV = nRT."],
          nonBlocking: ["Semboller LaTeX formatına yanlış çevrildi."],
        },
      }),
    );
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/draft|overview|Basınç formülü P/);
    spy.mockRestore();
  });
});

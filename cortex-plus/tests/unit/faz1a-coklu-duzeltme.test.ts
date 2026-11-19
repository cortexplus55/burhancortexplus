import { describe, expect, it } from "vitest";
import {
  SOURCE_CORRECTION_TASK,
  allCorrections,
  correctionsAsNoteWarnings,
  presentsTruthAsMistake,
  quizKeyRepeatsSourceError,
  readModelSourceCorrection,
  readSourceCorrectionWarning,
  repeatsSourceError,
  sourceCorrectionPromptBlock,
} from "@/lib/learning/source-correction";
import { NOTE_RULE_JSON_WITH_CORRECTION } from "@/lib/learning/note-rule-check";
import { relationClaimOf } from "@/lib/learning/relation-text";
import { LESSON_V3_FORMAT, readLessonV3 } from "@/lib/learning/lesson-v3";
import { lessonCorrectionNow, lessonLevelStructureIssues, screenStructureIssues } from "@/lib/learning/teacher-lesson";

/*
  Faz 1-A §2.1 ek düzeltmesi (19 Kasım 2026): aynı belgede birden fazla bariz hata olunca hepsi döner; sözel yazılmış
  kurallar (orantının yönü, artar/azalır) da düzeltilir ve dersin her yeri doğrusunu öğretir.
  Bütün örnekler jeneriktir: "Q = B / CD" ile "alfa/beta niceliği" uydurma büyüklüklerdir.
*/

const FORMULA_CLAIM = "Q = B / CD";
const FORMULA_TRUTH = "Q = B · CD";
const VERBAL_CLAIM = "Sabit koşulda alfa niceliği iki katına çıkarsa beta niceliği de iki katına çıkar.";
const VERBAL_TRUTH = "Sabit koşulda alfa niceliği iki katına çıkarsa beta niceliği yarıya iner.";
const SOURCE = `Birinci bölüm. Bağıntı: ${FORMULA_CLAIM} olarak verilir. İkinci bölüm. ${VERBAL_CLAIM} Üçüncü bölüm: ölçümler tabloda.`;

const item = (documentClaim: string, verifiedTruth: string, extra: Record<string, unknown> = {}) => ({
  documentClaim,
  verifiedTruth,
  explanation: "Jenerik açıklama cümlesi.",
  domain: "fizik",
  confidence: "yuksek",
  ...extra,
});

const RAW = { items: [], corrections: [item(FORMULA_CLAIM, FORMULA_TRUTH), item(VERBAL_CLAIM, VERBAL_TRUTH)] };

describe("çoklu kaynak düzeltmesi", () => {
  it("belgedeki bütün bariz hatalar döner: ilki bugünkü alanlarda, kalanı others içinde", () => {
    const warning = readModelSourceCorrection(RAW, SOURCE)!;
    expect(warning.documentClaim).toBe(FORMULA_CLAIM);
    expect(warning.others?.map((other) => other.documentClaim)).toEqual([VERBAL_CLAIM]);
    expect(allCorrections(warning)).toHaveLength(2);
    expect(correctionsAsNoteWarnings(warning).map((typo) => typo.standard)).toEqual([FORMULA_TRUTH, VERBAL_TRUTH]);
  });

  it("eski tek 'correction' biçimi ve eski tek uyarılı kayıt aynen okunur", () => {
    const legacy = readModelSourceCorrection({ correction: item(FORMULA_CLAIM, FORMULA_TRUTH) }, SOURCE)!;
    expect(legacy.verifiedTruth).toBe(FORMULA_TRUTH);
    expect(legacy.others).toBeUndefined();
    const stored = readSourceCorrectionWarning({ documentClaim: FORMULA_CLAIM, verifiedTruth: FORMULA_TRUTH, explanation: "" });
    expect(allCorrections(stored)).toHaveLength(1);
    const round = readSourceCorrectionWarning(JSON.parse(JSON.stringify(readModelSourceCorrection(RAW, SOURCE))));
    expect(allCorrections(round)).toHaveLength(2);
  });

  it("her öğe ayrı denetlenir: kaynakta geçmeyen, düşük güvenli, yinelenen ya da aynı ilişkiyi söyleyen öğe atılır", () => {
    const warning = readModelSourceCorrection(
      {
        corrections: [
          item("Kaynakta olmayan bir cümle burada.", "Başka bir cümle."),
          item(VERBAL_CLAIM, VERBAL_TRUTH, { confidence: "orta" }),
          item(FORMULA_CLAIM, FORMULA_TRUTH),
          item(FORMULA_CLAIM, FORMULA_TRUTH),
          item(VERBAL_CLAIM, "Sabit koşulda alfa niceliği artarsa beta niceliği de artar."),
        ],
      },
      SOURCE,
    )!;
    expect(allCorrections(warning).map((one) => one.documentClaim)).toEqual([FORMULA_CLAIM]);
    expect(readModelSourceCorrection({ corrections: [] }, SOURCE)).toBeNull();
  });

  it("denetim istemi bütün hataları ve sözel kuralları ister; yanıt biçimi dizi", () => {
    expect(SOURCE_CORRECTION_TASK).toContain("HEPSİNİ");
    expect(SOURCE_CORRECTION_TASK).toContain("SÖZLE");
    expect(SOURCE_CORRECTION_TASK).toContain('"corrections"');
    expect(NOTE_RULE_JSON_WITH_CORRECTION).toContain('"corrections"');
  });

  it("yazar istemi bütün düzeltmeleri ve şema/anahtar/yanılgı alanlarını anar", () => {
    const block = sourceCorrectionPromptBlock(readModelSourceCorrection(RAW, SOURCE));
    expect(block).toContain(`«${FORMULA_TRUTH}»`);
    expect(block).toContain(`«${VERBAL_TRUTH}»`);
    expect(block).toContain("2 hata");
    expect(block).toContain("commonMistake");
  });
});

describe("sözel kural bekçisi", () => {
  const warning = readModelSourceCorrection(RAW, SOURCE)!;

  it("cümlenin öne sürdüğü ilişki okunur", () => {
    expect(relationClaimOf(VERBAL_CLAIM)?.relation).toBe("direct");
    expect(relationClaimOf(VERBAL_TRUTH)?.relation).toBe("inverse");
    expect(relationClaimOf("Alfa niceliği ölçülür.")).toBeNull();
  });

  it("yanlış ilişki başka sözcüklerle de yakalanır; alıntı, ret ve doğrusu yakalanmaz", () => {
    expect(repeatsSourceError("Alfa niceliği yükselince beta niceliği de yükselir.", warning)).toBe(true);
    expect(repeatsSourceError("Alfa niceliği artarsa beta niceliği de artar.", warning)).toBe(true);
    expect(repeatsSourceError("Alfa niceliği artarsa beta niceliği azalır.", warning)).toBe(false);
    expect(repeatsSourceError("Kaynakta alfa niceliği artarsa beta niceliği de artar yazıyor; bu yanlış.", warning)).toBe(false);
    expect(repeatsSourceError("Alfa niceliği artarsa beta niceliğinin de arttığını sanmak bir yanılgıdır.", warning)).toBe(false);
    const stem = "Alfa niceliği iki katına çıkarsa beta niceliği nasıl değişir?";
    expect(quizKeyRepeatsSourceError({ text: stem, correct: ["İki katına çıkar."] }, warning)).not.toBeNull();
    expect(quizKeyRepeatsSourceError({ text: stem, correct: ["Yarıya iner."] }, warning)).toBeNull();
  });

  it("yanılgı alanı doğrusunu yanılgı diye gösteriyorsa yakalanır", () => {
    expect(presentsTruthAsMistake("Öğrenci, alfa niceliği iki katına çıkınca beta niceliğinin yarıya indiğini düşünebilir.", warning)).toBe(true);
    expect(presentsTruthAsMistake("Öğrenci, alfa niceliği artınca beta niceliğinin de arttığını düşünebilir.", warning)).toBe(false);
  });

  it("geç gelen uyarılar (kavram denetimi biçimi) tek uyarıda birleşir", () => {
    const late = lessonCorrectionNow({ lateNoteWarnings: () => correctionsAsNoteWarnings(warning) });
    expect(allCorrections(late)).toHaveLength(2);
  });
});

/* ───────────── Ders: metin, şema, soru anahtarı ve sık yapılan hata doğrusunu öğretir ───────────── */

function lesson(screenBlocks: unknown[], commonMistake = { claim: "Öğrenci, alfa niceliği artınca beta niceliğinin de arttığını düşünebilir.", correction: VERBAL_TRUTH }) {
  return readLessonV3({
    format: LESSON_V3_FORMAT,
    title: "Jenerik bağıntılar",
    objective: "Alfa ve beta niceliği arasındaki ilişkiyi açıklamak.",
    overview: "Alfa ve beta niceliği nasıl birlikte değişir?",
    screens: [
      { heading: "Birinci kavram", concept: "Birinci kavram", blocks: [{ type: "text", text: `Bağıntı ${FORMULA_TRUTH} biçimindedir.` }] },
      { heading: "İkinci kavram", concept: "İkinci kavram", blocks: screenBlocks },
    ],
    commonMistake,
    summary: [VERBAL_TRUTH],
  })!;
}

const INPUT = { runningHeaders: [], mode: "document" as const, pages: [{ page: 1, text: SOURCE }], sourceCorrection: readModelSourceCorrection(RAW, SOURCE) };
const CORRECTION_ISSUE = (issues: { problem: string }[]) => issues.filter((issue) => issue.problem.startsWith("Kaynak düzeltmesi"));

describe("ders bekçisi", () => {
  it("şema kartı, karşılaştırma ve soru anahtarı yanlışı öğretiyorsa ekran sorunu (yüksek) olur", () => {
    const wrong = lesson([
      { type: "text", text: "Sabit koşulda iki nicelik birlikte incelenir; alfa ve beta niceliği ölçülür." },
      { type: "diagram_card", diagramKind: "process_network", title: "Sabit koşulda ilişki", items: [{ label: "Alfa niceliği", detail: "İki katına çıkar" }, { label: "Beta niceliği", detail: "İki katına çıkar" }] },
      {
        type: "check",
        check: { type: "mcq", prompt: "Alfa niceliği iki katına çıkarsa beta niceliği nasıl değişir?", options: ["Yarıya iner.", "Değişmez.", "İki katına çıkar.", "Sıfır olur."], answerIndex: 2, explanation: "Beta niceliği de iki katına çıkar." },
      },
    ]);
    const issues = CORRECTION_ISSUE(screenStructureIssues(wrong.screens[1]!, 1, INPUT as never));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.problem).toContain(VERBAL_TRUTH);
  });

  it("doğrusunu öğreten ekranda ve yanlışı bilerek gösteren tuzak kartında sorun yok", () => {
    const right = lesson([
      { type: "text", text: VERBAL_TRUTH },
      { type: "exam_trap_card", trap: { title: "Yön tuzağı", wrong: "Alfa niceliği artarsa beta niceliği de artar.", right: "Alfa niceliği artarsa beta niceliği azalır." } },
      {
        type: "check",
        check: { type: "mcq", prompt: "Alfa niceliği iki katına çıkarsa beta niceliği nasıl değişir?", options: ["Yarıya iner.", "Değişmez.", "İki katına çıkar.", "Sıfır olur."], answerIndex: 0, explanation: "Beta niceliği yarıya iner." },
      },
    ]);
    expect(CORRECTION_ISSUE(screenStructureIssues(right.screens[1]!, 1, INPUT as never))).toHaveLength(0);
    expect(CORRECTION_ISSUE(lessonLevelStructureIssues(right, INPUT as never))).toHaveLength(0);
  });

  it("sık yapılan hata alanı doğrusunu yanılgı diye gösterirse ya da düzeltmesi yanlışı öğretirse sorun olur", () => {
    const truthAsMistake = lesson([{ type: "text", text: VERBAL_TRUTH }], {
      claim: "Öğrenci, alfa niceliği iki katına çıkınca beta niceliğinin yarıya indiğini düşünebilir.",
      correction: "Alfa niceliği iki katına çıkarsa beta niceliği de iki katına çıkar.",
    });
    const issues = CORRECTION_ISSUE(lessonLevelStructureIssues(truthAsMistake, INPUT as never));
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("belgesiz (konu) derste ya da düzeltme yokken bekçi çalışmaz", () => {
    const wrong = lesson([{ type: "text", text: VERBAL_CLAIM }]);
    expect(CORRECTION_ISSUE(screenStructureIssues(wrong.screens[1]!, 1, { ...INPUT, mode: "topic" } as never))).toHaveLength(0);
    expect(CORRECTION_ISSUE(screenStructureIssues(wrong.screens[1]!, 1, { ...INPUT, sourceCorrection: null } as never))).toHaveLength(0);
  });
});

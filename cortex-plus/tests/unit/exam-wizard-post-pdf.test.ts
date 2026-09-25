import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PREP_HOME_COPY,
  WIZARD_COPY,
  WIZARD_STEP_ORDER,
} from "@/lib/learning/exam-wizard-copy";
import { TUTOR_ANSWER_DISCIPLINE, tutorStylePrompt } from "@/lib/learning/tutor-style";
import { LESSON_V2_SCHEMA_HINT, REVIEW_VARIANT_RULE } from "@/lib/learning/teaching-standards";

const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
const lessonRoute = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
const lessonApi = readFileSync("src/app/api/learning/exam-prep/lesson/route.ts", "utf8");
const coach = readFileSync("src/app/api/learning/exam-prep/coach/route.ts", "utf8");

describe("post-PDF wizard order", () => {
  it("asks for topic edits, then modality, then focus, then the create CTA", () => {
    const shaping = wizard.indexOf('step === "shaping"');
    const topics = wizard.indexOf('step === "topics"');
    const modality = wizard.indexOf('step === "modality"');
    const focus = wizard.indexOf('step === "focus"');
    const plan = wizard.indexOf('step === "plan"');
    expect(shaping).toBeGreaterThan(0);
    expect(topics).toBeGreaterThan(shaping);
    expect(modality).toBeGreaterThan(topics);
    expect(focus).toBeGreaterThan(modality);
    expect(plan).toBeGreaterThan(focus);
    expect(WIZARD_STEP_ORDER.indexOf("language")).toBeLessThan(
      WIZARD_STEP_ORDER.indexOf("topics"),
    );
    expect(WIZARD_STEP_ORDER.indexOf("topics")).toBeLessThan(
      WIZARD_STEP_ORDER.indexOf("modality"),
    );
    expect(WIZARD_STEP_ORDER.indexOf("modality")).toBeLessThan(
      WIZARD_STEP_ORDER.indexOf("focus"),
    );
    expect(WIZARD_STEP_ORDER.indexOf("focus")).toBeLessThan(
      WIZARD_STEP_ORDER.indexOf("plan"),
    );
    expect(wizard).toContain("WIZARD_COPY");
    expect(wizard).toContain("WIZARD_STEP_ORDER");
    expect(WIZARD_COPY.languageTitle).toBe("Dil");
    expect(WIZARD_COPY.analyzing).toBe("Dosyaların inceleniyor...");
    expect(WIZARD_COPY.shapingTitle).toBe("Konular hazırlanıyor...");
    expect(WIZARD_COPY.editTopic).toBe("Konuyu değiştir");
    expect(WIZARD_COPY.addTopic).toBe("Konu ekle");
    expect(WIZARD_COPY.save).toBe("Kaydet");
    expect(WIZARD_COPY.cancel).toBe("İptal");
    expect(WIZARD_COPY.modalityTitle).toBe("Nasıl çalışmayı seversin?");
    expect(WIZARD_COPY.focusTitle).toBe("En çok neye odaklanalım?");
    expect(WIZARD_COPY.equalFocus).toBe("Tüm konulara eşit odaklan");
    expect(WIZARD_COPY.planningTitle).toBe("Çalışma planın hazırlanıyor...");
    expect(WIZARD_COPY.planningLead).toBe("Konular günlere yerleştiriliyor.");
    expect(WIZARD_COPY.planReady).toBe("Çalışma planın hazır!");
    expect(wizard).toContain("WIZARD_COPY.planningTitle");
    expect(wizard).toContain("WIZARD_COPY.planningLead");
    expect(wizard).not.toContain("Sıradaki soruyu");
    expect(wizard).not.toContain("soruyu hazırlıyor");
    expect(WIZARD_COPY.createCta).toBe("Sınav hazırlığı oluştur");
    expect(wizard).toContain("disabled={adding ? !addDirty : !changeDirty}");
    expect(wizard).not.toContain("zorlanıyorsun");
    expect(wizard).not.toContain("günlük planı başlat");
    expect(wizard).not.toContain("ExamSetupChat");
  });

  it("keeps the existing prep shell on path and progress", () => {
    expect(home).toContain("PREP_HOME_COPY");
    expect(PREP_HOME_COPY.path).toBe("Çalışma yolu");
    expect(PREP_HOME_COPY.topics).toBe("Konular");
    expect(PREP_HOME_COPY.materials).toBe("Materyaller");
    expect(PREP_HOME_COPY.progress).toBe("İlerleme");
    expect(PREP_HOME_COPY.startLearning).toBe("Hadi öğrenmeye başlayalım");
    expect(PREP_HOME_COPY.skillTree).toBe("Beceri ağacı");
    expect(PREP_HOME_COPY.allQuestions).toBe("Tüm sorular");
    expect(PREP_HOME_COPY.continue).toBe("Devam et");
    expect(PREP_HOME_COPY.masterySuffix).toBe("% hakimiyet");
    expect(PREP_HOME_COPY.noPractice).toBe("Henüz alıştırma yapılmadı.");
    expect(PREP_HOME_COPY.createLesson).toBe("Ders oluştur");
    expect(home).toContain("/ ${topicCount} konu");
    expect(home).toContain("PREP_HOME_COPY.startLearning");
    expect(home).toContain("PREP_HOME_COPY.materials");
    expect(home).toContain('view === "konular"');
    expect(home).toContain("groupNodesByPhase");
    expect(home).not.toContain("Konuyu değiştir");
    expect(home).not.toContain("Planın {topicCount}");
  });

  it("does not skip the lesson quality gate", () => {
    const start = lessonRoute.indexOf('if (input.kind === "lesson")');
    const lessonBlock = lessonRoute.slice(
      start,
      lessonRoute.indexOf('if (input.kind === "qa")', start),
    );
    expect(lessonBlock).toContain("lessonPublishIssues");
    expect(lessonBlock).toContain("lessonDraftForVerifier");
    expect(lessonBlock).toContain("verificationContext");
    expect(lessonBlock).toContain("allowIndependentAccept: false");
    expect(lessonApi).toContain("lessonPublishIssues");
    expect(lessonApi).toContain("lessonDraftForVerifier");
    expect(lessonApi).toContain("allowIndependentAccept: false");
  });

  it("keeps the tutor on hint-first discipline", () => {
    for (const style of ["step_by_step", "hints_first", "direct_solve"] as const) {
      const prompt = tutorStylePrompt(style);
      expect(prompt).toContain(TUTOR_ANSWER_DISCIPLINE);
      expect(prompt).toContain("Cevabı baştan yapıştırma");
      expect(prompt).toContain("tek ipucu veya tek adım");
      expect(prompt).toContain("Filler");
    }
    expect(coach).toContain("TUTOR_ANSWER_DISCIPLINE");
  });

  it("asks the lesson prompt for optional cards and does not require them", () => {
    expect(lessonRoute).toContain("LESSON_V2_SCHEMA_HINT");
    expect(LESSON_V2_SCHEMA_HINT).toContain("cards isteğe bağlı");
    expect(LESSON_V2_SCHEMA_HINT).toContain("uydurma kart ekleme");
    expect(LESSON_V2_SCHEMA_HINT).toContain("HIZLI SINAV");
    expect(LESSON_V2_SCHEMA_HINT).toContain("DOĞRU MU YANLIŞ");
    expect(LESSON_V2_SCHEMA_HINT).not.toContain("check.review");
    expect(LESSON_V2_SCHEMA_HINT).not.toContain('"review"?:');
    expect(LESSON_V2_SCHEMA_HINT).not.toContain('"review":{"prompt":string,"options"');
    expect(REVIEW_VARIANT_RULE).toContain("140 karakter");
    expect(REVIEW_VARIANT_RULE).not.toContain("review.options");
    expect(lessonRoute).toContain("REVIEW_VARIANT_RULE");
    expect(lessonRoute).toContain("export const maxDuration = 300");
    expect(lessonApi).toContain("REVIEW_VARIANT_RULE");
    expect(lessonApi).toContain("export const maxDuration = 300");
    const podcastStart = lessonRoute.indexOf('if (input.kind === "podcast")');
    const podcastBlock = lessonRoute.slice(
      podcastStart,
      lessonRoute.indexOf('if (input.kind === "oral")', podcastStart),
    );
    expect(podcastBlock).not.toContain("REVIEW_VARIANT_RULE");
    expect(podcastBlock).toContain("podcastDraftForVerifier");
  });
});

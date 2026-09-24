import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
const lessonRoute = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");

describe("post-PDF wizard order", () => {
  it("asks for topic edits, then modality, then focus, then the create CTA", () => {
    const topics = wizard.indexOf('step === "topics"');
    const modality = wizard.indexOf('step === "modality"');
    const focus = wizard.indexOf('step === "focus"');
    const plan = wizard.indexOf('step === "plan"');
    expect(topics).toBeGreaterThan(0);
    expect(modality).toBeGreaterThan(topics);
    expect(focus).toBeGreaterThan(modality);
    expect(plan).toBeGreaterThan(focus);
    expect(wizard).toContain("Konuyu değiştir");
    expect(wizard).toContain("Konu ekle");
    expect(wizard).toContain("Okuyarak");
    expect(wizard).toContain("Dinleyerek");
    expect(wizard).toContain("İzleyerek");
    expect(wizard).toContain("Pratik yaparak");
    expect(wizard).toContain("Sen karar ver");
    expect(wizard).toContain("Tüm konulara eşit odaklan");
    expect(wizard).toContain("Sınav hazırlığı oluştur");
    expect(wizard).toContain("Dosyaların inceleniyor...");
    expect(wizard).not.toContain("zorlanıyorsun");
    expect(wizard).not.toContain("günlük planı başlat");
    expect(wizard).not.toContain("ExamSetupChat");
  });

  it("keeps the prep home on topic count and the start CTA", () => {
    expect(home).toContain("Çalışma yolu");
    expect(home).toContain("Konular");
    expect(home).toContain("Materyaller");
    expect(home).toContain("Hadi öğrenmeye başlayalım");
    expect(home).toContain("Planın {topicCount}");
    expect(home).toContain("/ ${topicCount} konu");
  });

  it("asks the lesson prompt for optional cards and does not require them", () => {
    expect(lessonRoute).toContain("cards isteğe bağlı");
    expect(lessonRoute).toContain("uydurma kart ekleme");
  });
});

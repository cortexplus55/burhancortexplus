import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");
const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
const lessonRoute = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");

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
    expect(wizard).toContain(">Dil<");
    expect(wizard).toContain("Konular hazırlanıyor...");
    expect(wizard).toContain("Konuyu değiştir");
    expect(wizard).toContain("Konu ekle");
    expect(wizard).toContain("Kaydet");
    expect(wizard).toContain("İptal");
    expect(wizard).toContain("disabled={adding ? !addDirty : !changeDirty}");
    expect(wizard).toContain("Okuyarak");
    expect(wizard).toContain("Dinleyerek");
    expect(wizard).toContain("İzleyerek");
    expect(wizard).toContain("Pratik yaparak");
    expect(wizard).toContain("Sen karar ver");
    expect(wizard).toContain("Nasıl çalışmayı seversin?");
    expect(wizard).toContain("En çok neye odaklanalım?");
    expect(wizard).toContain("Tüm konulara eşit odaklan");
    expect(wizard).toContain("Çalışma planın hazır!");
    expect(wizard).toContain("Sınav hazırlığı oluştur");
    expect(wizard).toContain("Dosyaların inceleniyor...");
    expect(wizard).not.toContain("zorlanıyorsun");
    expect(wizard).not.toContain("günlük planı başlat");
    expect(wizard).not.toContain("ExamSetupChat");
  });

  it("keeps the existing prep shell on path and progress", () => {
    expect(home).toContain("Çalışma yolu");
    expect(home).toContain("İlerleme");
    expect(home).toContain("Beceri ağacı");
    expect(home).toContain("Tüm sorular");
    expect(home).toContain("Devam et");
    expect(home).toContain("% hakimiyet");
    expect(home).toContain("Henüz alıştırma yapılmadı.");
    expect(home).toContain("Ders oluştur");
    expect(home).toContain("/ ${topicCount} konu");
    expect(home).not.toContain("Hadi öğrenmeye başlayalım");
    expect(home).not.toContain("Materyaller");
    expect(home).not.toContain("Konuyu değiştir");
    expect(home).not.toContain('view === "konular"');
    expect(home).not.toContain("Planın {topicCount}");
  });

  it("asks the lesson prompt for optional cards and does not require them", () => {
    expect(lessonRoute).toContain("cards isteğe bağlı");
    expect(lessonRoute).toContain("uydurma kart ekleme");
  });
});

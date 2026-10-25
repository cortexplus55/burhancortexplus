import { describe, expect, it } from "vitest";
import {
  cleanFeedbackText,
  feedbackKicker,
  gapLines,
  ratingPrompt,
  replayLabel,
  startActionLabel,
} from "@/lib/learning/feedback-copy";
import { extractMisconceptions } from "@/lib/learning/teaching-standards";

describe("etkinlik metinleri", () => {
  it("doğru cevapta ipucu ve otomatik ek kalmaz", () => {
    expect(feedbackKicker(true)).toBe("Çözüm Mantığı");
    expect(feedbackKicker(false)).toBe("İpucu");
    expect(cleanFeedbackText("İpucu: Birimi ne? Kuvvet newton ile ölçülür.")).toBe("Kuvvet newton ile ölçülür.");
    expect(cleanFeedbackText("İpucu, denetimin parçası. Asıl açıklama.")).toBe("Asıl açıklama.");
  });

  it("kapı, tekrar ve puan kartı türe göre yazar", () => {
    expect(startActionLabel("flashcards")).toBe("Kartları Hazırla");
    expect(startActionLabel("qa")).toBe("Soru-Cevabı Başlat");
    expect(startActionLabel("oral")).toBe("Sözlü Sınavı Başlat");
    expect(startActionLabel("quiz")).toBe("Testi oluştur");
    expect(replayLabel("quiz")).toBe("Testi tekrarla");
    expect(replayLabel("oral")).toBe("Sözlüyü tekrarla");
    expect(replayLabel("lesson")).toBe("Dersi tekrarla");
    expect(ratingPrompt("quiz")).toBe("Bu testi nasıl buldun?");
    expect(ratingPrompt("oral")).toBe("Bu sözlüyü nasıl buldun?");
    expect(ratingPrompt("lesson")).toBe("Bu dersi nasıl buldun?");
  });

  it("bilgi eksiğinin başlığı konu, alt satırı öğrencinin cevabı", () => {
    expect(gapLines({ claim: "B seçeneği", topicLabel: "Hücre zarı", detail: "Enerji üretir" })).toEqual({
      title: "Hücre zarı",
      detail: "Enerji üretir",
    });
    expect(gapLines({ claim: "B seçeneği", topicLabel: null }).title).toBe("Bu konu");
    const drafts = extractMisconceptions({
      kind: "quiz",
      topicLabel: "Hücre",
      answers: { "0": "Enerji üretir" },
      payload: {
        type: "quiz",
        questions: [{
          text: "Zar ne işe yarar?",
          learningObjective: "Seçici geçirgenlik",
          options: ["Seçici geçirgenlik", "Enerji üretir"],
          correct: ["Seçici geçirgenlik"],
          topic: "Hücre zarı",
        }],
      },
    });
    expect(drafts[0]?.claim).toBe("Seçici geçirgenlik");
    expect(drafts[0]?.topicLabel).toBe("Hücre zarı");
    expect(drafts[0]?.questionPreview).toBe("Enerji üretir");
  });
});

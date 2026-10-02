import { describe, expect, it } from "vitest";
import {
  TUTOR_RULES,
  TUTOR_VERIFY_SYSTEM,
  hasTemplateLabels,
  tutorRetryNote,
  tutorSystemPrompt,
  tutorVerifyUserPrompt,
} from "@/lib/ai/teacher-tutor";

/*
  Öğretmen sohbeti (2 Ekim 2026). Astra'nın aynı KPSS belgesiyle gözlenen
  tavrı: karşılık → ayırt ettiren ölçüt → karşılaştırma → sınav ipucu →
  tek kontrol sorusu; belge dışı soruda belgedeki karşılığa bağlama.
*/
describe("öğretmen sohbeti istemi", () => {
  const passages = [{ label: "KPSS.pdf s.9", text: "Kesin hükümsüzlükte zamanaşımı yoktur; iptal edilebilirlikte hak düşürücü süre vardır." }];

  it("kaynak kuralı, öğretmen tavrı ve kalıp yasağı istemde", () => {
    expect(TUTOR_RULES).toContain("KAYNAK KURALI");
    expect(TUTOR_RULES).toContain("Bu senin belgende geçmiyor");
    expect(TUTOR_RULES).toContain("ayırt ettiren tek ölçütü");
    expect(TUTOR_RULES).toContain("cevabı hemen verme");
    expect(TUTOR_RULES).toContain("TEK bir soruyla bitir");
    expect(TUTOR_RULES).toContain("Etiketli kalıp kullanma");
    expect(TUTOR_VERIFY_SYSTEM).toContain("dayanağı olmayan");
  });

  it("bağlam, bekleyen cevap ve pasajlar sisteme girer", () => {
    const prompt = tutorSystemPrompt({
      examTitle: "KPSS Vatandaşlık",
      daysLeft: 18,
      topic: "Hükümsüzlük",
      learnerLines: ["Öğrenci stresli: adımları kısa tut."],
      passages,
      pendingAnswer: "Nispi butlan",
    });
    expect(prompt).toContain("KPSS Vatandaşlık için çalışıyor; sınava 18 gün var; şu an \"Hükümsüzlük\" konusunda");
    expect(prompt).toContain("Öğrenci stresli");
    expect(prompt).toContain("beklenen cevabı: Nispi butlan");
    expect(prompt).toContain("[KPSS.pdf s.9]");
  });

  it("pasaj yoksa uydurmaması söylenir", () => {
    expect(tutorSystemPrompt({ passages: [] })).toContain("bu soruyla ilgili pasaj bulunamadı");
  });

  it("denetim istemi pasaj, soru ve cevabı taşır; düzeltme notu sorunları sayar", () => {
    const verify = tutorVerifyUserPrompt({ passages, question: "Fark nedir?", answer: "Kesin hükümsüzlükte süre yoktur." });
    expect(verify).toContain("ÖĞRENCİ: Fark nedir?");
    expect(verify).toContain("[KPSS.pdf s.9]");
    expect(tutorRetryNote(["50 yıl belgede yok"])).toContain("1. 50 yıl belgede yok");
  });

  it("eski kalıbın etiketleri tanınır", () => {
    expect(hasTemplateLabels("1. **Nerede takıldığın:** …\n2. Tek ipucu: …")).toBe(true);
    expect(hasTemplateLabels("Bu çok anlaşılır bir karışıklık. Ayırt eden şey …")).toBe(false);
  });
});

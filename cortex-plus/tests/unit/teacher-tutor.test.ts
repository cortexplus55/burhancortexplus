import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TUTOR_RULES,
  TUTOR_VERIFY_SYSTEM,
  hasTemplateLabels,
  parseTutorIssues,
  teacherStyleLine,
  tutorHistoryLine,
  tutorHistoryText,
  tutorRetryNote,
  tutorSystemPrompt,
  tutorVerifyUserPrompt,
} from "@/lib/ai/teacher-tutor";
import { rerankByOverlap } from "@/lib/learning/prep-corpus";

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

  it("denetçi cevabından yalnız yüksek sorunlar, düzeltme önerisiyle", () => {
    expect(
      parseTutorIssues({
        issues: [
          { severity: "high", problem: "50 yıl belgede yok", fix: "süreyi çıkar" },
          { severity: "low", problem: "uzun" },
          { problem: "ciddiyetsiz sayılır yüksek" },
          { x: 1 },
        ],
      }),
    ).toEqual(["50 yıl belgede yok → süreyi çıkar", "ciddiyetsiz sayılır yüksek"]);
    expect(parseTutorIssues(null)).toEqual([]);
  });

  it("geçmişteki öğretmen mesajından kaynak, öneri ve kontrol işaretleri atılır", () => {
    const old = 'Kesin hükümsüzlükte süre yoktur.\n[[kaynak:KPSS.pdf|9|sayfa|/dokumanlar/x]]\n[[chip:Benzer soru|Buna benzer]]\n[[cek:{"kind":"term","answer":"Nispi butlan"}]]';
    expect(tutorHistoryText(old)).toBe("Kesin hükümsüzlükte süre yoktur.");
  });

  it("tarz satırı eski üç adımlı kalıbı taşımaz", () => {
    for (const style of ["step_by_step", "hints_first", "direct_solve"] as const) {
      const line = teacherStyleLine(style);
      expect(line).not.toMatch(/nerede takıldı|tek ipucu|kontrol sorusu|genel ilke/i);
    }
    expect(tutorHistoryLine([])).toBe("");
    expect(tutorHistoryLine([{ label: "Deneme yanlışı", summary: "Nispi butlan" }])).toContain("- Deneme yanlışı: Nispi butlan");
  });
});

describe("sohbet pasajları kelime ve sayı örtüşmesiyle yeniden sıralanır", () => {
  it("sayılı soruda aynı örneği taşıyan sayfa öne geçer", () => {
    const matches = [
      { page: 12, similarity: 0.639, content: "11. İdeal Gaz Denklemi ve Gaz Sabiti. Düşük yoğunlukta gaz PV = mRT; basınç ve sıcaklık mutlak alınır." },
      { page: 6, similarity: 0.629, content: "5. Basınç, Mutlak Basınç ve Manometre Basıncı. Basınç birim alana düşen kuvvettir." },
      { page: 14, similarity: 0.536, content: "13. İş: Sınır İşi. Sabit basınç: W = P(V₂ - V₁). Gaz 200 kPa sabit basınçta 0.10 m³'ten 0.30 m³'e genleşiyor. W = 40 kJ." },
    ];
    const ranked = rerankByOverlap("200 kPa sabit basınçta 0.1 m³'ten 0.3 m³'e genleşen gazın işini nasıl bulurum?", matches);
    expect(ranked[0].page).toBe(14);
    // Örtüşme yoksa anlam sırası korunur.
    expect(rerankByOverlap("?", matches).map((m) => m.page)).toEqual([12, 6, 14]);
  });

  it("sohbet, konu kimliği olmadan açılan düğüm dersini de son ders sayar", () => {
    const source = readFileSync("src/lib/learning/exam-chat-context.ts", "utf8");
    expect(source).toContain('.from("exam_prep_node_attempts")');
    expect(source).toContain('.eq("payload->>type", "lesson")');
  });

  it("hazırlık sohbeti geniş getirip yeniden sıralar", () => {
    const source = readFileSync("src/lib/learning/prep-chat-grounding.ts", "utf8");
    expect(source).toContain("rerankByOverlap(message, wide).slice(0, 4)");
  });
});

describe("sohbet uç noktası öğretmen yolunu kullanır", () => {
  const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");

  it("bayrakla, hazırlık sohbetinde; eski denetçiler bu yolda çalışmaz", () => {
    expect(route).toContain('env.TUTOR_ENGINE === "teacher"');
    expect(route).toContain("runTeacherTutor(");
    expect(route).toContain("const attemptLimit = teacherTutor ? 0 : paidChatAttempts(offDocument);");
    // Eski kalıbın kaynağı olan tarz istemi öğretmen yoluna girmez.
    const teacherBlock = route.slice(route.indexOf("if (teacherTutor && prepGrounding)"), route.indexOf("const attemptLimit"));
    expect(teacherBlock).not.toContain("tutorStylePrompt");
    expect(teacherBlock).not.toContain("polishPrep");
    expect(teacherBlock).toContain("teacherStyleLine");
  });
});

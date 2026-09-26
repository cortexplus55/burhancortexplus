import { describe, expect, it } from "vitest";
import { contentDifficultyLine } from "@/lib/learning/session-signals";
import {
  QA_TEACHER_PROMPT,
  TUTOR_ANSWER_DISCIPLINE,
  tutorStylePrompt,
} from "@/lib/learning/tutor-style";

describe("tutor prompt snapshot", () => {
  it("locks the hint-first discipline for every style", () => {
    expect(tutorStylePrompt("step_by_step")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci adım adım stili seçti: her adımı gerekçelendir, bir seferde tüm çözümü dökme.`,
    );
    expect(tutorStylePrompt("hints_first")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci ipucu öncelikli stili seçti: tam çözümü başta verme.`,
    );
    expect(tutorStylePrompt("direct_solve")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci doğrudan çözüm istedi: ancak açıkça isterse tam çözümü kısa ve gerekçeli ver; istemediyse yine tek adım.`,
    );
    expect(TUTOR_ANSWER_DISCIPLINE).toMatchInlineSnapshot(
      `"Cevabı baştan yapıştırma. Her yanıtta sırayla: (1) öğrencinin nerede takıldığı, (2) tek ipucu veya tek adım, (3) kontrol sorusu. Tam çözümü ancak öğrenci açıkça isterse yaz. Yanlış bir denemede AÇIKLAMA ver: tutan kısmı öv, hatayı adıyla söyle, doğru çözümü göster, benzer mini soru sor. Doğruyu tekrarlayıp geçme. Türkçe, sınav dili, net cümle. Boş alkış yok; sıcak ama somut geribildirim var (Tam isabet / Neredeyse / Tekrar bakalım). Etiket yığını yazma: Hüküm:, Doğru parça:, Yanlış parça: kullanma. Formülleri $...$ veya $$...$$ ile yaz; kimya için \\ce{...} kullan. RAG veya ders metni varsa ona bağlı kal; kaynakta yoksa uydurma, genel ilkeyi söyle ve notlarında ilgili başlığa bakmasını yaz."`,
    );
    expect(QA_TEACHER_PROMPT).toContain("misconceptionTag");
    expect(QA_TEACHER_PROMPT).toContain("Filler yok");
  });
});

describe("exam item difficulty follows focus and diagnosis", () => {
  it("starts easier on a focus topic or a weak measurement", () => {
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "basics",
        focusTopic: true,
        measuredLevel: "solid",
      }),
    ).toContain("odak konusu");
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "good",
        focusTopic: false,
        measuredLevel: "weak",
      }),
    ).toContain("düşük tanı");
  });

  it("uses exam-level distractors when the diagnosis is solid", () => {
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "good",
        focusTopic: false,
        measuredLevel: "solid",
      }),
    ).toContain("sınav seviyesinde");
  });
});

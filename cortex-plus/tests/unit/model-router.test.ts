import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { lessonModel, selectModel } from "@/lib/ai/model-router";

const STANDARD = env.OPENAI_STANDARD_MODEL;
const ADVANCED = env.OPENAI_ADVANCED_MODEL;

describe("ders modeli", () => {
  it("abone büyük modeli, ücretsiz hesap küçüğünü alır", () => {
    expect(lessonModel(true)).toBe(env.OPENAI_LESSON_MODEL);
    expect(lessonModel(false)).toBe(env.OPENAI_LESSON_FREE_MODEL);
    expect(lessonModel(true)).not.toBe(lessonModel(false));
  });
});

describe("model router", () => {
  it("always routes image work to the advanced model", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_STANDARD",
      isPremium: false,
      hasImage: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("IMAGE_SOLUTION");
  });

  it("keeps free chat on the standard model", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_STANDARD",
      isPremium: false,
      hasImage: false,
    });
    expect(result.model).toBe(STANDARD);
    expect(result.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("honours an explicit advanced request from a premium user", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: true,
      hasImage: false,
      userSelectedAdvanced: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("AI_CHAT_ADVANCED");
  });

  /*
    Bu testin adı hep "downgrades" idi ama `toBe(ADVANCED)` diyordu — yani
    adının tam tersini doğruluyordu. Sızıntıyı tutan değil, yazan testti:
    ücretsiz bir hesap sohbet ucuna AI_CHAT_ADVANCED gönderip gpt-4o alıyordu.
    İddia adına uyduruldu; kredi kodunun da düşmesi ayrıca tutuluyor, çünkü
    standart model alan kullanıcıya gelişmiş fiyat yazılmamalı.
  */
  it("downgrades an advanced request from a non-premium user", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: false,
      hasImage: false,
      userSelectedAdvanced: true,
    });
    expect(result.model).toBe(STANDARD);
    expect(result.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("keeps the advanced model for a premium user who asks for it", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: true,
      hasImage: false,
      userSelectedAdvanced: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("AI_CHAT_ADVANCED");
  });

  it.each([
    "PRACTICE_EXAM_GENERATE",
    "PRACTICE_EXAM_GRADE",
  ] as const)("keeps %s on the standard model for a free account", (actionCode) => {
    const result = selectModel({ actionCode, isPremium: false, hasImage: false });
    expect(result.model).toBe(STANDARD);
  });

  /*
    gpt-4o-mini trigonometri düellosunda 24 sorudan 3ünü doğrulayıcıdan
    geçirebildi, gpt-4.1-mini 14ünü (30 Eylül 2026). Ücretsiz test taslağı
    ücretsiz dersinkiyle aynı küçük model — ama gelişmiş model değil.
  */
  it("gives a free account the free lesson model for quizzes, never the advanced one", () => {
    const result = selectModel({ actionCode: "QUIZ_GENERATE", isPremium: false, hasImage: false, difficulty: "hard" });
    expect(result.model).toBe(env.OPENAI_LESSON_FREE_MODEL);
    expect(result.model).not.toBe(ADVANCED);
    expect(result.actionCode).toBe("QUIZ_GENERATE");
  });

  /*
    "hard" degeri istemciden geliyor, yani ucretsiz hesap kendi isine ileri
    diyip pahali modeli alabiliyordu. Yukseltme artik abonelik istiyor.
  */
  it("escalates hard exam grading only for a premium account", () => {
    const free = selectModel({
      actionCode: "PRACTICE_EXAM_GRADE",
      isPremium: false,
      hasImage: false,
      difficulty: "hard",
    });
    expect(free.model).toBe(STANDARD);

    const paid = selectModel({
      actionCode: "PRACTICE_EXAM_GRADE",
      isPremium: true,
      hasImage: false,
      difficulty: "hard",
    });
    expect(paid.model).toBe(ADVANCED);
  });

  /*
    Uzun belge yukseltmesi en sessiz ve en pahali yoldu: 40 sayfalik bir PDF'i
    gelismis modelle islemek 2 kredilik eylemin karsiladigindan cok fazla.
  */
  it("escalates large document jobs only for a premium account", () => {
    const free = selectModel({
      actionCode: "DOCUMENT_PAGE_PROCESS",
      isPremium: false,
      hasImage: false,
      documentPages: 40,
    });
    expect(free.model).toBe(STANDARD);

    const paid = selectModel({
      actionCode: "DOCUMENT_PAGE_PROCESS",
      isPremium: true,
      hasImage: false,
      documentPages: 40,
    });
    expect(paid.model).toBe(ADVANCED);
  });

  it("uses the advanced model for premium quiz generation", () => {
    expect(
      selectModel({
        actionCode: "QUIZ_GENERATE",
        isPremium: true,
        hasImage: false,
      }).model,
    ).toBe(ADVANCED);
  });

  it("keeps flashcards cheap", () => {
    const result = selectModel({
      actionCode: "FLASHCARD_GENERATE",
      isPremium: true,
      hasImage: false,
    });
    expect(result.model).toBe(STANDARD);
  });
});

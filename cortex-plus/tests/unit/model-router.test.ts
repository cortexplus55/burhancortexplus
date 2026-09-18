import { describe, expect, it } from "vitest";
import { selectModel } from "@/lib/ai/model-router";

const STANDARD = "gpt-4o-mini";
const ADVANCED = "gpt-4o";

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
    "QUIZ_GENERATE",
    "PRACTICE_EXAM_GENERATE",
    "PRACTICE_EXAM_GRADE",
  ] as const)("keeps %s on the standard model for a free account", (actionCode) => {
    const result = selectModel({ actionCode, isPremium: false, hasImage: false });
    expect(result.model).toBe(STANDARD);
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

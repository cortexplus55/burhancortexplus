import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { contentModel, lessonModel, selectModel } from "@/lib/ai/model-router";
import { isReasoningModel, samplingParams } from "@/lib/ai/model-params";

/*
  2 Ekim 2026, ürün sahibinin kararı: içerik ve öğretmen işleri herkes için
  tek asıl modelde (gpt-6-luna). Eski kademe ayrımı (abone gpt-4.1, ücretsiz
  gpt-4.1-mini, sohbet gpt-4o-mini, zor soruda yükseltme) kaldırıldı.
*/
const CONTENT = env.OPENAI_CONTENT_MODEL;

describe("asıl model", () => {
  it("varsayılan gpt-6-luna; ders ve podcast kademeden bağımsız", () => {
    expect(env.OPENAI_CONTENT_MODEL).toBe(process.env.OPENAI_CONTENT_MODEL ?? "gpt-6-luna");
    expect(contentModel()).toBe(CONTENT);
    expect(lessonModel(true)).toBe(CONTENT);
    expect(lessonModel(false)).toBe(CONTENT);
  });

  it.each([
    "AI_CHAT_STANDARD",
    "AI_CHAT_ADVANCED",
    "QUIZ_GENERATE",
    "FLASHCARD_GENERATE",
    "PRACTICE_EXAM_GENERATE",
    "PRACTICE_EXAM_GRADE",
    "STUDY_PLAN_GENERATE",
  ] as const)("%s hem abonede hem ücretsizde asıl modelde", (actionCode) => {
    for (const isPremium of [true, false]) {
      expect(selectModel({ actionCode, isPremium, hasImage: false, difficulty: "hard" }).model).toBe(CONTENT);
    }
  });

  it("fotoğraflı soru da asıl modelde (görsel girdiyi kabul ediyor)", () => {
    const result = selectModel({ actionCode: "AI_CHAT_STANDARD", isPremium: false, hasImage: true });
    expect(result.model).toBe(CONTENT);
    expect(result.actionCode).toBe("IMAGE_SOLUTION");
  });

  it("yükseltme dalı yok: model bizim seçimimiz, kredi değişmez", () => {
    const route = selectModel({ actionCode: "AI_CHAT_STANDARD", isPremium: true, hasImage: false, difficulty: "hard" });
    expect(route.upgrade).toBeNull();
    expect(route.actionCode).toBe("AI_CHAT_STANDARD");
  });

  /*
    Kredi kuralı aynı: ücretsiz hesap AI_CHAT_ADVANCED gönderse de standart
    sohbet kredisi öder; gelişmiş fiyat yalnız aboneye yazılır.
  */
  it("gelişmiş sohbet kredisi yalnız aboneye yazılır", () => {
    expect(selectModel({ actionCode: "AI_CHAT_ADVANCED", isPremium: false, hasImage: false }).actionCode).toBe(
      "AI_CHAT_STANDARD",
    );
    expect(selectModel({ actionCode: "AI_CHAT_ADVANCED", isPremium: true, hasImage: false }).actionCode).toBe(
      "AI_CHAT_ADVANCED",
    );
  });

  it("belge işleme öğretmiyor: standart, uzun belgede abone gelişmiş", () => {
    expect(selectModel({ actionCode: "DOCUMENT_PAGE_PROCESS", isPremium: false, hasImage: false, documentPages: 40 }).model).toBe(
      env.OPENAI_STANDARD_MODEL,
    );
    expect(selectModel({ actionCode: "DOCUMENT_PAGE_PROCESS", isPremium: true, hasImage: false, documentPages: 40 }).model).toBe(
      env.OPENAI_ADVANCED_MODEL,
    );
  });
});

describe("akıl yürüten modelde örnekleme parametreleri", () => {
  it("gpt-5/gpt-6/o-serisi akıl yürüten sayılır", () => {
    expect(isReasoningModel("gpt-6-luna")).toBe(true);
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(isReasoningModel("gpt-4.1")).toBe(false);
    expect(isReasoningModel("gpt-4o-mini")).toBe(false);
  });

  it("akıl yürüten modele temperature ve max_tokens gitmez; bütçe akıl yürütmeye yer bırakır", () => {
    expect(samplingParams("gpt-6-luna", { temperature: 0.3, maxTokens: 40 })).toEqual({ max_completion_tokens: 2000 });
    expect(samplingParams("gpt-6-luna", { temperature: 0.4 })).toEqual({});
    expect(samplingParams("gpt-6-luna", { maxTokens: 3000 })).toEqual({ max_completion_tokens: 24000 });
    expect(samplingParams("gpt-4o-mini", { temperature: 0, maxTokens: 180 })).toEqual({ temperature: 0, max_tokens: 180 });
  });
});

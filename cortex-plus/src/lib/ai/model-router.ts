import { env, type ActionCode } from "@/lib/env";

export type ModelRouterInput = {
  actionCode: ActionCode;
  isPremium: boolean;
  hasImage: boolean;
  documentPages?: number;
  difficulty?: "easy" | "medium" | "hard";
  userSelectedAdvanced?: boolean;
};

const ADVANCED_ACTIONS: ActionCode[] = [
  "AI_CHAT_ADVANCED",
  "IMAGE_SOLUTION",
  "QUIZ_GENERATE",
  "PRACTICE_EXAM_GENERATE",
  "PRACTICE_EXAM_GRADE",
];

export function selectModel(input: ModelRouterInput): {
  model: string;
  actionCode: ActionCode;
} {
  if (input.hasImage) {
    return { model: env.OPENAI_ADVANCED_MODEL, actionCode: "IMAGE_SOLUTION" };
  }

  if (
    input.userSelectedAdvanced &&
    input.isPremium &&
    input.actionCode.startsWith("AI_CHAT")
  ) {
    return {
      model: env.OPENAI_ADVANCED_MODEL,
      actionCode: "AI_CHAT_ADVANCED",
    };
  }

  /*
    Gelişmiş model ödeme gerekçesi; istemekle gelmiyor.

    Burada `input.actionCode === "AI_CHAT_ADVANCED"` de yazıyordu ve bir
    üstteki premium kontrolünü işlevsiz bırakıyordu: ücretsiz bir hesap sohbet
    ucuna `actionCode: "AI_CHAT_ADVANCED"` göndererek gpt-4o alıyordu. Kademe
    modelinin sattığı şey "daha akıllı model"di ve isteyene bedavaydı.

    Aşağıdaki `standardMap` düşürmesi tam bu durum için yazılmış ama o satır
    yüzünden hiç çalışmıyordu. Artık çalışıyor: premium olmayan gelişmiş
    sohbet isteği standart modele düşüyor ve kredisi de 3 yerine 1 yazılıyor —
    aldığı hizmetin fiyatı.
  */
  if (ADVANCED_ACTIONS.includes(input.actionCode)) {
    if (input.isPremium || input.difficulty === "hard") {
      return { model: env.OPENAI_ADVANCED_MODEL, actionCode: input.actionCode };
    }
  }

  if ((input.documentPages ?? 0) > 10) {
    return {
      model: env.OPENAI_ADVANCED_MODEL,
      actionCode: input.actionCode,
    };
  }

  const standardMap: Partial<Record<ActionCode, ActionCode>> = {
    AI_CHAT_ADVANCED: "AI_CHAT_STANDARD",
  };

  return {
    model: env.OPENAI_STANDARD_MODEL,
    actionCode: standardMap[input.actionCode] ?? input.actionCode,
  };
}

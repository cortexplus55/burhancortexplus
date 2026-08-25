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

  if (ADVANCED_ACTIONS.includes(input.actionCode)) {
    if (
      input.actionCode === "AI_CHAT_ADVANCED" ||
      input.isPremium ||
      input.difficulty === "hard"
    ) {
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

/**
 * Adaptive content OpenAI helper — 0 student credits; usage telemetry only.
 * mini → one repair → gpt-4o escalation.
 */

import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { recordUsage, type UsageCode } from "@/lib/credits/service";
import {
  routeTutorModel,
  type TutorEscalationReason,
} from "@/lib/adaptive/tutor-model-router";
import type { TutorModel } from "@/lib/adaptive/types";

export type AdaptiveLlmResult<T> = {
  ok: true;
  data: T;
  model: TutorModel;
  modelId: string;
  escalationReasons: TutorEscalationReason[];
  repaired: boolean;
} | {
  ok: false;
  error: string;
  escalationReasons: TutorEscalationReason[];
};

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: 45_000,
    maxRetries: 0,
  });
}

async function chatJson(
  client: OpenAI,
  modelId: string,
  system: string,
  user: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const completion = await client.chat.completions.create({
    model: modelId,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return {
    text: completion.choices[0]?.message?.content ?? "",
    tokensIn: completion.usage?.prompt_tokens ?? 0,
    tokensOut: completion.usage?.completion_tokens ?? 0,
  };
}

export async function generateAdaptiveJson<T>(input: {
  service: SupabaseClient;
  userId: string;
  actionCode: UsageCode;
  system: string;
  user: string;
  parse: (raw: unknown) => T | null;
  routerEnabled: boolean;
  forceEscalate?: boolean;
  advancedReasoning?: boolean;
  highImpactAssessment?: boolean;
  conflictingConcepts?: boolean;
}): Promise<AdaptiveLlmResult<T>> {
  const client = getClient();
  if (!client) {
    return { ok: false, error: "ai_not_configured", escalationReasons: [] };
  }

  const initial = routeTutorModel({
    routerEnabled: input.routerEnabled,
    jevNeedsGpt4o: false,
    advancedReasoning: input.advancedReasoning,
    highImpactAssessment: input.highImpactAssessment,
    conflictingConcepts: input.conflictingConcepts,
    modelFailure: input.forceEscalate,
  });

  const tryParse = (text: string): T | null => {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      const raw = JSON.parse(match ? match[0] : text) as unknown;
      return input.parse(raw);
    } catch {
      return null;
    }
  };

  const reasons: TutorEscalationReason[] = [...initial.reasons];
  let model: TutorModel = initial.model;
  let modelId = initial.modelId;

  // Pass 1: default (usually mini)
  try {
    const first = await chatJson(client, modelId, input.system, input.user);
    void recordUsage(input.service, {
      userId: input.userId,
      actionCode: input.actionCode,
      model: modelId,
      tokensIn: first.tokensIn,
      tokensOut: first.tokensOut,
    });
    const parsed = tryParse(first.text);
    if (parsed) {
      return {
        ok: true,
        data: parsed,
        model,
        modelId,
        escalationReasons: reasons,
        repaired: false,
      };
    }

    // Pass 2: repair on same model
    const repairUser =
      input.user +
      "\n\nÖnceki çıktı geçersiz JSON veya şemaya uymadı. Yalnızca geçerli JSON döndür.";
    const second = await chatJson(client, modelId, input.system, repairUser);
    void recordUsage(input.service, {
      userId: input.userId,
      actionCode: input.actionCode,
      model: modelId,
      tokensIn: second.tokensIn,
      tokensOut: second.tokensOut,
    });
    const repairedParsed = tryParse(second.text);
    if (repairedParsed) {
      return {
        ok: true,
        data: repairedParsed,
        model,
        modelId,
        escalationReasons: reasons,
        repaired: true,
      };
    }

    // Pass 3: escalate to gpt-4o
    if (input.routerEnabled && model !== "gpt-4o") {
      reasons.push("REPEATED_MINI_FAILURE");
      model = "gpt-4o";
      modelId = (env.OPENAI_ADVANCED_MODEL || "gpt-4o") as string;
      const third = await chatJson(client, modelId, input.system, repairUser);
      void recordUsage(input.service, {
        userId: input.userId,
        actionCode: input.actionCode,
        model: modelId,
        tokensIn: third.tokensIn,
        tokensOut: third.tokensOut,
      });
      const escalated = tryParse(third.text);
      if (escalated) {
        return {
          ok: true,
          data: escalated,
          model,
          modelId,
          escalationReasons: reasons,
          repaired: true,
        };
      }
    }

    return {
      ok: false,
      error: "invalid_structured_output",
      escalationReasons: reasons,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "llm_error",
      escalationReasons: reasons,
    };
  }
}

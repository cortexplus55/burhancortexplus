import { contentModel } from "@/lib/ai/model-router";
import { env } from "@/lib/env";

/**
 * Sessiz model yedeği. İlk deneme içerik modeli, sonra gelişmiş, sonra standart.
 * Ders adı yok; sıra sabit.
 */
export function modelLadder(): readonly string[] {
  return [contentModel(), env.OPENAI_ADVANCED_MODEL, env.OPENAI_STANDARD_MODEL];
}

export function modelForAttempt(index: number): string {
  const ladder = modelLadder();
  const at = Math.max(0, Math.min(index, ladder.length - 1));
  return ladder[at] ?? ladder[0]!;
}

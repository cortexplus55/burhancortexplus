/**
 * Decision provider selection. OpenAI primary is a supported mode, not an error.
 * Jev is attempted only when mode, flag, env, and credentials all allow it.
 */

import type { DecisionProviderMode } from "@/lib/env";

export type DecisionEngineStatus = {
  mode: DecisionProviderMode;
  openaiPrimary: boolean;
  decisionLabel: string;
  jevLabel: string;
};

export function shouldAttemptJev(input: {
  mode: DecisionProviderMode;
  jevEnabledEnv: boolean;
  jevFlag: boolean;
  /** Resolved credential (TypeSafe key, gateway key, or OIDC). */
  hasJevCredential: boolean;
  circuitAllows: boolean;
  /** Single allowed action → decision is already determined; skip Jev. */
  allowedActionCount?: number;
  /**
   * @deprecated Use hasJevCredential. Kept so older call sites/tests compile
   * during the transition; ignored when hasJevCredential is provided.
   */
  hasApiKey?: boolean;
}): { attempt: boolean; fallbackBecauseCircuit: boolean } {
  if (input.mode === "openai") {
    return { attempt: false, fallbackBecauseCircuit: false };
  }
  if (
    typeof input.allowedActionCount === "number" &&
    input.allowedActionCount < 2
  ) {
    return { attempt: false, fallbackBecauseCircuit: false };
  }
  const hasCred =
    typeof input.hasJevCredential === "boolean"
      ? input.hasJevCredential
      : Boolean(input.hasApiKey);
  const configured =
    input.jevEnabledEnv && input.jevFlag && hasCred;
  if (!configured) {
    return { attempt: false, fallbackBecauseCircuit: false };
  }
  if (!input.circuitAllows) {
    return { attempt: false, fallbackBecauseCircuit: true };
  }
  return { attempt: true, fallbackBecauseCircuit: false };
}

export function decisionEngineStatus(input: {
  mode: DecisionProviderMode;
  jevEnabledEnv: boolean;
  hasJevCredential: boolean;
  shadowMode?: boolean;
  accessLabel?: string;
  /** @deprecated */
  hasApiKey?: boolean;
}): DecisionEngineStatus {
  const hasCred =
    typeof input.hasJevCredential === "boolean"
      ? input.hasJevCredential
      : Boolean(input.hasApiKey);
  const jevReady =
    input.mode !== "openai" && input.jevEnabledEnv && hasCred;
  if (!jevReady) {
    return {
      mode: input.mode,
      openaiPrimary: true,
      decisionLabel: "OpenAI temporary provider",
      jevLabel: "Waiting for API access / disabled",
    };
  }
  if (input.shadowMode) {
    return {
      mode: input.mode,
      openaiPrimary: true,
      decisionLabel: "OpenAI primary (Jev shadow)",
      jevLabel: `Shadow via ${input.accessLabel ?? "configured"}`,
    };
  }
  return {
    mode: input.mode,
    openaiPrimary: false,
    decisionLabel: "Jev primary",
    jevLabel: `Configured (${input.accessLabel ?? "ready"})`,
  };
}

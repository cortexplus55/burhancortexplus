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
  hasApiKey: boolean;
  circuitAllows: boolean;
}): { attempt: boolean; fallbackBecauseCircuit: boolean } {
  if (input.mode === "openai") {
    return { attempt: false, fallbackBecauseCircuit: false };
  }
  const configured =
    input.jevEnabledEnv && input.jevFlag && input.hasApiKey;
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
  hasApiKey: boolean;
}): DecisionEngineStatus {
  const jevReady =
    input.mode !== "openai" && input.jevEnabledEnv && input.hasApiKey;
  if (!jevReady) {
    return {
      mode: input.mode,
      openaiPrimary: true,
      decisionLabel: "OpenAI temporary provider",
      jevLabel: "Waiting for API access / disabled",
    };
  }
  return {
    mode: input.mode,
    openaiPrimary: false,
    decisionLabel: "Jev primary",
    jevLabel: "Configured",
  };
}

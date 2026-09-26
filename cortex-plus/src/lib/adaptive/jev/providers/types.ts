/**
 * DecisionProvider contract — Jev and OpenAI return the same normalized bundle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompactDecisionState,
  JevDecisionResult,
} from "@/lib/adaptive/types";

export type DecisionRequest = {
  state: CompactDecisionState;
  userId: string;
  examPrepId: string;
  sessionId?: string | null;
  service?: SupabaseClient;
  /** primary = intentional provider. fallback = a previous provider failed. */
  role?: "primary" | "fallback";
  model?: string;
  fallbackReason?: string | null;
  escalationReason?: string | null;
};

export interface DecisionProvider {
  readonly name: JevDecisionResult["provider"];
  decide(request: DecisionRequest): Promise<JevDecisionResult>;
}

/**
 * A generateJson stand-in that reserves / refunds / defers credits exactly
 * like production (so a spent key really blocks a model call), for tests of
 * the course topic-map pipeline. Use from a test file:
 *
 *   vi.mock("@/lib/ai/generate", async () => (await import("./helpers/outline-model-mock")).generateModule());
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

export type ModelCall = { model: string; key: string; prompt: string };
export const HANG = Symbol("hang");
export const model = {
  calls: [] as ModelCall[],
  impl: (() => null) as (p: { modelOverride: string; userPrompt: string }) => unknown,
};

export async function generateModule() {
  const credits = await vi.importActual<typeof import("@/lib/credits/service")>("@/lib/credits/service");
  return {
    isPremiumUser: vi.fn(async () => false),
    generateJson: vi.fn(async (p: any) => {
      const reservation = await credits.reserveCredits(p.service, p.userId, p.actionCode, p.idempotencyKey);
      if (!reservation.ok) return { ok: false, status: 409, error: reservation.reason };
      model.calls.push({ model: p.modelOverride, key: p.idempotencyKey, prompt: p.userPrompt });
      const out = model.impl(p);
      if (out === HANG) return new Promise(() => {});
      const failed = out && typeof out === "object" && "error" in out ? String((out as { error: string }).error) : null;
      const data = !failed && out ? p.parse(out) : null;
      if (!data) {
        await credits.refundCredits(p.service, reservation.reservationId);
        return { ok: false, status: failed === "deadline" ? 504 : 502, error: failed ?? "generation_failed" };
      }
      if (!p.deferCommit) await credits.commitCredits(p.service, reservation.reservationId);
      return { ok: true, data, reservationId: p.deferCommit ? reservation.reservationId : undefined, usage: { tokensIn: 1, tokensOut: 1 } };
    }),
  };
}

export const outlineEnv = {
  env: {
    OPENAI_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STANDARD_MODEL: "gpt-4o-mini",
    OPENAI_OUTLINE_STRONG_MODEL: "gpt-4.1",
    OPENAI_OUTLINE_FALLBACK_MODEL: "gpt-4.1-mini",
  },
};

/** One-topic-per-title outline (fileIndex, pages). */
export function titledOutline(topics: [title: string, pageStart: number, pageEnd: number, fileIndex?: number][]) {
  return {
    units: topics.map(([title, a, b, fileIndex], i) => ({
      title,
      examWeight: "medium",
      topics: [{
        id: `t${i + 1}`, title, whyLearn: `${title} konusunu öğreneceksin.`, description: "",
        fileIndex: fileIndex ?? 0, pageStart: a, pageEnd: b, examWeight: "high", likelyAsked: [], prerequisiteIds: [],
      }],
    })),
  };
}

/** A DB where every document is extracted and waits for its map (process-route shape). */
export function routeTables(
  docs: { id: string; name: string; pages: string[]; mime?: string }[],
): Record<string, Record<string, unknown>[]> {
  return {
    documents: docs.map((d) => ({
      id: d.id, user_id: "u1", file_name: d.name, status: "processing", topic_map_status: "none",
      topic_map_error: null, deleted_at: null, mime_type: d.mime ?? "application/pdf", page_count: d.pages.length,
    })),
    document_pages: docs.flatMap((d) => d.pages.map((text, i) => ({
      id: `${d.id}p${i + 1}`, document_id: d.id, page_number: i + 1, text_content: text, extraction_ok: true,
      page_kind: null, extraction_method: "text", headings: [], char_count: text.length,
    }))),
    document_chunks: docs.map((d) => ({ id: `c-${d.id}`, document_id: d.id })),
    document_ingestion_state: docs
      .filter((d) => (d.mime ?? "application/pdf") === "application/pdf")
      .map((d) => ({ document_id: d.id, status: "ready", total_pages: d.pages.length })),
    processing_jobs: docs.map((d) => ({ document_id: d.id, status: "processing" })),
    credit_reservations: docs.map((d) => ({
      id: `doc-${d.id}`, user_id: "u1", idempotency_key: `document_process_${d.id}`,
      action_code: "DOCUMENT_PAGE_PROCESS", status: "pending", amount: 5, claim_token: null,
    })),
    document_topic_map_jobs: [], document_topic_nodes: [], document_topic_page_links: [],
    document_coverage_reports: [], exam_preps: [], exam_prep_topics: [],
  };
}

export const processRequest = (body: unknown) =>
  new Request("http://test.local/api/documents/process", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

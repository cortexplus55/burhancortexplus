import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const gate = vi.hoisted(() => ({
  calls: 0,
  prompts: [] as string[],
  blow: false,
  tier: "plus" as "free" | "plus" | "sigma",
  cost: 1,
}));

vi.mock("@/lib/ai/generate", () => ({
  isPremiumUser: async () => false,
  generateJson: async (params: {
    userPrompt: string;
    parse: (raw: unknown) => unknown;
  }) => {
    gate.calls += 1;
    gate.prompts.push(params.userPrompt);
    if (gate.blow) throw new Error("llm_down");
    const data = params.parse({
      language: "tr",
      summary: "Hücre zarı seçici geçirgendir ve madde alışverişini düzenler.",
      objectives: [{ statement: "Öğrenci seçici geçirgenliği ayırt eder.", pageNumbers: [1] }],
      examFocus: {
        questionTypes: ["tanım"],
        keyFormulas: [],
        keyDefinitions: [
          {
            term: "seçici geçirgen",
            definition: "Bazı maddeleri geçirir, bazılarını tutar.",
            pageNumbers: [1],
          },
        ],
      },
      misconceptions: [],
      topics: [
        {
          title: "Hücre Zarı",
          emphasis: "core",
          prerequisites: [],
          pageNumbers: [1],
          strategy: {
            examples: ["Glikoz geçer, nişasta kalır"],
            analogies: [],
            mnemonics: [],
            workedExamplePlan: "Önce küçük molekül, sonra büyük.",
            checkQuestions: ["Nişasta neden geçemez?"],
          },
        },
      ],
    });
    if (!data) return { ok: false, status: 422, error: "rejected" };
    return { ok: true, data, model: "test", cost: 1 };
  },
}));

vi.mock("@/lib/billing/entitlements", () => ({
  planTier: async () => gate.tier,
}));

vi.mock("@/lib/credits/service", () => ({
  getActionCost: async () => gate.cost,
}));

import { runTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";

type State = {
  existing: { status: string; analysis: unknown } | null;
  pages: { page_number: number; text_content: string }[];
  wallet: { balance: number; reserved: number } | null;
  saved: Record<string, unknown> | null;
};

function client(state: State): SupabaseClient {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => {
          if (table === "document_teacher_analyses") return { data: state.existing };
          if (table === "credit_wallets") return { data: state.wallet };
          return { data: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          state.saved = row;
          state.existing = {
            status: row.status as string,
            analysis: row.analysis,
          };
          return { error: null };
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => void,
          reject?: (reason: unknown) => void,
        ) => {
          try {
            const data = table === "document_pages" ? state.pages : null;
            resolve({ data, error: null });
          } catch (error) {
            reject?.(error);
          }
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const readyAnalysis = {
  version: 1,
  language: "tr",
  summary: "Hazır analiz hücre zarını anlatır.",
  objectives: [{ statement: "Öğrenci zarı tanımlar.", pageNumbers: [1] }],
  examFocus: { questionTypes: [], keyFormulas: [], keyDefinitions: [] },
  misconceptions: [],
  topics: [
    {
      title: "Hücre Zarı",
      emphasis: "core",
      prerequisites: [],
      pageNumbers: [1],
      strategy: {
        examples: [],
        analogies: [],
        mnemonics: [],
        workedExamplePlan: "",
        checkQuestions: ["Zar ne işe yarar?"],
      },
    },
  ],
};

describe("öğretmen analizi kaydı", () => {
  beforeEach(() => {
    gate.calls = 0;
    gate.prompts = [];
    gate.blow = false;
    gate.tier = "plus";
    gate.cost = 1;
  });

  it("hazır kaydı yeniden üretmez", async () => {
    const state: State = {
      existing: { status: "ready", analysis: readyAnalysis },
      pages: [],
      wallet: { balance: 10, reserved: 0 },
      saved: null,
    };
    const result = await runTeacherAnalysis(client(state), "doc-1", {
      userId: "user-1",
      fileName: "biyoloji.pdf",
      mimeType: "application/pdf",
    });
    expect(result.status).toBe("ready");
    expect(result.topicMapBrief).toContain("Hücre Zarı");
    expect(gate.calls).toBe(0);
  });

  it("kredi konu haritasını aç bırakacaksa analizi atlar", async () => {
    const state: State = {
      existing: null,
      pages: [{ page_number: 1, text_content: "Hücre zarı seçici geçirgendir ve madde alışverişini protein kanallarıyla düzenler." }],
      wallet: { balance: 1, reserved: 0 },
      saved: null,
    };
    const result = await runTeacherAnalysis(client(state), "doc-2", {
      userId: "user-1",
      fileName: "not.pdf",
      mimeType: "application/pdf",
    });
    expect(result.status).toBe("skipped");
    expect(result.ok).toBe(false);
    expect(state.saved?.error).toBe("credit_budget");
    expect(gate.calls).toBe(0);
  });

  it("yöneticinin bakiyesi düşmediği için bütçe ön kontrolü onu atlatmaz", async () => {
    const state: State = {
      existing: null,
      pages: [{ page_number: 1, text_content: "Hücre zarı seçici geçirgendir ve madde alışverişini protein kanallarıyla düzenler." }],
      wallet: { balance: 0, reserved: 0 },
      saved: null,
    };
    const admin = Object.assign(client(state), {
      rpc: async (fn: string) => (fn === "is_admin" ? { data: true, error: null } : { data: null, error: null }),
    }) as unknown as SupabaseClient;
    const result = await runTeacherAnalysis(admin, "doc-admin", {
      userId: "admin-1",
      fileName: "biyoloji.pdf",
      mimeType: "application/pdf",
    });
    expect(state.saved?.error).not.toBe("credit_budget");
    expect(result.status).toBe("ready");
    expect(gate.calls).toBeGreaterThan(0);
  });

  it("model çökerse yükleme fonksiyonu da çökmez", async () => {
    gate.blow = true;
    const state: State = {
      existing: null,
      pages: [
        {
          page_number: 1,
          text_content: "Hücre zarı seçici geçirgendir ve madde alışverişini protein kanallarıyla düzenler.",
        },
      ],
      wallet: { balance: 8, reserved: 0 },
      saved: null,
    };
    const result = await runTeacherAnalysis(client(state), "doc-3", {
      userId: "user-1",
      fileName: "not.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(result.status).toBe("failed");
    expect(state.saved?.status).toBe("failed");
  });

  it("ücretsiz PDF'te yalnızca ilk iki sayfayı okur ve kaydeder", async () => {
    gate.tier = "free";
    const state: State = {
      existing: null,
      pages: [1, 2, 3, 4].map((page) => ({
        page_number: page,
        text_content: `SAYFA${page} hücre zarı seçici geçirgendir ve bu sayfada madde alışverişi anlatılır.`,
      })),
      wallet: { balance: 8, reserved: 0 },
      saved: null,
    };
    const result = await runTeacherAnalysis(client(state), "doc-4", {
      userId: "user-1",
      fileName: "uzun.pdf",
      mimeType: "application/pdf",
    });
    expect(result.ok).toBe(true);
    expect(gate.prompts[0]).toContain("SAYFA1");
    expect(gate.prompts[0]).toContain("SAYFA2");
    expect(gate.prompts.join("\n")).not.toContain("SAYFA3");
    expect(state.saved?.status).toBe("ready");
  });
});

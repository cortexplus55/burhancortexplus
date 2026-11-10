import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  10 Kasım 2026, canlı denetim: ücretsiz hesapta Doğru/Yanlış "Önermeler hazırlanıyor" ekranında kalırken haftalık
  hak içerik gelmeden düştü. İş platform tavanında kesilince iade çalışmıyordu. Kural: iş sert tavanı aşarsa
  beklenmez, ayırma iade edilir; ek turlar süre bütçesiyle sınırlıdır; sayı dolmazsa eldeki set teslim edilir.
*/

const credits = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  commitCredits: vi.fn(),
  refundCredits: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test-key" } }));
vi.mock("@/lib/ai/openai-client", () => ({ openaiClient: () => ({ chat: { completions: { create: vi.fn() } } }) }));
vi.mock("@/lib/ai/model-router", () => ({ contentModel: () => "test-model" }));
vi.mock("@/lib/ai/generation-slots", () => ({ withGenerationSlot: (_kind: string, run: () => unknown) => run() }));
vi.mock("@/lib/learning/fast-access", () => ({ fastAllowedFor: async () => false }));
vi.mock("@/lib/learning/student-pedagogy", () => ({
  studentPedagogyBlock: async () => "",
  withStudentProfile: (system: string) => system,
}));
vi.mock("@/lib/credits/service", () => ({
  ...credits,
  refusalCode: () => "insufficient_credits",
}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const service = {} as never;
const base = { userId: "u1", actionCode: "QUIZ_GENERATE" as const, idempotencyKey: "k1", label: "studio_true_false", topic: "Konu" };

beforeEach(() => {
  vi.clearAllMocks();
  credits.reserveCredits.mockResolvedValue({ ok: true, reservationId: "res-1" });
  credits.commitCredits.mockResolvedValue(undefined);
  credits.refundCredits.mockResolvedValue(undefined);
});

describe("motorun sert tavanı", () => {
  it("iş tavanı aşarsa beklenmez: ayırma iade edilir, kesinleşmez", async () => {
    const { runWithTeacherModel } = await import("@/lib/learning/teacher-engine-run");
    const outcome = await runWithTeacherModel(service, {
      ...base,
      hardDeadlineMs: 1_000,
      work: () => new Promise(() => undefined),
    });
    expect(outcome).toEqual({ ok: false, status: 503, error: "generation_failed", reasons: ["deadline"] });
    expect(credits.refundCredits).toHaveBeenCalledWith(service, "res-1");
    expect(credits.commitCredits).not.toHaveBeenCalled();
  });

  it("zamanında biten iş kesinleşir, iade yok", async () => {
    const { runWithTeacherModel } = await import("@/lib/learning/teacher-engine-run");
    const outcome = await runWithTeacherModel(service, {
      ...base,
      hardDeadlineMs: 5_000,
      work: async () => ({ ok: true as const, result: ["a"] }),
    });
    expect(outcome.ok).toBe(true);
    expect(credits.commitCredits).toHaveBeenCalledWith(service, "res-1");
    expect(credits.refundCredits).not.toHaveBeenCalled();
  });

  it("iş düşerse (iki geçiş de) ayırma iade edilir", async () => {
    const { runWithTeacherModel } = await import("@/lib/learning/teacher-engine-run");
    const outcome = await runWithTeacherModel(service, {
      ...base,
      work: async () => ({ ok: false as const, reasons: ["boş"] }),
    });
    expect(outcome.ok).toBe(false);
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(credits.commitCredits).not.toHaveBeenCalled();
  });

  it("varsayılan tavan platform tavanından (300 sn) kısadır", async () => {
    const { HARD_DEADLINE_MS } = await import("@/lib/learning/teacher-engine-run");
    expect(HARD_DEADLINE_MS).toBeLessThan(300_000);
    expect(HARD_DEADLINE_MS).toBeGreaterThanOrEqual(240_000);
  });
});

describe("Doğru/Yanlış stüdyosu", () => {
  const route = read("src/app/api/learning/true-false/generate/route.ts");

  it("ek tur süre bütçesiyle sınırlı; sayı dolmazsa eldeki karışık set teslim edilir", () => {
    expect(route).toContain("tries < 4 && Date.now() - started < TF_EXTRA_ROUND_BUDGET_MS");
    expect(route).toContain("partial >= trueFalseFloor(count) ? takeMixed(items, partial) : null");
    expect(route).toContain("requested: count");
    expect(route).toContain("export const maxDuration = 300;");
  });

  it("ekran olmayan bir denetimi vaat etmez; eksik seti söyler", () => {
    const studio = read("src/components/learning/studio/true-false-studio.tsx");
    expect(studio).not.toContain("ikinci kez denetleniyor");
    expect(studio).toContain("hazır olanlarla başlıyoruz");
    expect(read("src/components/learning/studio/flashcard-studio.tsx")).not.toContain("ikinci kez denetleniyor");
  });

  it("stüdyo üretim uçları platform tavanını açıkça yazar", () => {
    for (const name of ["flashcards", "oral", "podcast", "quiz", "true-false"]) {
      expect(read(`src/app/api/learning/${name}/generate/route.ts`), name).toContain("export const maxDuration = 300;");
    }
  });
});

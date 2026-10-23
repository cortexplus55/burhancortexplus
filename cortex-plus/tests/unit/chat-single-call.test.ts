import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { chatAnswerNeedsReview } from "@/lib/ai/document-answer-verification";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";

/*
  Sohbette tek model çağrısı (24 Ekim 2026, ürün sahibinin kararı): denetim çağrısı yalnız öğrencinin belgesine
  dayanan cevapta. Genel bilgi cevabı tek çağrıyla gider; normal öğrencinin model giderinin %56'sı sohbetteki
  ikinci çağrıydı (docs/delivery/MALIYET-VERGI-24-EKIM.md).
*/

describe("hangi sohbet cevabı denetlenir", () => {
  const grounded = "Belgeden: Kesin hükümsüzlükte işlem baştan geçersizdir [1].";
  const outside = "Bu, belgede yok.\n\nMateryal dışı: Fotosentez bitkilerin ışıkla besin üretmesidir.";

  it("genel sohbet ve kanıtsız belge modu tek çağrı", () => {
    expect(chatAnswerNeedsReview({ documentGrounded: false, hasImage: false, strict: false, draft: grounded })).toBe(false);
    expect(chatAnswerNeedsReview({ documentGrounded: false, hasImage: false, strict: true, draft: grounded })).toBe(false);
  });

  it("belgeye dayanan cevap, katı mod ve görsel denetlenir", () => {
    expect(chatAnswerNeedsReview({ documentGrounded: true, hasImage: false, strict: false, draft: grounded })).toBe(true);
    expect(chatAnswerNeedsReview({ documentGrounded: true, hasImage: false, strict: true, draft: outside })).toBe(true);
    expect(chatAnswerNeedsReview({ documentGrounded: false, hasImage: true, strict: false, draft: grounded })).toBe(true);
  });

  it("belgede yok diye etiketlenmiş dış cevap denetlenmez (karışık mod)", () => {
    expect(chatAnswerNeedsReview({ documentGrounded: true, hasImage: false, strict: false, draft: outside })).toBe(false);
  });
});

describe("öğretmen sohbeti: verify false tek çağrı", () => {
  function client(answers: string[]) {
    const create = vi.fn(async () => ({
      choices: [{ message: { content: answers.shift() ?? "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
    return { create, client: { chat: { completions: { create } } } as never };
  }
  const base = {
    model: "gpt-6-luna",
    context: { examTitle: null, daysLeft: null, topic: null, learnerLines: [], passages: [], mode: "general" as const },
    history: [],
    message: "Fotosentez nedir?",
    onUsage: async () => undefined,
  };

  it("verify false: cevap tek çağrıyla döner", async () => {
    const { create, client: c } = client(["Fotosentez, bitkinin ışıkla besin üretmesidir."]);
    const out = await runTeacherTutor({ ...base, client: c, verify: false });
    expect(out).toMatchObject({ ok: true, attempts: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("verify false: boş cevap bir kez yeniden istenir", async () => {
    const { create, client: c } = client(["", "Fotosentez ışıkla besin üretimidir."]);
    const out = await runTeacherTutor({ ...base, client: c, verify: false });
    expect(out).toMatchObject({ ok: true, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("varsayılan denetler: taslak + denetim", async () => {
    const { create, client: c } = client(["Fotosentez ışıkla besin üretimidir.", JSON.stringify({ issues: [] })]);
    const out = await runTeacherTutor({ ...base, client: c });
    expect(out.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("sohbet rotası kuralı kullanıyor", () => {
  const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
  it("öğretmen yolu yalnız belgeye dayanan cevabı denetler", () => {
    expect(route).toContain('verify: tutorMode !== "general" && grounding.decision === "in",');
  });
  it("eski yolda ikinci ve üçüncü çağrı kanıta bağlı", () => {
    expect(route).toContain("const documentGrounded = grounded && evidence.length > 0;");
    const guard = route.indexOf("const reviewAnswer = chatAnswerNeedsReview(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(route.indexOf("await verifyEducationalContent({ client,"));
    expect(route).toContain("if (reviewAnswer && documentGrounded && !imageUrl) {");
  });
});

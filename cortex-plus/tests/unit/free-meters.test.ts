import { readFileSync } from "fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  FREE_LIMITS,
  FREE_TIER_SENTENCE,
  PLUS_ONLY_NODE_KINDS,
  defaultFreeMeter,
  freeLimitReachedLine,
  freeMeterResetLine,
  freeMeterResetsAt,
  freePeriodKey,
} = await import("@/lib/billing/free-meters");
const { nodeMeterFor } = await import("@/lib/billing/node-free-meter");
const { refusalCode } = await import("@/lib/credits/service");

/**
 * Sayıya dayalı ücretsiz katmanın uygulama tarafı (24 Ekim 2026, ürün sahibinin kararları): "Derse dahil
 * olanlar sayılmaz, Araçlar dersten düşer"; "Farklı anlat" yeni ders sayılır; podcast, sözlü, yazılı
 * deneme Plus'ta. SQL tarafı `free-tier-counts.test.ts`.
 */
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

describe("yoldaki adımın sayacı", () => {
  it("ders her zaman ders hakkından; Plus adımları Plus'ta", () => {
    expect(nodeMeterFor("lesson", true)).toBe("lesson");
    expect(nodeMeterFor("lesson", false)).toBe("lesson");
    for (const kind of ["podcast", "oral", "written_exam"]) {
      expect(PLUS_ONLY_NODE_KINDS.has(kind)).toBe(true);
      expect(nodeMeterFor(kind, true)).toBe("plus");
    }
  });

  it("dersin ardındaki test, kart, doğru/yanlış derse dahil; ders açılmadan açılırsa ders hakkından", () => {
    for (const kind of ["quiz", "flashcards", "spaced", "true_false", "focused", "final_check", "qa"]) {
      expect(nodeMeterFor(kind, true), kind).toBe("included");
      expect(nodeMeterFor(kind, false), kind).toBe("lesson");
    }
  });

  it("düğüm rotası sayacı kredi ayırmasına geçiriyor; abone ve önizlemesiz kurucu sayaçsız", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain("const meterless = premium || (await billingExempt(service, userId).catch(() => false));");
    expect(route).toContain('if (nodeMeter === "plus") {');
    expect(route).toContain('return errorResponse(402, "premium_required");');
    // Ücretsiz öğrenciye açamayacağı ders önceden yazılmaz.
    expect(route).toContain('return NextResponse.json({ ok: true, skipped: "free_limit" });');
  });

  it("Araçlar'daki test ve kart varsayılanla dersten düşer; mesaj ve fotoğraf kendi sayacında", () => {
    expect(defaultFreeMeter("QUIZ_GENERATE")).toBe("lesson");
    expect(defaultFreeMeter("FLASHCARD_GENERATE")).toBe("lesson");
    expect(defaultFreeMeter("STUDY_PLAN_GENERATE")).toBe("lesson");
    expect(defaultFreeMeter("AI_CHAT_STANDARD")).toBe("chat");
    expect(defaultFreeMeter("AI_CHAT_ADVANCED")).toBe("chat");
    expect(defaultFreeMeter("IMAGE_SOLUTION")).toBe("photo");
    expect(defaultFreeMeter("DOCUMENT_PAGE_PROCESS")).toBeNull();
  });

  it("ders içi yardımcılar (koç, geri bildirim, tanışma) derse dahil", () => {
    for (const path of [
      "src/app/api/learning/exam-prep/coach/route.ts",
      "src/app/api/learning/exam-prep/feedback/route.ts",
      "src/app/api/learning/exam-prep/intro/route.ts",
    ]) {
      expect(read(path), path).toContain('freeMeter: "included"');
    }
  });

  /* İnceleme, 24 Ekim 2026: "Anlatarak öğren" yalnız Araçlar'dan ve Yanlışlarım'dan açılıyor; derse dahil
     sayılınca dersi olmayan ücretsiz öğrenci günde 40 model çağrısı alıyordu (sohbet 3). Ürün sahibinin
     kararı: sohbet mesajı sayılır. */
  it("Anlatarak öğren sohbet sayacında", () => {
    const explain = read("src/app/api/learning/explain/route.ts");
    expect(explain).toContain('actionCode: "AI_CHAT_STANDARD"');
    expect(explain).not.toMatch(/freeMeter:/);
    expect(defaultFreeMeter("AI_CHAT_STANDARD")).toBe("chat");
  });
});

describe("sayaçların saati ve cümleleri", () => {
  it("ders sayacı Pazartesi 00:00 İstanbul'da, gün sayaçları gece yarısı yenilenir", () => {
    // Cuma 13:00 İstanbul.
    const friday = new Date("2026-10-23T10:00:00Z");
    expect(freeMeterResetsAt("lesson", friday).toISOString()).toBe("2026-10-25T21:00:00.000Z");
    expect(freeMeterResetsAt("chat", friday).toISOString()).toBe("2026-10-23T21:00:00.000Z");
    // Pazartesi 00:30 İstanbul: hafta yeni başladı, bir sonraki yenilenme gelecek Pazartesi.
    const monday = new Date("2026-10-25T21:30:00Z");
    expect(freeMeterResetsAt("lesson", monday).toISOString()).toBe("2026-11-01T21:00:00.000Z");
    expect(freePeriodKey("lesson", monday)).not.toBe(freePeriodKey("lesson", friday));
  });

  it("öğrenciye kredi değil iş söylenir", () => {
    expect(FREE_LIMITS).toMatchObject({ lesson: 3, chat: 3, photo: 1 });
    expect(freeLimitReachedLine("lesson")).toBe("Bu haftaki 3 ücretsiz ders hakkın bitti.");
    expect(freeLimitReachedLine("chat")).toBe("Bugünkü 3 ücretsiz sohbet mesajı hakkın bitti.");
    expect(freeLimitReachedLine("photo")).toBe("Bugünkü 1 ücretsiz fotoğraftan çözüm hakkın bitti.");
    expect(freeMeterResetLine("lesson")).toContain("Pazartesi");
    expect(FREE_TIER_SENTENCE).toBe(
      "Haftada 3 ders (testleri ve kartlarıyla), günde 3 sohbet mesajı ve günde 1 fotoğraftan soru çözümü",
    );
    for (const line of [freeLimitReachedLine("lesson"), freeLimitReachedLine("chat"), FREE_TIER_SENTENCE]) {
      expect(line.toLocaleLowerCase("tr")).not.toContain("kredi");
    }
  });

  it("SQL'in ret sebepleri arayüz kodlarına çevrilir", () => {
    expect(refusalCode({ reason: "insufficient_credits", refusal: { kind: "free_limit", meter: "lesson" } }))
      .toBe("free_lesson_limit");
    expect(refusalCode({ reason: "insufficient_credits", refusal: { kind: "plus_required" } }))
      .toBe("premium_required");
    expect(refusalCode({ reason: "insufficient_credits" })).toBe("insufficient_credits");
  });
});

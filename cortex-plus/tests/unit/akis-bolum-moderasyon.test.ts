import { describe, expect, it } from "vitest";
import { leadOnlyPayload, prefixLeadScreen, splitLead } from "@/lib/learning/rewrite-lead";
import { LESSON_PROGRESS_FAST_POLL_MS, LESSON_PROGRESS_POLL_MS, LESSON_WAIT_LIMIT_MS, lessonProgressDelay, showsWaitStep } from "@/components/parity/lesson-wait";
import { hedgedModeration } from "@/lib/ai/moderation";
import type { LessonScreen } from "@/lib/learning/lesson-v3";

const one = { heading: "Başka açıdan", blocks: [{ type: "text", text: "İlk paragraf." }] } as unknown as LessonScreen;

describe("ilk parça hemen görünür", () => {
  it("tek paragraf ilk kartın gövdesine yazılır, boş kart kalmaz", () => {
    const split = splitLead(one);
    expect(split.introOnly).toBe(true);
    expect(split.intro).toBe("İlk paragraf.");
    const lesson = leadOnlyPayload(one, "T").lesson as { overview?: string; screens: Array<{ blocks: Array<{ text: string }> }> };
    expect(lesson.overview).toBe("İlk paragraf.");
    expect(lesson.screens).toHaveLength(1);
    expect(lesson.screens[0].blocks[0].text).not.toBe("İlk paragraf.");
  });

  it("tek paragraf asıl derse ekran eklemez", () => {
    const main = { type: "lesson", plannedScreens: 7, lesson: { format: 3, title: "T", screens: [{ heading: "Bir", blocks: [] }] } };
    const merged = prefixLeadScreen(main, one);
    expect((merged.lesson as { screens: unknown[]; overview?: string }).screens).toHaveLength(1);
    expect((merged.lesson as { overview?: string }).overview).toBe("İlk paragraf.");
    expect(merged.plannedScreens).toBe(7);
  });

  it("ilk yoklamalar sık, sonra normal", () => {
    expect(lessonProgressDelay(0)).toBe(LESSON_PROGRESS_FAST_POLL_MS);
    expect(LESSON_PROGRESS_FAST_POLL_MS).toBeLessThanOrEqual(400);
    expect(lessonProgressDelay(50)).toBe(LESSON_PROGRESS_POLL_MS);
  });
});

describe("sıradaki bölüm beklemesi", () => {
  it("ana yazım bittiyse ya da öğrenci vazgeçtiyse bekleme kartı yok", () => {
    expect(showsWaitStep(true, false, false)).toBe(true);
    expect(showsWaitStep(true, true, false)).toBe(false);
    expect(showsWaitStep(true, false, true)).toBe(false);
    expect(showsWaitStep(false, false, false)).toBe(false);
    expect(LESSON_WAIT_LIMIT_MS).toBeLessThanOrEqual(8_000);
  });
});

describe("hedged moderasyon", () => {
  it("ilk istek takılırsa ikinci istek kazanır, öbürü iptal edilir", async () => {
    const aborted: boolean[] = [];
    let calls = 0;
    const call = (_input: unknown, signal: AbortSignal) => {
      const n = calls++;
      return new Promise<string[]>((resolve) => {
        signal.addEventListener("abort", () => aborted.push(true));
        if (n === 1) setTimeout(() => resolve(["violence"]), 5);
      });
    };
    const result = await hedgedModeration("x", call, { hedgeMs: 10, budgetMs: 500 });
    expect(result).toEqual({ flagged: ["violence"] });
    expect(calls).toBe(2);
    expect(aborted.length).toBeGreaterThanOrEqual(1);
  });

  it("ilk hata ikinci isteği hemen açar; ikisi de düşerse failed", async () => {
    let calls = 0;
    const fail = async () => {
      calls++;
      throw new Error("boom");
    };
    expect(await hedgedModeration("x", fail, { hedgeMs: 10_000, budgetMs: 500 })).toEqual({ error: "failed" });
    expect(calls).toBe(2);
  });

  it("bütçe dolarsa timeout", async () => {
    const hang = () => new Promise<string[]>(() => {});
    expect(await hedgedModeration("x", hang, { hedgeMs: 5, budgetMs: 30 })).toEqual({ error: "timeout" });
  });
});

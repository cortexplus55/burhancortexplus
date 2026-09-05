import { describe, expect, it } from "vitest";
import { DAILY_SIZE, pickDailySet, todayKey } from "@/lib/learning/daily-drill";
import type { MistakeQuestion } from "@/lib/learning/mistake-notebook";

function q(id: string, topic: string): MistakeQuestion {
  return {
    id,
    source: "deneme",
    topicLabel: topic,
    questionText: `soru ${id}`,
    options: ["a", "b"],
    wrongCount: 1,
    correctStreak: 0,
  };
}

function group(label: string, count: number) {
  return {
    label,
    questions: Array.from({ length: count }, (_, i) => q(`${label}-${i}`, label)),
  };
}

describe("günün turu — soru seçimi", () => {
  it("konular arasında sırayla dolaşır, tek konudan doldurmaz", () => {
    // Tek konudan on soru çekmek turu bir konu tekrarına çevirirdi.
    const picked = pickDailySet([group("A", 10), group("B", 10)], 4);
    expect(picked.map((p) => p.topicLabel)).toEqual(["A", "B", "A", "B"]);
  });

  it("bir konunun soruları biterse diğerlerinden devam eder", () => {
    const picked = pickDailySet([group("A", 1), group("B", 5)], 4);
    expect(picked.map((p) => p.id)).toEqual(["A-0", "B-0", "B-1", "B-2"]);
  });

  it("toplam soru istenenden azsa olanı verir, tekrar etmez", () => {
    const picked = pickDailySet([group("A", 2), group("B", 1)], DAILY_SIZE);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((p) => p.id)).size).toBe(3);
  });

  it("defter boşsa boş tur döner", () => {
    expect(pickDailySet([], DAILY_SIZE)).toEqual([]);
    expect(pickDailySet([group("A", 0)], DAILY_SIZE)).toEqual([]);
  });

  it("istenen sayıdan fazla soru vermez", () => {
    expect(pickDailySet([group("A", 50), group("B", 50)])).toHaveLength(
      DAILY_SIZE,
    );
  });

  it("her konunun en çok yanlış yapılan sorusu ilk turda gelir", () => {
    // Gruplar zaten sıralı geliyor; ilk tur her grubun ilk sorusunu almalı.
    const picked = pickDailySet([group("A", 3), group("B", 3), group("C", 3)], 3);
    expect(picked.map((p) => p.id)).toEqual(["A-0", "B-0", "C-0"]);
  });
});

describe("günün turu — gün anahtarı", () => {
  it("Türkiye saatine göre gün üretir", () => {
    // 31 Ağustos 22:30 UTC, Türkiye'de 1 Eylül 01:30 — tur yeni güne aittir.
    expect(todayKey(new Date("2026-08-31T22:30:00Z"))).toBe("2026-09-01");
  });

  it("gün ortasında aynı günü verir", () => {
    expect(todayKey(new Date("2026-09-05T09:00:00Z"))).toBe("2026-09-05");
  });
});

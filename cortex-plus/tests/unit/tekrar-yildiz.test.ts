import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepStarRef } from "@/lib/stars/rules";

/*
  30 Ekim 2026, canlı tur: "Tekrar incele" sonunda +10 yıldız; her tekrar yeni deneme açtığı için aynı ders dakikada bir
  yıldız veriyordu (anahtar `attempt:<id>`). Kayıtlı içeriğin tekrarı düğüm başına günde bir kez sayılır.
*/

describe("tekrarın yıldızı düğüm başına günde bir kez", () => {
  it("yeni yazılan içerik deneme başına", () => {
    expect(prepStarRef({ attemptId: "a1", nodeId: "n1", payload: { type: "lesson" }, day: "2026-10-30" })).toBe("attempt:a1");
    expect(prepStarRef({ attemptId: "a2", nodeId: "n1", payload: null, day: "2026-10-30" })).toBe("attempt:a2");
  });

  it("tekrar incele (reviewed) ve dersi tekrarla (replayed) aynı gün aynı anahtar", () => {
    const review1 = prepStarRef({ attemptId: "a3", nodeId: "n1", payload: { type: "quiz", reviewed: true }, day: "2026-10-30" });
    const review2 = prepStarRef({ attemptId: "a4", nodeId: "n1", payload: { type: "quiz", reviewed: true }, day: "2026-10-30" });
    const replay = prepStarRef({ attemptId: "a5", nodeId: "n1", payload: { type: "lesson", replayed: true }, day: "2026-10-30" });
    expect(review1).toBe("review:n1:2026-10-30");
    expect(review2).toBe(review1);
    expect(replay).toBe(review1);
    expect(prepStarRef({ attemptId: "a6", nodeId: "n1", payload: { reviewed: true }, day: "2026-10-31" })).toBe("review:n1:2026-10-31");
    expect(prepStarRef({ attemptId: "a7", nodeId: "n2", payload: { reviewed: true }, day: "2026-10-30" })).toBe("review:n2:2026-10-30");
  });

  it("düğüm rotası yıldızı bu anahtarla yazar", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("ref: prepStarRef({ attemptId: attempt.id as string, nodeId, payload: attempt.payload, day: istanbulDay() }),");
    expect(route).not.toContain("ref: `attempt:${attempt.id}`,");
  });
});

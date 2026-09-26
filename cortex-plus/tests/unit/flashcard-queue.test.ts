import { describe, expect, it } from "vitest";
import { buildSessionQueue, prioritizeUrgent } from "@/lib/learning/flashcard-queue";
import type { QueuedCard } from "@/lib/learning/flashcard-queue";

function card(key: string, bucket: QueuedCard["bucket"], dueAt?: string): QueuedCard {
  return {
    front: key,
    back: "cevap",
    kind: "definition",
    cardKey: key,
    cardSource: "node",
    bucket,
    dueAt,
  };
}

describe("buildSessionQueue", () => {
  it("orders due → mistake → new and caps new at 10", () => {
    const due = [
      card("due-b", "due", "2026-09-20T00:00:00Z"),
      card("due-a", "due", "2026-09-10T00:00:00Z"),
    ];
    const mistakes = [card("m1", "mistake"), card("m2", "mistake")];
    const fresh = Array.from({ length: 15 }, (_, i) => card(`n${i}`, "new"));
    const queue = buildSessionQueue({ due, mistakes, fresh, maxCards: 20, newLimit: 10 });
    expect(queue.cards[0]!.cardKey).toBe("due-a");
    expect(queue.cards[1]!.cardKey).toBe("due-b");
    expect(queue.cards.filter((c) => c.bucket === "mistake").map((c) => c.cardKey)).toEqual([
      "m1",
      "m2",
    ]);
    expect(queue.newCount).toBe(10);
    expect(queue.cards.length).toBe(14);
  });

  it("prioritizes never-seen and missed when exam ≤2 days", () => {
    const cards = [
      card("normal", "new"),
      card("urgent-new", "new"),
      card("urgent-miss", "due"),
    ];
    const ordered = prioritizeUrgent(cards, {
      daysLeft: 2,
      neverSeenKeys: new Set(["urgent-new"]),
      missedKeys: new Set(["urgent-miss"]),
    });
    expect(ordered.map((c) => c.cardKey).slice(0, 2)).toEqual(["urgent-new", "urgent-miss"]);
  });
});

import { describe, expect, it } from "vitest";
import { nodeForTopic, type TopicNodeLike } from "@/lib/learning/exam-prep-ui-path";

/**
 * "Konu seç" ekranı seçilen konuyu açmalı.
 *
 * Canlıda açmıyordu: seçim yalnızca aktif konu alanını yazıyor, öğrenci
 * ise plandaki ilk hazır düğüme gönderiliyordu. "Zeminin Oluşumu"nu
 * seçen öğrenci "Efektif Gerilme" dersini görüyordu ve bunu yalnızca
 * dersi okuyunca anlıyordu.
 */

const node = (
  id: string,
  sortOrder: number,
  status: TopicNodeLike["status"],
  meta: TopicNodeLike["sessionMeta"],
): TopicNodeLike => ({ id, sortOrder, status, sessionMeta: meta });

const plan: TopicNodeLike[] = [
  node("a1", 0, "done", { topicId: "A", topicTitle: "Dane Boyu" }),
  node("a2", 1, "done", { topicId: "A", topicTitle: "Dane Boyu" }),
  node("b1", 3, "ready", { topicId: "B", topicTitle: "Efektif Gerilme" }),
  node("c1", 15, "locked", { topicId: "C", topicTitle: "Üç Fazlı Sistem" }),
  node("c2", 16, "locked", { topicId: "C", topicTitle: "Üç Fazlı Sistem" }),
];

describe("nodeForTopic", () => {
  it("opens the chosen topic, not the first ready node in the plan", () => {
    expect(nodeForTopic(plan, { id: "C", label: "Üç Fazlı Sistem" })?.id).toBe("c1");
  });

  it("picks the first unfinished activity of that topic", () => {
    const mixed = [
      node("x1", 0, "done", { topicId: "X" }),
      node("x2", 1, "ready", { topicId: "X" }),
      node("x3", 2, "locked", { topicId: "X" }),
    ];
    expect(nodeForTopic(mixed, { id: "X" })?.id).toBe("x2");
  });

  it("lets the student reopen a topic they already finished", () => {
    expect(nodeForTopic(plan, { id: "A", label: "Dane Boyu" })?.id).toBe("a1");
  });

  it("falls back to the title for plans written before topicId was stored", () => {
    const old = [
      node("o1", 0, "locked", { topicTitle: "Üç Fazlı Sistem" }),
      node("o2", 1, "locked", { topicTitle: "Efektif Gerilme" }),
    ];
    expect(nodeForTopic(old, { id: "C", label: "üç fazlı sistem" })?.id).toBe("o1");
  });

  it("returns nothing when no node belongs to the topic", () => {
    // Caller then keeps its old behaviour; a wrong screen is worse than none.
    expect(nodeForTopic(plan, { id: "Z", label: "Yok" })).toBeNull();
  });

  it("does not match a node that carries a different topic id", () => {
    // Eski plandaki başlık eşleşmesi, topicId olan bir düğümü kaçırmamalı.
    const conflicting = [node("q1", 0, "ready", { topicId: "OTHER", topicTitle: "Aynı Başlık" })];
    expect(nodeForTopic(conflicting, { id: "MINE", label: "Aynı Başlık" })).toBeNull();
  });
});

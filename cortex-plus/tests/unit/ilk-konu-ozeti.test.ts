import { describe, expect, it } from "vitest";
import { firstTopicOwnNodes, type SummaryNode } from "@/lib/billing/free-topic-rule";
import { firstTopicGate } from "@/components/parity/exam-node/gates";

/*
  İlk doz bedava kapısının özeti (5 Kasım 2026): 1. konunun kendi adımları sayılır; hazırlık geneli adımlar (1. konunun
  kimliğini taşısa da ücretsizde kilitli) sayıya girmez. Canlı turda yolda 7 adım dururken kapı "0/13" demişti ve
  "1. Konuyu Başarıyla Tamamladın" kutlaması hiç çıkamıyordu.
*/

const FIRST = "topic-1";
const own = (id: string, kind: string, status = "locked", role = "practice"): SummaryNode => ({ id, kind, status, title: "Kuvvet · " + kind, session_meta: { topicId: FIRST, role } });

describe("1. konunun kendi adımları", () => {
  const nodes: SummaryNode[] = [
    own("a", "lesson", "done"),
    own("b", "quiz", "done"),
    own("c", "true_false", "done"),
    own("d", "podcast"),
    own("e", "spaced"),
    { id: "x", kind: "lesson", status: "locked", title: "İkinci konu", session_meta: { topicId: "topic-2" } },
    // Hazırlık geneli: 1. konunun kimliğini taşır ama konuya ait değildir.
    own("w1", "gaps", "locked", "mock"),
    own("w2", "written_exam", "locked", "mock"),
    own("w3", "flashcards", "locked", "mock"),
    own("w4", "final_check", "locked", "mock"),
    own("w5", "readiness", "locked", "mock"),
  ];

  it("hazırlık geneli adımlar ve başka konular sayılmaz", () => {
    const mine = firstTopicOwnNodes(nodes, new Set([FIRST]));
    expect(mine.map((node) => node.id)).toEqual(["a", "b", "c", "e"]); // podcast Plus'a özel; final bloğu (mock) sayılmaz
  });

  it("konunun bütün kendi adımları bitince kutlama kapısı çıkar; eksikken '3/4' gibi doğru sayı", () => {
    const mine = firstTopicOwnNodes(nodes, new Set([FIRST]));
    const done = mine.filter((node) => node.status === "done");
    const partial = firstTopicGate({ title: "Kuvvet", done: done.length, total: mine.length, lessonsDone: 1, completed: done.length === mine.length });
    expect(partial.headline).toBe("🔒 Kalan konular Plus'ta");
    expect(partial.wins).toContain("✅ 3/4 adım tamamlandı");
    const finished = mine.map((node) => ({ ...node, status: "done" }));
    const celebrate = firstTopicGate({ title: "Kuvvet", done: finished.length, total: finished.length, lessonsDone: 1, completed: true });
    expect(celebrate.headline).toBe("🚀 1. Konuyu Başarıyla Tamamladın!");
  });
});

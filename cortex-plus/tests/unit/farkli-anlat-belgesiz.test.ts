import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { alternativeBlock, teacherUserPrompt } from "@/lib/learning/teacher-lesson";
import { bodySchema } from "@/lib/learning/node/schema";

describe("belgesiz hazırlıkta Farklı anlat", () => {
  it("başlatma isteği rewrite bayrağını taşır", () => {
    const r = bodySchema.safeParse({ prepId: "00000000-0000-4000-8000-000000000001", nodeId: "00000000-0000-4000-8000-000000000002", action: "start", rewrite: true });
    expect(r.success && r.data.rewrite).toBe(true);
  });
  it("önceki anlatım yoksa istem değişmez", () => {
    expect(alternativeBlock(undefined)).toBe("");
    expect(alternativeBlock("  ")).toBe("");
  });
  it("kazanımlar ve önceki anlatım istemde 'farklı anlat' bloğu olur", () => {
    const prompt = teacherUserPrompt({
      prepTitle: "KPSS",
      topicLabel: "Paragraf",
      pages: [],
      upcomingTopics: [],
      mode: "topic",
      alternativeOf: "KAZANIMLAR:\n- T.1: Ana fikri bulur\n\nÖNCEKİ ANLATIM:\nParagrafın ana fikri…",
    } as never);
    expect(prompt).toContain("FARKLI ANLAT");
    expect(prompt).toContain("T.1: Ana fikri bulur");
    expect(prompt).toContain("tekrar etme");
  });
});

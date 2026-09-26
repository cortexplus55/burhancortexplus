import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildExamStarters,
  buildPersonalizationPrompt,
  type ExamChatHistoryRef,
} from "@/lib/learning/exam-chat-context";

describe("kişiselleştirme bağlamı", () => {
  it("açık yanlış varken bağlama girer ve starter üretir", () => {
    const history: ExamChatHistoryRef[] = [
      {
        id: "m1",
        kind: "mistake",
        label: "Geçen denemen · Stokiyometri",
        summary: "Sınırlayıcıyı gramla seçtim",
        dateLabel: "12 Eyl",
      },
    ];
    const prompt = buildPersonalizationPrompt(history);
    expect(prompt).toContain("id=m1");
    expect(prompt).toContain("Sınırlayıcıyı gramla seçtim");
    expect(prompt).toMatch(/EN FAZLA BİR KEZ/i);

    const starters = buildExamStarters("Stokiyometri", history);
    expect(starters.some((item) => /geçen deneme/i.test(item.label))).toBe(true);
    expect(starters.some((item) => /Stokiyometri/.test(item.label))).toBe(true);
  });

  it("geçmiş yoksa uydurma geçen sefer cümlesi üretmez", () => {
    const prompt = buildPersonalizationPrompt([]);
    expect(prompt.toLocaleLowerCase("tr")).toMatch(/yok/);
    expect(prompt.toLocaleLowerCase("tr")).toMatch(/uydurma/);
    expect(prompt).not.toMatch(/id=/);

    const starters = buildExamStarters(null, []);
    expect(starters.every((item) => !/geçen deneme/i.test(item.label))).toBe(true);
  });
});

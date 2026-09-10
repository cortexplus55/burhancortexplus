import { describe, expect, it } from "vitest";
import {
  normalizeTopicTitle,
  targetTopicCount,
  topicTitleIssues,
} from "@/lib/documents/topic-title";

describe("targetTopicCount", () => {
  it("scales with the document and stays inside the readable band", () => {
    // 20 sayfalık zemin PDF'i → 7; Astra'nın aynı belgeden çıkardığı sayı.
    expect(targetTopicCount(20)).toBe(7);
    // Kısa özet notu bölünemeyecek kadar kısa olsa da plan üretebilmeli.
    expect(targetTopicCount(3)).toBe(4);
    expect(targetTopicCount(1)).toBe(4);
    // Ders kitabı: 200 sayfa 66 konuya bölünürse konu listesi gezilemez.
    expect(targetTopicCount(200)).toBe(12);
  });
});

describe("normalizeTopicTitle", () => {
  it("drops chapter numbers and trailing acronyms", () => {
    expect(normalizeTopicTitle("3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)")).toBe(
      "Dane Boyu, Kıvam Limitleri ve Sınıflandırma",
    );
    expect(normalizeTopicTitle("1.2. Üç Fazlı Model")).toBe("Üç Fazlı Model");
    expect(normalizeTopicTitle("IV) Kayma Mukavemeti")).toBe("Kayma Mukavemeti");
  });

  it("leaves a clean title untouched", () => {
    const clean = "Zeminlerin Faz Bağıntıları ve İndeks Özellikleri";
    expect(normalizeTopicTitle(clean)).toBe(clean);
  });

  it("keeps a parenthetical that is not a trailing acronym", () => {
    expect(normalizeTopicTitle("Darcy Yasası (deneysel) ve Permeabilite")).toBe(
      "Darcy Yasası (deneysel) ve Permeabilite",
    );
  });
});

describe("topicTitleIssues", () => {
  it("rejects the failure modes we actually shipped", () => {
    // Sezgisel harita bunu üretiyordu.
    expect(topicTitleIssues("Sayfa 4 içeriği")).not.toEqual([]);
    expect(topicTitleIssues("Zemin")).not.toEqual([]);
    expect(
      topicTitleIssues("Bu bölümde zeminin üç fazlı yapısı ve faz bağıntıları ayrıntılı anlatılır."),
    ).not.toEqual([]);
    expect(topicTitleIssues("Efektif Gerilme İlkesi.")).not.toEqual([]);
  });

  it("accepts a house-style title", () => {
    expect(topicTitleIssues("Efektif Gerilme İlkesi ve Sızma Kuvvetleri")).toEqual([]);
    expect(topicTitleIssues("Zeminde Su Akışı ve Permeabilite")).toEqual([]);
  });
});

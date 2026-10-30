import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prepTopicScopeLine } from "@/lib/documents/generation-context";

/*
  30 Ekim 2026, canlı: yoldaki "Miktar Teorisi ve Fisher'in Değişim Denklemi" podcast'i aynı sayfadaki tahvil işlemleri,
  reel faiz ve Phillips eğrisi bölümlerini de anlattı. Kapsam satırı yalnız Araçlar podcast'indeydi; yoldaki ve hazırlık
  sayfasındaki belgeli podcast de aynı satırı alır.
*/

describe("belgeli podcast yalnız konusunu anlatır", () => {
  it("kapsam satırı konunun adını taşır ve sayfadaki öbür başlıkları bölüm yaptırmaz", () => {
    const line = prepTopicScopeLine("Miktar Teorisi ve Fisher'in Değişim Denklemi");
    expect(line).toContain("«Miktar Teorisi ve Fisher'in Değişim Denklemi»");
    expect(line).toContain("onları bölüm yapma");
  });

  it("yol podcast'i ve hazırlık podcast sayfası satırı yazara verir (belgeli olunca)", () => {
    const node = readFileSync("src/lib/learning/node/podcast.ts", "utf8");
    expect(node).toContain("core && input.topicLabel !== ALL_TOPICS_LABEL ? prepTopicScopeLine(input.topicLabel)");
    const prep = readFileSync("src/app/api/learning/exam-prep/podcast/route.ts", "utf8");
    expect(prep).toContain('topicDocumentId ? prepTopicScopeLine(topic.label) : ""');
  });
});

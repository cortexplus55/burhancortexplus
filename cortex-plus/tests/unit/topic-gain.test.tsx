// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { topicMasteryGain, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { TopicGainCard, topicGainWorthShowing } from "@/components/parity/topic-gain-card";

/*
  19 Ekim 2026, Astra yan yana: test sonucundan sonra "+6% kazandın · Devletin Temel Nitelikleri
  konusunda · Konu hakimiyeti 18%". Bizde sonuçtan doğrudan sıradaki adıma geçiliyordu. Sayı konu
  hâkimiyetinin kendisi (exam_prep_topic_mastery.confidence), bu etkinlikten önce ve sonra.
*/
afterEach(cleanup);

const snap = (topicKey: string, confidence: number, evidenceCount = 5): TopicMasterySnapshot => ({
  topicKey,
  measured: evidenceCount > 0,
  level: "emerging",
  confidence,
  evidenceCount,
  firstAttemptCorrect: 0,
  firstAttemptTotal: 0,
  independentCorrect: 0,
  independentTotal: 0,
  lastPracticedAt: null,
});

describe("konu hâkimiyeti kazancı", () => {
  it("etkinliğin konusu için önce/sonra güveni verir; ilk ölçümde önce 0", () => {
    expect(
      topicMasteryGain({
        prior: [],
        folded: [snap("devletin unsurları", 20)],
        evidenceKeys: ["Devletin Unsurları", "devletin unsurları"],
        topicLabel: "Devletin Unsurları",
      }),
    ).toEqual({ label: "Devletin Unsurları", before: 0, after: 20 });
    expect(
      topicMasteryGain({
        prior: [snap("devletin unsurları", 20)],
        folded: [snap("devletin unsurları", 32)],
        evidenceKeys: ["devletin unsurları"],
        topicLabel: "Devletin Unsurları",
      }),
    ).toEqual({ label: "Devletin Unsurları", before: 20, after: 32 });
  });

  it("kanıt yoksa (ders, kart, podcast) kazanç yok", () => {
    expect(topicMasteryGain({ prior: [], folded: [], evidenceKeys: [], topicLabel: "X" })).toBeNull();
  });

  it("kart yalnız gerçek artışta açılır", () => {
    expect(topicGainWorthShowing({ label: "A", before: 10, after: 16 })).toBe(true);
    expect(topicGainWorthShowing({ label: "A", before: 16, after: 16 })).toBe(false);
    expect(topicGainWorthShowing({ label: "A", before: 20, after: 12 })).toBe(false);
    expect(topicGainWorthShowing(null)).toBe(false);
  });

  it("kart: '+%X kazandın', konu, hâkimiyet yüzdesi ve sıradaki adım", () => {
    render(<TopicGainCard gain={{ label: "Devletin Unsurları", before: 12, after: 18 }} nextHref="/deneme-sinavlari/p/dugum/n2" />);
    expect(screen.getByRole("heading").textContent).toBe("+%6 kazandın!");
    expect(screen.getByText("Devletin Unsurları konusunda")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Konu hâkimiyeti yüzde 18" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe("/deneme-sinavlari/p/dugum/n2");
  });

  it("sunucu kazancı döndürür; sonuç ekranı kazanç varsa önce kartı açar", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("topicGain = tracked.topicGain;");
    expect(route).toMatch(/learningTracking,\s+topicGain,/);
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("setTopicGain(topicGainWorthShowing(data.topicGain) ? data.topicGain : null);");
    expect(session).toContain("<TopicGainCard gain={topicGain} nextHref={nextHref} />");
  });
});

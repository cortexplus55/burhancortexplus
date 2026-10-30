/**
 * P0-4 (25 Ekim 2026): denemede %89 alıp %80 hedefi geçen öğrenci "Henüz hazırsın diyemeyiz"
 * görüyordu, sağlam konular "Çalışılacak"taydı ve Hazırsın düğümü hiç tamamlanmıyordu.
 * Kural ders-bağımsız: yalnız sayılar (deneme, genel skor, hedef, konu doğruluğu).
 */
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_SCORE,
  READY_HEADLINE,
  buildLearningIndicators,
  effectiveTarget,
  readyForTarget,
  topicAccuracyPct,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { buildReadinessScreen, topicState } from "@/lib/learning/readiness-screen";
import { ExamReadinessScreen } from "@/components/parity/exam-readiness-screen";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

const ROOT = path.resolve(__dirname, "../..");

function topic(key: string, correct: number, total = 10): TopicMasterySnapshot {
  return {
    topicKey: key,
    measured: true,
    level: correct / total >= 0.85 ? "solid" : correct / total >= 0.6 ? "emerging" : "weak",
    confidence: Math.round((correct / total) * 100),
    evidenceCount: total,
    firstAttemptCorrect: correct,
    firstAttemptTotal: total,
    independentCorrect: correct,
    independentTotal: total,
    lastPracticedAt: "2026-10-20T09:00:00.000Z",
  };
}

const allDone = (["lesson", "quiz", "written_exam", "final_check"] as PlanNodeKind[]).map((kind) => ({
  kind,
  status: "done" as const,
}));
const links = { focused: "/odak", written: "/deneme", quiz: "/test", home: "/ev" };

describe("readyForTarget: tek kural", () => {
  it("deneme ya da genel skor hedefe ulaşınca true", () => {
    expect(readyForTarget({ mockScorePct: 89, targetScore: 80 })).toBe(true);
    expect(readyForTarget({ mockScorePct: 80, targetScore: 80 })).toBe(true);
    expect(readyForTarget({ mockScorePct: 79, overallPct: 81, targetScore: 80 })).toBe(true);
    expect(readyForTarget({ mockScorePct: 79, overallPct: 70, targetScore: 80 })).toBe(false);
    expect(readyForTarget({ mockScorePct: null, overallPct: null, targetScore: 80 })).toBe(false);
  });

  it("hedef yoksa varsayılan; sayı olmayan değer karar vermez", () => {
    expect(effectiveTarget(null)).toBe(DEFAULT_TARGET_SCORE);
    expect(effectiveTarget(Number.NaN)).toBe(DEFAULT_TARGET_SCORE);
    expect(readyForTarget({ mockScorePct: DEFAULT_TARGET_SCORE })).toBe(true);
    expect(readyForTarget({ mockScorePct: Number.NaN, overallPct: Number.NaN, targetScore: 50 })).toBe(false);
  });
});

describe("konu barajı = hedef", () => {
  it("doğruluk hedefte ya da üstünde → ready, altında → needs_work, kayıt yok → unmeasured", () => {
    expect(topicState(topic("integral", 8), 80)).toBe("ready");
    expect(topicState(topic("integral", 7), 80)).toBe("needs_work");
    expect(topicState({ ...topic("integral", 0), measured: false, evidenceCount: 0 }, 80)).toBe("unmeasured");
    expect(topicAccuracyPct(topic("x", 9))).toBe(90);
  });
});

describe("her ders aynı kurala bağlı", () => {
  const subjects = [
    ["Matematik", ["Türev", "İntegral"]],
    ["Tarih", ["Osmanlı kuruluş", "Tanzimat"]],
    ["Hukuk", ["Borçlar", "Eşya"]],
    ["TUS", ["Pediatri solunum", "Nefroloji"]],
  ] as const;

  for (const [subject, [strong, weak]] of subjects) {
    it(`${subject}: %89 deneme / %80 hedef → Hazırsın; zayıf konu yalnız Çalışılacak`, () => {
      const screen = buildReadinessScreen({
        plannedTopics: [strong, weak],
        mastery: [topic(strong, 9), topic(weak, 6)],
        openMissesByTopic: [],
        mockScorePct: 89,
        targetScore: 80,
        nodes: allDone,
        links,
      });
      expect(screen.ready).toBe(false);
      expect(screen.headline).not.toBe(READY_HEADLINE);
      expect(screen.topics.map((row) => row.state)).toEqual(["ready", "needs_work"]);
    });
  }

  it("deneme ve genel skor hedefin altında → Hazırsın yok", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Kinematik"],
      mastery: [topic("kinematik", 5)],
      openMissesByTopic: [],
      mockScorePct: 55,
      targetScore: 80,
      nodes: allDone,
      links,
    });
    expect(screen.ready).toBe(false);
    expect(screen.headline).not.toBe(READY_HEADLINE);
  });

  it("göstergeler (değerlendirme sayfası ve yol) aynı kararı verir", () => {
    const indicators = buildLearningIndicators({
      nodes: allDone,
      topics: [topic("türev", 9), topic("integral", 6)],
      plannedTopicKeys: ["Türev", "İntegral"],
      openMisconceptions: 2,
      mockScorePct: 89,
      targetScore: 80,
    });
    expect(indicators.examReadiness.claimFullyReady).toBe(false);
    expect(indicators.examReadiness.pct).toBe(75);
  });
});

describe("ekran ve düğüm", () => {
  it("Hazırsın ekranı Sağlam / Çalışılacak gruplarını ayrı başlıkla gösterir", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Türev", "İntegral"],
      mastery: [topic("Türev", 9), topic("İntegral", 6)],
      openMissesByTopic: [],
      mockScorePct: 89,
      targetScore: 80,
      nodes: allDone,
      links,
    });
    const html = renderToStaticMarkup(createElement(ExamReadinessScreen, { screen }));
    expect(html).not.toContain(READY_HEADLINE);
    expect(html).toContain("✅ Sağlam konular");
    expect(html).toContain("Türev · ✅ Sağlam");
    expect(html).toContain("Çalışılacak / Tekrar edilecek");
    expect(html).toContain("İntegral · Çalışılacak");
    expect(html).not.toContain("Hazır konular");
  });

  it("hazırlık ekranı görünce düğüm kendiliğinden tamamlanır (bir kez, bitmiş düğümde değil)", () => {
    const session = readSource(path.join(ROOT, "src/components/parity/exam-node-session.tsx"));
    expect(session).toMatch(/readinessAutoDone = useRef\(false\)/);
    expect(session).toMatch(/kind !== "readiness" \|\| nodeDone \|\| readinessAutoDone\.current/);
    expect(session).toMatch(/payload\.type !== "readiness" \|\| !payload\.screen/);
    const page = readSource(path.join(ROOT, "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx"));
    expect(page).toContain('nodeDone={node.status === "done"}');
  });
});

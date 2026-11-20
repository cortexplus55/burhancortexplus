/**
 * Faz 4 — ücretli kullanıcı görünümleri (19 Kasım 2026): canlıda yalnız ücretsiz test hesabı var (satın alma ve abonelik
 * verme yok), bu yüzden /ayarlar "Kalan Çalışma Kapasiten" kartı ve yol sonu "Akıllı Kavrama Karnesi" burada sentetik
 * veriyle sunucu çizimiyle kanıtlanır. Gerçek kullanıcı kimliği, canlı hazırlık kimliği ya da rakip adı yok.
 */
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readSource } from "./helpers/node-sources";
import { WorkCapacityCard, WORK_CAPACITY_COPY } from "@/components/profile/work-capacity-card";
import { remainingCapacity } from "@/lib/credits/price-table";
import { ExamReadinessScreen } from "@/components/parity/exam-readiness-screen";
import { buildReadinessScreen, REPORT_CARD_COPY } from "@/lib/learning/readiness-screen";
import { READY_HEADLINE, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { computeTopicPolicy, type PolicyEvidence } from "@/lib/learning/mastery-policy";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

const ROOT = path.resolve(__dirname, "../..");
const NOW = new Date("2026-11-19T09:00:00.000Z");

function evidence(sourceKind: string, correct: boolean, attemptId: string, minutesAgo = 10): PolicyEvidence {
  return {
    sourceKind,
    correct,
    hintAssisted: false,
    isFirstAttempt: true,
    attemptId,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  };
}

function snapshot(key: string, rows: PolicyEvidence[]): TopicMasterySnapshot {
  const policy = computeTopicPolicy(rows, NOW);
  const objective = rows.filter((row) => !row.sourceKind.startsWith("card_"));
  const correct = objective.filter((row) => row.correct).length;
  return {
    topicKey: key,
    measured: policy.measured,
    level: policy.pct >= 70 ? "solid" : policy.pct >= 55 ? "emerging" : "weak",
    confidence: policy.pct,
    evidenceCount: rows.length,
    firstAttemptCorrect: correct,
    firstAttemptTotal: objective.length,
    independentCorrect: correct,
    independentTotal: objective.length,
    lastPracticedAt: NOW.toISOString(),
    policy,
  };
}

/** Ders içi sorular + konu testi, ipucusuz, hepsi doğru: "Öğrendin". */
function learned(key: string) {
  return snapshot(key, [
    evidence("lesson_check", true, `${key}-lc`),
    evidence("lesson_check", true, `${key}-lc`),
    evidence("quiz", true, `${key}-q`),
    evidence("quiz", true, `${key}-q`),
    evidence("quiz", true, `${key}-q`),
  ]);
}

/** Kartlarda "Bildim", konu testinde yanlış: "Biliyorum sanma" (tuzak). */
function trap(key: string) {
  return snapshot(key, [
    evidence("card_knew", true, `${key}-c`, 30),
    evidence("card_knew", true, `${key}-c`, 30),
    evidence("card_knew", true, `${key}-c`, 30),
    evidence("quiz", false, `${key}-q`),
    evidence("quiz", false, `${key}-q`),
    evidence("quiz", true, `${key}-q`),
  ]);
}

const allDone = (["lesson", "quiz", "written_exam", "final_check"] as PlanNodeKind[]).map((kind) => ({
  kind,
  status: "done" as const,
}));
const links = {
  home: "/ev",
  targeted: "/hedefli",
  restudyMixed: "/yeniden?sira=karisik",
  newExam: "/deneme/yeni",
  focused: "/odak",
  written: "/deneme",
  quiz: "/test",
};

describe("Faz 4 — /ayarlar Kalan Çalışma Kapasiten (ücretli görünüm)", () => {
  it("Plus aylık tam hak (4.350): 197 ders, 310 test, 4.350 sohbet", () => {
    expect(remainingCapacity(4350)).toEqual({ lessons: 197, tests: 310, chats: 4350 });
    const html = renderToStaticMarkup(createElement(WorkCapacityCard, { remaining: 4350 }));
    expect(html).toContain(WORK_CAPACITY_COPY.title);
    expect(html).toContain("<strong>197</strong><span>ders</span>");
    expect(html).toContain("<strong>310</strong><span>test</span>");
    expect(html).toContain("<strong>4.350</strong><span>sohbet</span>");
    expect(html).toContain("%100 ücretsiz tekrar");
  });

  it("Sınav Haftası (2.500) ve Sigma (14.500) karşılıkları Math.floor ile", () => {
    expect(remainingCapacity(2500)).toEqual({ lessons: 113, tests: 178, chats: 2500 });
    expect(remainingCapacity(14500)).toEqual({ lessons: 659, tests: 1035, chats: 14500 });
    expect(remainingCapacity(21)).toEqual({ lessons: 0, tests: 1, chats: 21 });
    expect(remainingCapacity(-5)).toEqual({ lessons: 0, tests: 0, chats: 0 });
  });

  it("kart abonede ve kredisi olanda görünür, kurucuda görünmez", () => {
    const page = readSource(path.join(ROOT, "src/app/ayarlar/page.tsx"));
    expect(page).toContain("const showCapacity = !account.isAdmin && (account.isPremium || remainingCredits > 0);");
    expect(page).toContain("{showCapacity ? <WorkCapacityCard remaining={remainingCredits} /> : null}");
  });
});

describe("Faz 4 — yol sonu Akıllı Kavrama Karnesi", () => {
  it("tuzak konu: kehribar şerit + ücretsiz kapatma, kutlama yok, alt çubuk üç eylem", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Türev", "İntegral"],
      mastery: [learned("Türev"), trap("İntegral")],
      openMissesByTopic: [{ topic: "İntegral", count: 2 }],
      mockScorePct: 90,
      targetScore: 70,
      nodes: allDone,
      links,
    });
    expect(screen.ready).toBe(false);
    expect(screen.trap?.line).toBe(REPORT_CARD_COPY.trapLine(1));
    const html = renderToStaticMarkup(createElement(ExamReadinessScreen, { screen }));
    expect(html).not.toContain(READY_HEADLINE);
    expect(html).not.toContain("cp-report--ready");
    expect(html).toContain("1 / 2 Konuyu Öğrendin");
    expect(html).toContain('class="cp-report-trap" role="alert"');
    expect(html).toContain("Dikkat: Bildiğini Düşündüğün Ama Hata Yaptığın 1 Konu Var");
    expect(html).toContain("Hatalarımı Şimdi Kapat (Ücretsiz)");
    expect(html).toContain("Eksik &amp; Tuzak Soruları Çalış (Ücretsiz)");
    expect(html).toContain("Tüm Yolu Baştan Çöz — Karışık Sıra (Ücretsiz)");
    expect(html).toContain("Yeni Deneme Başlat (17 Kredi — Notlandırma Dahil)");
    expect(html).toContain("cp-report-chip--emerald");
    // Öğrenciye iç kod adı gösterilmez.
    for (const code of ["illusion_of_competence", "claimFullyReady", "sourceKind"]) expect(html).not.toContain(code);
  });

  it("ölçülmemiş konu varken kutlama açılmaz (Ölçülmedi nötr gri)", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Türev", "Limit"],
      mastery: [learned("Türev")],
      openMissesByTopic: [],
      mockScorePct: 95,
      targetScore: 70,
      nodes: allDone,
      links,
    });
    expect(screen.ready).toBe(false);
    const html = renderToStaticMarkup(createElement(ExamReadinessScreen, { screen }));
    expect(html).toContain("cp-report-chip--gray");
    expect(html).not.toContain(READY_HEADLINE);
  });

  it("bütün planlı konular Öğrendin iken kutlama açılır", () => {
    const screen = buildReadinessScreen({
      plannedTopics: ["Türev", "İntegral"],
      mastery: [learned("Türev"), learned("İntegral")],
      openMissesByTopic: [],
      mockScorePct: 92,
      targetScore: 70,
      nodes: allDone,
      links,
    });
    expect(screen.ready).toBe(true);
    expect(screen.trap ?? null).toBeNull();
    const html = renderToStaticMarkup(createElement(ExamReadinessScreen, { screen }));
    expect(html).toContain("cp-report--ready");
    expect(html).toContain(READY_HEADLINE);
    expect(html).toContain("2 / 2 Konuyu Öğrendin");
  });
});

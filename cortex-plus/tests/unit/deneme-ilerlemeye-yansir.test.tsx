// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ExamPrepProgress } from "@/components/parity/exam-prep-progress";
import { mockResultsFromRows } from "@/lib/learning/prep-mock-results";
import { buildPrepProgressView, forecastConfidence, type ProgressNode } from "@/lib/learning/prep-progress-view";

/*
  10 Kasım 2026, canlı denetim: hazırlık içinde yazılı deneme çözüp notunu alan öğrencinin İlerleme sekmesi
  "Henüz deneme çözmedin", Deneme Performansı %0 ve "Tahmin için biraz daha veri gerekiyor" diyordu. Denemeler
  yalnız yol adımının kayıtlarından okunuyordu; yol adımı kilitliyken (sırası gelmeden) çözülen deneme kendi
  tablosunda kalıyordu.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

const nodes: ProgressNode[] = [
  { id: "l1", kind: "lesson", title: "A · Ders", status: "done", sessionMeta: { topicTitle: "A" } },
  { id: "q1", kind: "quiz", title: "A · Test", status: "ready", sessionMeta: { topicTitle: "A" } },
  { id: "w1", kind: "written_exam", title: "Yazılı deneme", status: "locked", sessionMeta: {} },
];
const common = {
  nodes,
  topicLabels: ["A", "B"],
  gaps: [],
  examDate: "2026-12-20",
  targetScore: 75,
  dailyMinutes: 45,
  measuredReadinessPct: 40,
  now: new Date("2026-11-10T12:00:00+03:00"),
};

describe("notlanmış deneme kendi kaydından okunur", () => {
  it("deneme başına en son notlanan çözüm; notlanmamış ve başka hazırlığın denemesi sayılmaz", () => {
    const results = mockResultsFromRows({
      prepId: "prep-1",
      exams: [
        { id: "e1", title: "Yazılı deneme · Standart" },
        { id: "e2", title: null },
      ],
      attempts: [
        { exam_id: "e1", score: 60, completed_at: "2026-11-08T10:00:00+03:00" },
        { exam_id: "e1", score: 82, completed_at: "2026-11-09T18:00:00+03:00" },
        { exam_id: "e2", score: "74.6", completed_at: "2026-11-10T09:00:00+03:00" },
        { exam_id: "e2", score: 90, completed_at: null },
        { exam_id: "baska", score: 100, completed_at: "2026-11-10T09:00:00+03:00" },
      ],
      questionCounts: new Map([["e1", 20]]),
    });
    expect(results.map((row) => [row.examId, row.pct, row.questions])).toEqual([
      ["e2", 75, null],
      ["e1", 82, 20],
    ]);
    expect(results[1]!.href).toBe("/deneme-sinavlari/prep-1/deneme/e1/incele");
    expect(results[0]!.title).toBe("Yazılı deneme");
  });
});

describe("İlerleme: Denemeler, Deneme Performansı ve tahmin", () => {
  const mockResults = mockResultsFromRows({
    prepId: "prep-1",
    exams: [{ id: "e1", title: "Yazılı deneme · Standart" }],
    attempts: [{ exam_id: "e1", score: 82, completed_at: "2026-11-10T10:00:00+03:00" }],
    questionCounts: new Map([["e1", 20]]),
  });

  it("yol adımı kilitliyken çözülen deneme listede; tahmin kartı ölçümü güven düzeyiyle yazar", () => {
    const view = buildPrepProgressView({
      ...common,
      attempts: [{ nodeId: "l1", score: 3, total: 3, createdAt: "2026-11-10T09:00:00+03:00" }],
      mockResults,
    });
    expect(view.mocks).toEqual([
      { title: "Yazılı deneme · Standart", date: "2026-11-10T10:00:00+03:00", pct: 82, questions: 20, href: "/deneme-sinavlari/prep-1/deneme/e1/incele" },
    ]);
    expect(view.forecast.kind).toBe("estimate");
    if (view.forecast.kind !== "estimate") return;
    expect(view.forecast.confidence).toBe("İlk ölçüm");
    expect([view.forecast.lowPct, view.forecast.highPct]).toEqual([67, 97]);
    // Eğilim ("bu tempoyla N günde") tek günden türetilmez: tempo yok, eğri beklemede (8 Kasım 2026 kuralı).
    expect(view.pace).toBeNull();
    expect(view.forecastSeries.pending).toBe(true);
  });

  it("yol adımının yazılı deneme kaydı aynı denemenin kopyasıdır: listede iki kez görünmez", () => {
    const done = nodes.map((node) => (node.id === "w1" ? { ...node, status: "done" as const } : node));
    const view = buildPrepProgressView({
      ...common,
      nodes: done,
      attempts: [{ nodeId: "w1", score: 82, total: 100, createdAt: "2026-11-10T10:00:01+03:00" }],
      mockResults,
    });
    expect(view.mocks).toHaveLength(1);
    expect(view.mocks[0]!.href).toContain("/deneme/e1/incele");
  });

  it("tek konu testi de ölçümdür; ders içi sorular ve %0 doğruluk tahmin yazdırmaz", () => {
    const tested = buildPrepProgressView({
      ...common,
      attempts: [{ nodeId: "q1", score: 4, total: 5, createdAt: "2026-11-10T09:00:00+03:00" }],
      mockResults: [],
    });
    expect(tested.forecast.kind).toBe("estimate");
    expect(tested.forecast.kind === "estimate" && [tested.forecast.lowPct, tested.forecast.highPct]).toEqual([65, 95]);

    const lessonOnly = buildPrepProgressView({
      ...common,
      attempts: [{ nodeId: "l1", score: 3, total: 3, createdAt: "2026-11-10T09:00:00+03:00" }],
      mockResults: [],
    });
    expect(lessonOnly.forecast.kind).toBe("waiting");

    const zero = buildPrepProgressView({
      ...common,
      attempts: [{ nodeId: "q1", score: 0, total: 5, createdAt: "2026-11-10T09:00:00+03:00" }],
      mockResults: [],
    });
    expect(zero.forecast.kind).toBe("waiting");
  });

  it("güven düzeyi veriyle artar, aralık daralır", () => {
    expect(forecastConfidence({ scoredItems: 5, activeDays: 1 })).toEqual({ label: "İlk ölçüm", margin: 15 });
    expect(forecastConfidence({ scoredItems: 20, activeDays: 2 })).toEqual({ label: "Orta", margin: 10 });
    expect(forecastConfidence({ scoredItems: 60, activeDays: 5 })).toEqual({ label: "Yüksek", margin: 5 });
    // Çok soru ama tek gün: eğilim tek günden çıkmaz.
    expect(forecastConfidence({ scoredItems: 60, activeDays: 1 }).label).toBe("İlk ölçüm");
  });

  it("ekran: Denemeler sekmesinde puan, soru sayısı ve inceleme bağlantısı; tahmin kartında aralık", () => {
    const view = buildPrepProgressView({
      ...common,
      attempts: [{ nodeId: "l1", score: 3, total: 3, createdAt: "2026-11-10T09:00:00+03:00" }],
      mockResults,
    });
    render(
      <ExamPrepProgress
        view={view}
        daysLabel="40 gün"
        warnings={{}}
        reviewsHref={null}
        radar={null}
        mockHref="/deneme-sinavlari/prep-1/deneme/kurulum"
        onCreate={() => undefined}
      />,
    );
    expect(screen.getByText("%67–%97")).toBeTruthy();
    expect(screen.getByText("Güven düzeyi: İlk ölçüm")).toBeTruthy();
    expect(screen.queryByText("Tahmin için biraz daha veri gerekiyor")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Denemeler" }));
    expect(screen.queryByText("Henüz deneme çözmedin")).toBeNull();
    expect(screen.getByText("82/100")).toBeTruthy();
    expect(screen.getByText(/20 soru/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "İncele" }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/deneme/e1/incele");
  });

  it("hazırlık sayfası ve genel İlerleme aynı okuyucuyu kullanır; deneme puanı yol adımı bitmese de sayılır", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("loadPrepMockResults(supabase, user.id, prepId)");
    expect(page).toContain("mockScorePct = mockResults[0].pct;");
    expect(read("src/lib/learning/prep-insights-load.ts")).toContain("loadPrepMockResults(supabase, userId, String(prep.id))");
  });
});

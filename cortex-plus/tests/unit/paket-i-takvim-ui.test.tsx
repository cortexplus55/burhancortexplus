// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";

/**
 * Paket I · çalışma takvimi, ekranda (30 Ekim 2026): bitmiş adım "Tamamlandı · <tarih>", kısa planda
 * hafta yok, sınav günü saatle, bölümde resmî tatil notu.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T09:00:00+03:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const node = (id: string, kind: HomeNode["kind"], status: HomeNode["status"], sortOrder: number, topic: string, date: string): HomeNode => ({
  id,
  kind,
  title: `${topic} · ${kind}`,
  dayIndex: 1,
  sortOrder,
  status,
  sessionMeta: { topicTitle: topic, topicId: topic, calendarDate: date },
});

const nodes: HomeNode[] = [
  // Plan günü yarındı, öğrenci bugün bitirdi: "Yarın" değil "Tamamlandı · 29 Eki".
  node("mol-lesson", "lesson", "done", 0, "Mol Kavramı", "2026-10-30"),
  node("mol-quiz", "quiz", "ready", 1, "Mol Kavramı", "2026-10-30"),
  node("mol-tf", "true_false", "locked", 2, "Mol Kavramı", "2026-10-29"),
  node("newton-lesson", "lesson", "locked", 3, "Newton'un Hareket Yasaları", "2026-10-30"),
  node("mock", "written_exam", "locked", 4, "Mol Kavramı", "2026-10-30"),
];

function renderHome() {
  return render(
    <ExamPrepHome
      prepId="prep-1"
      title="Fizik ve kimya vizesi"
      examType="Okul"
      examDate="2026-10-31"
      daysLabel="2 gün kaldı"
      progressPct={10}
      nodes={nodes}
      hasTopic
      needsIntro={false}
      startHref="/deneme-sinavlari/prep-1/sonraki"
      createdAt="2026-10-29T08:00:00+03:00"
      examTime="10:00"
      examPlace="Amfi 2"
      nodeDoneOn={{ "mol-lesson": "2026-10-29" }}
    />,
  );
}

describe("Paket I · yol ekranı", () => {
  it("bitmiş adım 'Tamamlandı · 29 Eki' yazar, açık adım günüyle", () => {
    const { container } = renderHome();
    const labels = [...container.querySelectorAll(".cp-path-when")].map((el) => el.textContent?.trim());
    expect(labels).toContain("Tamamlandı · 29 Eki");
    expect(labels.some((label) => label?.startsWith("Bugün"))).toBe(true);
    // Bitmiş adımın etiketinde "Yarın" yok.
    const done = container.querySelector('[aria-label*="Tamamlandı · 29 Eki"]');
    expect(done).not.toBeNull();
  });

  it("iki günlük planda hafta yazılmaz; sınav günü saatiyle yolun sonunda", () => {
    const { container } = renderHome();
    const meta = [...container.querySelectorAll(".cp-path-section-meta")].map((el) => el.textContent ?? "");
    expect(meta.length).toBeGreaterThan(0);
    expect(meta.join(" | ")).not.toMatch(/Hafta/);
    expect(container.querySelector(".cp-path-exam-day")?.textContent).toContain("31 Eki 10:00 · Sınav · Amfi 2");
  });

  it("bölümün tarih aralığındaki resmî tatil başlıkta görünür", () => {
    const { container } = renderHome();
    const notes = [...container.querySelectorAll(".cp-path-section-holiday")].map((el) => el.textContent ?? "");
    expect(notes.join(" | ")).toContain("🇹🇷 Resmî Tatil (Esnek Gün): 29 Eki Cumhuriyet Bayramı");
  });
});

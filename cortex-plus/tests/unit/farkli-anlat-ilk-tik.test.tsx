// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { ResultScreen } from "@/components/parity/exam-node/result";
import { lessonStepCounter } from "@/lib/learning/activity-duration";

afterEach(cleanup);

function lifeFor(overrides: Record<string, unknown>) {
  const noop = () => undefined;
  const base: Record<string, unknown> = {
    prepId: "p1",
    kind: "lesson",
    stage: "result",
    payload: { type: "lesson", lesson: { title: "Ders" } },
    rewriteHref: "/deneme-sinavlari/p1/dugum/n1?farkli=1",
    rewritePending: false,
    score: { score: 0, total: 0, retried: 0 },
    heroScore: 0,
    heroTotal: 0,
    unscored: true,
    isOral: false,
    isTimedExam: false,
    gainOpen: false,
    spentMinutes: () => 3,
    nextHref: "/deneme-sinavlari/p1",
    router: { push: vi.fn(), refresh: vi.fn() },
    ...overrides,
  };
  return new Proxy(base, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (/^(set|load|start)/.test(key)) return noop;
      return undefined;
    },
  });
}

describe("Farklı anlat ilk tık (3 Kasım 2026 canlı hata)", () => {
  it("ilk tık gezinme beklemeden yerinde başlatır: kurulum ekranı + istek aynı tıkta", () => {
    const beginRewrite = vi.fn(() => Promise.resolve());
    const setStage = vi.fn();
    const router = { push: vi.fn(), refresh: vi.fn() };
    // Sayfa bitmiş dersin düz adresinden açıldı (kayıtlı hâl): eskiden yalnız router.push yapılıyordu.
    const life = lifeFor({ beginRewrite, setStage, router, reviewSaved: true, rewriteLesson: false });
    render(<ResultScreen life={life as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Farklı anlat" }));
    expect(setStage).toHaveBeenCalledWith("setup");
    expect(beginRewrite).toHaveBeenCalledTimes(1);
    expect(beginRewrite).toHaveBeenCalledWith("/deneme-sinavlari/p1/dugum/n1?farkli=1");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("istek sürerken düğme pasif ve 'Açılıyor…' der", () => {
    render(<ResultScreen life={lifeFor({ rewritePending: true, beginRewrite: vi.fn() }) as never} />);
    const button = screen.getByRole("button", { name: "Açılıyor…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("akış sırasında adım sayacı", () => {
  // 6 Kasım 2026 (Paket 4): 3 Kasım'daki tahmini payda ("1 / ~8") kalktı; yazım sürerken etiket çıplak "N".
  it("yazım sürerken payda yok; mühürde yazılan adım", () => {
    expect(lessonStepCounter({ index: 0, writtenSteps: 1, building: true }).label).toBe("1");
    expect(lessonStepCounter({ index: 8, writtenSteps: 9, building: true }).label).toBe("9");
    expect(lessonStepCounter({ index: 0, writtenSteps: 7, building: false }).label).toBe("1 / 7");
  });
});

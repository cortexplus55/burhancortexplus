// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { HomeCockpit, HomeSelectionProvider } from "@/components/parity/home-cockpit";
import type { CockpitPrep } from "@/lib/learning/home-cockpit-model";
import { MOMENT_MS, easeSettle } from "@/lib/ui/moment";
import { ringMemoryKey } from "@/lib/ui/moment-memory";

/*
  Anlar, uygulamanın içi (13 Kasım 2026, ürün sahibinin kararı). B1: öğrenci ana ekrana döndüğünde hazırlığın
  tamamlama yüzdesi değiştiyse halka eskiden yeniye 600 ms'de dolar ve sayı sayar; ilk ziyarette ya da değişiklik
  yokken hiçbir şey oynamaz. "Önce" değeri yalnız sekme oturumunda (sessionStorage) durur; yeni API yok.
*/

vi.mock("next/image", () => ({ default: () => null }));

function motion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

function prep(over: Partial<CockpitPrep> = {}): CockpitPrep {
  return {
    id: "P",
    title: "Hazırlık P",
    subject: null,
    examDate: null,
    daysLeft: null,
    behind: false,
    progress: { done: 2, total: 4, pct: 50 },
    next: { heading: "Sıradaki adım", kindLabel: "Konu anlatımı", href: "/x" },
    topics: [
      { id: "k1", label: "Konu 1", done: true, next: null },
      { id: "k2", label: "Konu 2", done: true, next: null },
      { id: "k3", label: "Konu 3", done: false, next: null },
    ],
    currentTopic: 2,
    href: "/deneme-sinavlari/P",
    createdAt: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function cockpit(value: CockpitPrep) {
  return render(
    <HomeSelectionProvider preps={[value]}>
      <HomeCockpit />
    </HomeSelectionProvider>,
  );
}

const pctText = (container: HTMLElement) => container.querySelector(".cx-ring-pct")!.textContent!.trim();

describe("B1 halkanın dolması", () => {
  it("eğri --cx-ease-settle ile aynı: uçlar 0 ve 1, tekdüze artar", () => {
    expect(easeSettle(0)).toBe(0);
    expect(easeSettle(1)).toBeCloseTo(1, 5);
    let previous = 0;
    for (let at = 0.05; at <= 1; at += 0.05) {
      const value = easeSettle(at);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    // Yerleşme eğrisi önden hızlı: yolun yarısında değerin büyük kısmı gelmiş olur.
    expect(easeSettle(0.5)).toBeGreaterThan(0.8);
  });

  it("ilk ziyarette an yok; değer sekme oturumuna yazılır", () => {
    motion(false);
    const { container } = cockpit(prep());
    expect(pctText(container)).toBe("%50");
    expect(container.querySelector(".cx-ring-draw")).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(ringMemoryKey("P"))!)).toEqual({ pct: 50, done: ["k1", "k2"] });
  });

  it("değişiklik yoksa an yok", () => {
    motion(false);
    window.sessionStorage.setItem(ringMemoryKey("P"), JSON.stringify({ pct: 50, done: ["k1", "k2"] }));
    const { container } = cockpit(prep());
    expect(pctText(container)).toBe("%50");
    expect(container.querySelector("[data-counting]")).toBeNull();
  });

  it("yüzde değiştiyse eskiden başlar, sayar ve 600 ms'de yeniye varır; biten konunun yayı çizilir", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    motion(false);
    window.sessionStorage.setItem(ringMemoryKey("P"), JSON.stringify({ pct: 25, done: ["k1"] }));
    const { container } = cockpit(prep());
    expect(pctText(container)).toBe("%25");
    expect(container.querySelector("[data-counting]")).not.toBeNull();
    // Az önce biten konu (k2) boş yayın üstünde çizilir.
    expect(container.querySelectorAll(".cx-ring-draw")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(MOMENT_MS.settle / 2);
    });
    const middle = Number(pctText(container).slice(1));
    expect(middle).toBeGreaterThan(25);
    expect(middle).toBeLessThan(50);
    act(() => {
      vi.advanceTimersByTime(MOMENT_MS.settle);
    });
    expect(pctText(container)).toBe("%50");
    expect(container.querySelector(".cx-ring-draw")).toBeNull();
    expect(container.querySelector("[data-counting]")).toBeNull();
  });

  it("tıklama anı atlar: son değer hemen", async () => {
    motion(false);
    window.sessionStorage.setItem(ringMemoryKey("P"), JSON.stringify({ pct: 25, done: ["k1"] }));
    const { container } = cockpit(prep());
    expect(pctText(container)).toBe("%25");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(pctText(container)).toBe("%50");
  });

  it("hareket azaltmada an oynamaz: son değer hemen", () => {
    motion(true);
    window.sessionStorage.setItem(ringMemoryKey("P"), JSON.stringify({ pct: 25, done: ["k1"] }));
    const { container } = cockpit(prep());
    expect(pctText(container)).toBe("%50");
    expect(container.querySelector(".cx-ring-draw")).toBeNull();
  });

  it("sunucudan çizilmiş sayfa canlanırken (yeniden yükleme) an oynamaz", () => {
    motion(false);
    window.sessionStorage.setItem(ringMemoryKey("P"), JSON.stringify({ pct: 25, done: ["k1"] }));
    // Sunucunun çizdiği halka sayfada duruyor.
    const ssr = document.createElement("div");
    ssr.className = "cx-ring";
    document.body.appendChild(ssr);
    const { container } = cockpit(prep());
    ssr.remove();
    expect(pctText(container)).toBe("%50");
    expect(JSON.parse(window.sessionStorage.getItem(ringMemoryKey("P"))!).pct).toBe(50);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOMENT_MAX_MS, momentPlaying, startMoment } from "@/lib/ui/moment";

/*
  Anlar (depo kararı 11, 13 Kasım 2026): bir ekranda aynı anda en çok bir an, en çok 2,5 sn, tıklama ya da
  Enter / Space / Escape hemen atlar, hareket azaltmada an oynamaz.
*/

function motion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("an kuralı", () => {
  it("süre 2,5 sn'yi aşamaz", () => {
    vi.useFakeTimers();
    motion(false);
    const finish = vi.fn();
    startMoment(9000, finish);
    vi.advanceTimersByTime(MOMENT_MAX_MS - 1);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(finish).toHaveBeenCalledWith(false);
    expect(momentPlaying()).toBe(false);
  });

  it("hareket azaltmada an oynamaz, sonuç hemen", () => {
    motion(true);
    const finish = vi.fn();
    const handle = startMoment(2000, finish);
    expect(handle.instant).toBe(true);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(momentPlaying()).toBe(false);
  });

  it("aynı anda tek an: yenisi başlayınca öncekinin sonucu gösterilir", () => {
    vi.useFakeTimers();
    motion(false);
    const first = vi.fn();
    const second = vi.fn();
    startMoment(2000, first);
    startMoment(2000, second);
    expect(first).toHaveBeenCalledWith(true);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(second).toHaveBeenCalledWith(false);
  });

  it("tıklama ve Enter / Space / Escape anı atlar; başlatan tıklama atlatmaz", async () => {
    motion(false);
    for (const trigger of [
      () => window.dispatchEvent(new Event("pointerdown")),
      () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })),
      () => window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })),
      () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ]) {
      const finish = vi.fn();
      startMoment(2000, finish);
      // Aynı karedeki olay (anı başlatan tıklama) atlatmaz.
      trigger();
      expect(finish).not.toHaveBeenCalled();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      trigger();
      expect(finish).toHaveBeenCalledWith(true);
    }
    // Başka tuş atlatmaz.
    const finish = vi.fn();
    const handle = startMoment(2000, finish);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(finish).not.toHaveBeenCalled();
    handle.end();
    expect(finish).toHaveBeenCalledTimes(1);
  });
});

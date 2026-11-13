// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} />,
}));

import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import { JOURNEY_FILE, JOURNEY_ROADMAP, journeyScanFindings } from "@/lib/marketing/landing-journey";
import { MOMENT_MAX_MS } from "@/lib/ui/moment";

/*
  Anlar (his katmanı), 13 Kasım 2026, ürün sahibinin kararı: misafir turunun anları. Her an en çok 2,5 sn, tıklama ya
  da Enter / Space / Escape hemen atlar, hareket azaltmada oynamaz (depo kararı 11). Yeni cümle yok: anlarda görünen
  her söz sayfada zaten olan bir sözdür.
*/

Element.prototype.scrollIntoView = vi.fn();
window.scrollBy = (() => undefined) as typeof window.scrollBy;

function motion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("A2 tarama anı", () => {
  it("bulgular örnek notun sayfadaki sözleri ve sayıları: 6 sayfa, yol haritasının konu sayısı, hocanın uyarısı, şekil", () => {
    const findings = journeyScanFindings();
    expect(findings.map((finding) => finding.id)).toEqual(["pages", "topics", "warning", "figure"]);
    expect(findings[0]!.text).toBe("6 sayfa");
    // Kartın alt satırı aynı sayfa sayısını söyler.
    expect(JOURNEY_FILE.meta).toContain(findings[0]!.text);
    expect(findings[1]!.text).toBe(`${JOURNEY_ROADMAP.days.length} konu`);
    expect(findings[2]!.text).toBe(SAME_NOTE_CASE.input.lines[0]);
    expect(findings[2]!.text).toMatch(/^Hoca uyarısı: /);
    expect(findings[3]!.text).toBe(SAME_NOTE_CASE.input.lines[1]);
    expect(JOURNEY_FILE.name).toBe(SAME_NOTE_CASE.input.file);
  });

  it("an 2-2,5 sn sürer ve tek başına yolu açar", () => {
    expect(JOURNEY_FILE.scanMs).toBeGreaterThanOrEqual(2000);
    expect(JOURNEY_FILE.scanMs).toBeLessThanOrEqual(MOMENT_MAX_MS);
    vi.useFakeTimers();
    motion(false);
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    const finds = container.querySelectorAll("[data-scan-findings] [data-finding]");
    expect([...finds].map((node) => node.textContent)).toEqual(journeyScanFindings().map((finding) => finding.text));
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs - 1);
    });
    expect(screen.queryByRole("heading", { name: "Yol haritan çıktı" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });

  it("tıklama anı atlar ve yol hemen açılır; başlatan dokunuş atlatmaz", async () => {
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    expect(screen.getByText(JOURNEY_FILE.scanning[0]!)).toBeTruthy();
    await act(async () => {
      await nextFrame();
    });
    expect(screen.queryByRole("heading", { name: "Yol haritan çıktı" })).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });

  it("Escape de atlar", async () => {
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    await act(async () => {
      await nextFrame();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });

  it("hareket azaltmada an oynamaz: yol hemen açılır", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });
});

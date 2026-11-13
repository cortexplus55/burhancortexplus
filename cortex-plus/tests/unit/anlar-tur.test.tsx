// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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
import { WARNING_FORMULA, tourWarningSteps } from "@/lib/demo/guest-tour";
import { SAME_NOTE_CASE } from "@/lib/marketing/advantage-content";
import {
  JOURNEY_FILE,
  JOURNEY_PRODUCT_STEPS,
  JOURNEY_ROADMAP,
  JOURNEY_WARNING,
  JOURNEY_WARNING_STEPS,
  journeyScanFindings,
} from "@/lib/marketing/landing-journey";
import { MOMENT_MAX_MS, MOMENT_MS } from "@/lib/ui/moment";

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
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    // Tarama tam ekran stüdyoda oynar (sayfanın gövdesine çizilir).
    const finds = document.body.querySelectorAll(".lj-studio [data-scan-findings] [data-finding]");
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

describe("A4 hoca uyarısının izi", () => {
  it("etiket ve açıklama örnek notun uyarı satırından; yeni söz yok", () => {
    expect(JOURNEY_WARNING.label).toBe("Hoca uyarısı");
    expect(JOURNEY_WARNING.line).toBe(SAME_NOTE_CASE.input.lines[0]);
  });

  it("uyarıdan çıkan adımlar örnek veriden türetilir ve sabit listeyle aynı", () => {
    // Kalıp uyarının kendisinden: uyarı satırı kalıba uyar, yol haritası uymaz.
    expect(WARNING_FORMULA.test(JOURNEY_WARNING.line)).toBe(true);
    for (const day of JOURNEY_ROADMAP.days) expect(WARNING_FORMULA.test(day.title), day.title).toBe(false);
    expect(tourWarningSteps()).toEqual([...JOURNEY_WARNING_STEPS]);
    // Bugün dört ürün adımının dördü de uyarıyı taşıyor.
    expect([...JOURNEY_WARNING_STEPS]).toEqual([...JOURNEY_PRODUCT_STEPS]);
  });

  it("not adımında etiket yok; taramadan sonra kalıcı, uyarı adımına girince bir kez (600 ms) parlar", () => {
    vi.useFakeTimers();
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const badge = () => document.body.querySelector<HTMLElement>(".lj-studio [data-warning]");
    expect(badge()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    // Yol haritası uyarı adımı değil: etiket durur, parlamaz.
    expect(badge()!.textContent).toContain(JOURNEY_WARNING.label);
    expect(badge()!.className).not.toContain("is-glow");
    fireEvent.click(screen.getByRole("button", { name: /^Adım 3: / }));
    expect(badge()!.className).toContain("is-glow");
    act(() => {
      vi.advanceTimersByTime(MOMENT_MS.settle);
    });
    expect(badge()!.className).not.toContain("is-glow");
    // Plus adımı uyarı adımı değil.
    fireEvent.click(screen.getByRole("button", { name: /^Adım 7: / }));
    expect(badge()!.className).not.toContain("is-glow");
  });

  it("hareket azaltmada etiket durağan, parlamaz", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    fireEvent.click(screen.getByRole("button", { name: /^Adım 4: / }));
    const badge = document.body.querySelector<HTMLElement>(".lj-studio [data-warning]")!;
    expect(badge).toBeTruthy();
    expect(badge.className).not.toContain("is-glow");
  });
});

/*
  Tam ekran kaydırmasız stüdyo (13 Kasım 2026, ürün sahibi): ana sayfada yalnız birinci adım (iki kapı) durur ve iç
  kaydırmalı kutu yoktur; örnek nota dokununca tam ekran stüdyo açılır, sayfa arkada kilitlenir, ✕ ya da Escape ana
  sayfaya döner. Sayfanın kaymasını yavaşlatan bulanıklaştırmalar kalktı.
*/
describe("tam ekran stüdyo", () => {
  it("ana sayfada yalnız birinci adım; stüdyo örnek notla açılır, sayfa kilitlenir, ✕ kapatır ve odağı geri verir", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(document.querySelector(".lj-door [data-step]") ?? document.querySelector('.lj-door[data-step="upload"]')).toBeTruthy();
    const sample = screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) });
    sample.focus();
    fireEvent.click(sample);
    const studio = screen.getByRole("dialog", { name: "Bir not, yedi adımda derse dönüşsün" });
    expect(studio.className).toContain("lj-studio");
    expect(document.documentElement.style.overflow).toBe("hidden");
    // Ana sayfadaki tur arkada etkisiz: ray düğmeleri yalnız stüdyoda bir kez bulunur.
    expect(screen.getAllByRole("button", { name: /^Adım 3: / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(sample);
  });

  it("Escape stüdyoyu kapatır; tarama anı sürerken yalnız anı atlatır", async () => {
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    await act(async () => {
      await nextFrame();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    // An atlandı, yol açıldı; stüdyo açık.
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
    expect(document.querySelector(".lj-studio")).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(".lj-studio")).toBeNull();
  });

  it("raydaki 1. durak stüdyoyu kapatır; öbür duraklar stüdyoyu o adımda açar", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: /^Adım 5: / }));
    expect(document.querySelector('.lj-studio[data-step="cards"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Adım 1: / }));
    expect(document.querySelector(".lj-studio")).toBeNull();
  });

  it("ana sayfada iç kaydırma ve bulanıklaştırma yok; stüdyo kaymaz, içerik sığdırılır", () => {
    const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
    const journey = strip(readFileSync("src/styles/landing-journey.css", "utf8").replace(/\r\n/g, "\n"));
    // Eski iç kaydırmalı sahne gövdesi yok; ana sayfadaki kapı içeriği kadar uzar.
    expect(journey).not.toMatch(/\.lj-stage-body\s*\{/);
    expect(journey).toMatch(/\.lj-door \{[^}]*position: relative;/);
    expect(journey).toMatch(/\.lj-studio \{[^}]*position: fixed;[^}]*overflow: hidden;/);
    expect(journey).toMatch(/\.lj-fit \{[^}]*overflow: clip;/);
    for (const file of ["src/styles/landing-journey.css", "src/styles/parity-marketing.css"]) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/backdrop-filter/);
    }
    expect(strip(readFileSync("src/styles/landing.css", "utf8"))).not.toMatch(/\.lp-duo-card \{[^}]*backdrop-filter/);
    // Bileşende pencereyi kaydıran hizalama yok.
    const component = readFileSync("src/components/landing/futuristic-guided-journey.tsx", "utf8");
    expect(component).not.toMatch(/window\.scrollBy|window\.scrollTo|ALIGN_SETTLE/);
  });
});

describe("C3 turdan kayda süreklilik: tur yazar", () => {
  it("stüdyoda ulaşılan adımlar ve sekme yalnız bu sekmenin oturumuna yazılır; birinci adım yazılmaz", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="yks-lgs" />);
    expect(window.sessionStorage.getItem("cp:guest-tour")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.name) }));
    fireEvent.click(screen.getByRole("button", { name: /^Adım 4: / }));
    const saved = JSON.parse(window.sessionStorage.getItem("cp:guest-tour")!);
    expect(saved.steps).toEqual(["roadmap", "question"]);
    expect(saved.segment).toBe("yks-lgs");
  });
});

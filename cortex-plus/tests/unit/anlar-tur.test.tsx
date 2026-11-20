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
  JOURNEY_DATE,
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

/** Ana sayfadaki örnek not kartı ve ders çekirdeğinin sahnesi (Faz 9.1). */
const note = () => document.querySelector<HTMLButtonElement>(".lj-console [data-sample-start]")!;
const phase = () => document.querySelector<HTMLElement>(".lj-console .lj-core-stage")?.getAttribute("data-phase");

/**
 * Örnek notu çekirdeğe gönderir, sınav gününü seçer ve "İlk ekranı aç" ile stüdyoyu dersin ilk ekranında açar
 * (hareket azaltma açıkken: an yok, her şey aynı anda).
 */
function openLessonStudio(days = 7) {
  fireEvent.click(note());
  fireEvent.click(screen.getByRole("radio", { name: `${days} gün` }));
  fireEvent.click(screen.getByRole("button", { name: /İlk ekranı aç/ }));
}

describe("A2 tarama anı (Faz 9.1: ana sayfada, ders çekirdeğinde)", () => {
  it("bulgular örnek notun sayfadaki sözleri ve sayıları: 6 sayfa, yol haritasının konu sayısı, hocanın uyarısı, şekil", () => {
    const findings = journeyScanFindings();
    expect(findings.map((finding) => finding.id)).toEqual(["pages", "topics", "warning", "figure"]);
    expect(findings[0]!.text).toBe("6 sayfa");
    // Kartın alt satırı aynı sayfa sayısını söyler.
    expect(JOURNEY_FILE.pagesLabel).toBe(findings[0]!.text);
    expect(findings[1]!.text).toBe(`${JOURNEY_ROADMAP.days.length} konu`);
    expect(findings[2]!.text).toBe(SAME_NOTE_CASE.input.lines[0]);
    expect(findings[2]!.text).toMatch(/^Hoca uyarısı: /);
    expect(findings[3]!.text).toBe(SAME_NOTE_CASE.input.lines[1]);
    expect(JOURNEY_FILE.name).toBe(SAME_NOTE_CASE.input.file);
  });

  it("hareket kısa: çekilme + bulgular 2-3 sn içinde, bulguların anı tek başına 2,5 sn'yi aşmaz", () => {
    expect(JOURNEY_FILE.findingsMs).toBeLessThanOrEqual(MOMENT_MAX_MS);
    expect(JOURNEY_FILE.absorbMs + JOURNEY_FILE.findingsMs).toBeLessThanOrEqual(3000);
  });

  it("not çekirdeğe çekilir, bulgular sırayla belirir ve sınav günü sorulur; gün seçilince ders doğar (bulgular bitince)", () => {
    vi.useFakeTimers();
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(phase()).toBe("idle");
    fireEvent.click(note());
    // Kart önce çekirdeğin içine girer (an), sonra tarama başlar.
    expect(phase()).toBe("idle");
    expect(note().className).toContain("is-absorbing");
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.absorbMs);
    });
    expect(phase()).toBe("scanning");
    const finds = document.querySelectorAll(".lj-console [data-scan-findings] [data-finding]");
    expect([...finds].map((node) => node.textContent)).toEqual(journeyScanFindings().map((finding) => finding.text));
    expect(screen.getByRole("radiogroup", { name: JOURNEY_DATE.title })).toBeTruthy();
    // Gün bulgular bitmeden seçilirse ders bulgular bitince doğar.
    fireEvent.click(screen.getByRole("radio", { name: "14 gün" }));
    expect(screen.getByRole("radio", { name: "14 gün" }).getAttribute("aria-checked")).toBe("true");
    expect(phase()).toBe("scanning");
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.findingsMs);
    });
    expect(phase()).toBe("born");
    // Stüdyo açılmadı: tarama ve doğuş ana sayfada.
    expect(document.querySelector(".lj-studio")).toBeNull();
  });

  it("tıklama anı atlar: bulgular hemen görünür; başlatan dokunuş atlatmaz", async () => {
    vi.useFakeTimers();
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(note());
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.absorbMs);
    });
    const list = () => document.querySelector(".lj-console [data-scan-findings]")!;
    expect(list().className).not.toContain("is-shown");
    // Dinleyiciler bir sonraki karede bağlanır.
    act(() => {
      vi.advanceTimersByTime(40);
    });
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(list().className).toContain("is-shown");
    // Bulgular göründü: gün seçilince ders hemen doğar.
    fireEvent.click(screen.getByRole("radio", { name: "3 gün" }));
    expect(phase()).toBe("born");
  });

  it("Escape de atlar; stüdyo açık değilken hiçbir şeyi kapatmaz", () => {
    vi.useFakeTimers();
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(note());
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.absorbMs + 40);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(".lj-console [data-scan-findings]")!.className).toContain("is-shown");
    expect(phase()).toBe("scanning");
  });

  it("hareket azaltmada an oynamaz: dokununca bulgular hemen, gün seçilince ders hemen doğar", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(note());
    expect(phase()).toBe("scanning");
    expect(document.querySelector(".lj-console [data-scan-findings]")!.className).toContain("is-shown");
    fireEvent.click(screen.getByRole("radio", { name: "30 gün" }));
    expect(phase()).toBe("born");
  });

  it("çekirdeğe dokunmak da örnek notu gönderir; klavyede odak sınav gününe geçer, ok tuşları seçer, çipler doğuşta kalır", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const core = document.querySelector<HTMLButtonElement>(".lj-console [data-core]")!;
    core.focus();
    fireEvent.click(core);
    expect(phase()).toBe("scanning");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "3 gün" }));
    // Ok tuşu odaktaki çipten bir sonrakine geçer ve onu seçer: ders doğar, çipler yerinde kalır.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(phase()).toBe("born");
    expect(screen.getByRole("radio", { name: "7 gün" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "7 gün" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "14 gün" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(JOURNEY_DATE.planTitle(14))).toBeTruthy();
    // Sondan başa döner.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "3 gün" }).getAttribute("aria-checked")).toBe("true");
  });

  it("sürükleme: çekirdeğin çemberine yaklaşınca mıknatıs ('Bırak'), orada bırakılınca not içine çekilir; uzakta bırakılınca yerine döner", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const card = note();
    const near = () => document.querySelector(".lj-console .lj-core-stage")!.hasAttribute("data-near");
    // jsdom'da kutuların ölçüsü 0: çekirdeğin merkezi kartın merkezinde. Uzak bir noktaya taşınan kart mıknatısa girmez.
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: "mouse" });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 300, clientY: 200, pointerType: "mouse" });
    expect(card.className).toContain("is-dragging");
    expect(card.style.transform).toBe("translate(300px, 200px)");
    expect(near()).toBe(false);
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 300, clientY: 200, pointerType: "mouse" });
    // Yerine yaylanır; tarama başlamaz.
    expect(card.className).not.toContain("is-dragging");
    expect(card.style.transform).toBe("");
    expect(phase()).toBe("idle");
    // Çekirdeğin 60 px yakınına gelince mıknatıs: kart merkeze oturur, çekirdek "Bırak" der.
    fireEvent.pointerDown(card, { pointerId: 2, clientX: 0, clientY: 0, button: 0, pointerType: "touch" });
    fireEvent.pointerMove(card, { pointerId: 2, clientX: 30, clientY: 20, pointerType: "touch" });
    expect(near()).toBe(true);
    expect(card.className).toContain("is-near");
    expect(screen.getByRole("button", { name: `${JOURNEY_FILE.coreName}: ${JOURNEY_FILE.coreNear}` })).toBeTruthy();
    fireEvent.pointerUp(card, { pointerId: 2, clientX: 30, clientY: 20, pointerType: "touch" });
    expect(phase()).toBe("scanning");
  });

  it("yalnız kart sürüklenir: dokunmatikte sayfanın kaydırması başka hiçbir yerde engellenmez", () => {
    const css = readFileSync("src/styles/landing-journey.css", "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = css.match(/[^{}]*\{[^}]*touch-action: none;[^}]*\}/g) ?? [];
    expect(rules.map((rule) => rule.split("{")[0]!.trim())).toEqual([".lj-note"]);
  });

  it("dokunarak seçilen gün dersi doğurur; odak birincil düğmeye geçer", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(note());
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(screen.getByRole("radio", { name: "30 gün" }));
    expect(phase()).toBe("born");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /İlk ekranı aç/ }));
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

  it("ana sayfada etiket yok; stüdyoda kalıcı, uyarı adımına girince bir kez (600 ms) parlar", () => {
    vi.useFakeTimers();
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const badge = () => document.body.querySelector<HTMLElement>(".lj-studio [data-warning]");
    expect(badge()).toBeNull();
    expect(document.querySelector(".lj-console [data-warning]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Adım 2: / }));
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
    openLessonStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Adım 4: / }));
    const badge = document.body.querySelector<HTMLElement>(".lj-studio [data-warning]")!;
    expect(badge).toBeTruthy();
    expect(badge.className).not.toContain("is-glow");
  });
});

/*
  Tam ekran kaydırmasız stüdyo (13 Kasım 2026, ürün sahibi): ana sayfada yalnız birinci adım durur ve iç kaydırmalı
  kutu yoktur; Faz 9.1'den beri birinci adım (not, tarama, sınav günü, dersin doğuşu) tümüyle ana sayfada, "İlk ekranı
  aç" stüdyoyu dersin ilk ekranında açar; sayfa arkada kilitlenir, ✕ ya da Escape ana sayfaya döner.
*/
describe("tam ekran stüdyo", () => {
  it("ana sayfada yalnız birinci adım; 'İlk ekranı aç' stüdyoyu dersin ilk ekranında açar, ✕ kapatır ve odağı geri verir", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(document.querySelector('.lj-console .lj-door[data-step="upload"] [data-sample-start]')).toBeTruthy();
    // Örnek nota dokunmak stüdyoyu açmaz: tarama ana sayfada.
    fireEvent.click(note());
    expect(document.querySelector(".lj-studio")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "7 gün" }));
    const open = screen.getByRole("button", { name: /İlk ekranı aç/ });
    open.focus();
    fireEvent.click(open);
    const studio = screen.getByRole("dialog", { name: "Bir not, yedi adımda derse dönüşsün" });
    expect(studio.className).toContain("lj-studio");
    expect(studio.getAttribute("data-step")).toBe("lesson");
    expect(document.documentElement.style.overflow).toBe("hidden");
    // Ana sayfadaki tur arkada etkisiz: ray düğmeleri yalnız stüdyoda bir kez bulunur.
    expect(screen.getAllByRole("button", { name: /^Adım 3: / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(open);
  });

  it("Escape stüdyoyu kapatır", () => {
    motion(false);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(screen.getByRole("button", { name: /^Adım 2: / }));
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector(".lj-studio")).toBeNull();
  });

  it("raydaki 1. durak stüdyoyu kapatır ve birinci adımı baştan kurar; öbür duraklar stüdyoyu o adımda açar", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    openLessonStudio(14);
    fireEvent.click(screen.getByRole("button", { name: /^Adım 5: / }));
    expect(document.querySelector('.lj-studio[data-step="cards"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Adım 1: / }));
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(phase()).toBe("idle");
    expect(note()).toBeTruthy();
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
    // Bileşenlerde pencereyi kaydıran hizalama yok (çekirdek yalnız odaklanan öğeyi gerekirse görünür yere getirir).
    for (const file of ["src/components/landing/futuristic-guided-journey.tsx", "src/components/landing/lesson-core.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/window\.scrollBy|window\.scrollTo|ALIGN_SETTLE/);
    }
  });
});

describe("C3 turdan kayda süreklilik: tur yazar", () => {
  it("stüdyoda ulaşılan adımlar ve sekme yalnız bu sekmenin oturumuna yazılır; birinci adım yazılmaz", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="yks-lgs" />);
    expect(window.sessionStorage.getItem("cp:guest-tour")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Adım 2: / }));
    fireEvent.click(screen.getByRole("button", { name: /^Adım 4: / }));
    const saved = JSON.parse(window.sessionStorage.getItem("cp:guest-tour")!);
    expect(saved.steps).toEqual(["roadmap", "question"]);
    expect(saved.segment).toBe("yks-lgs");
    expect(saved.days).toBeUndefined();
  });

  it("birinci adımda seçilen sınav günü kayda yazılır; ana sayfadaki tarama ve doğuş yazmaz", () => {
    motion(true);
    render(<FuturisticGuidedJourney segmentId="lise" />);
    fireEvent.click(note());
    fireEvent.click(screen.getByRole("radio", { name: "14 gün" }));
    expect(window.sessionStorage.getItem("cp:guest-tour")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /İlk ekranı aç/ }));
    const saved = JSON.parse(window.sessionStorage.getItem("cp:guest-tour")!);
    expect(saved.steps).toEqual(["lesson"]);
    expect(saved.days).toBe(14);
  });
});

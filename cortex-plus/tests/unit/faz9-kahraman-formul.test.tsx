// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { AudienceHero } from "@/components/landing/audience-hero";
import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { FormulaCard } from "@/components/parity/lesson-visual-cards";
import { GUEST_TOUR_LESSONS } from "@/lib/demo/guest-tour-tracks";
import { clearGuestDocuments } from "@/lib/documents/guest-handoff";
import { MATH_FONT_FACES, warmMathFonts } from "@/lib/learning/math-fonts";
import { GUEST_TRACK_IDS } from "@/lib/marketing/guest-demo-tracks";
import { HERO_FOOT } from "@/lib/marketing/landing-content";
import { JOURNEY_COPY, JOURNEY_FILE, JOURNEY_OWN, journeyFile } from "@/lib/marketing/landing-journey";

/*
  Faz 9 (20 Kasım 2026), ürün sahibinin misafir sayfası turu:
  - Kahramanın altı tek satır. Birinci adım Faz 9'da tek kart ("Akıllı Not Stüdyosu") idi; Faz 9.1'de ürün sahibi
    onu geri çevirdi: örnek not ders çekirdeğine kendi elinle götürülür (`LessonCore`).
  - "Formül & Kural → ÇİFT DERECELİ KÖK" kartında yalnız çıplak bir √ görünüyordu: KaTeX yazı tiplerini
    `font-display: block` ile tanımlar, tarayıcı onları ancak formül ekrana gelince ister; inene kadar harfler görünmez,
    kök işareti (SVG) görünür. Yazı tipleri artık formülden önce istenir. Formülün kendisi eksiksiz çizilir.
  - Tam ekran stüdyo ilk kareden opak ve pazarlama menüsünün üstünde.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

Element.prototype.scrollIntoView = vi.fn();
window.HTMLMediaElement.prototype.pause = () => undefined;

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await clearGuestDocuments();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  delete (document as { fonts?: unknown }).fonts;
});

/** Görünen KaTeX katmanının metni (MathML yedeği çıkarılır); KaTeX mutlak değeri "∣" (U+2223) ile çizer. */
function shownMath(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".katex-mathml").forEach((item) => item.remove());
  return (clone.textContent ?? "").replace(/∣/g, "|").replace(/​/g, "");
}

describe("formül kartı eksiksiz çizilir", () => {
  const formulas = GUEST_TRACK_IDS.flatMap((track) =>
    GUEST_TOUR_LESSONS[track].screens.flatMap((screen) =>
      screen.blocks.flatMap((block) => (block.type === "formula" ? [{ track, formula: block.formula }] : [])),
    ),
  );

  it("turdaki her formül kartı KaTeX ile çizilir: ham TeX kalmaz, kök, üs ve alt simgeler düşmez", () => {
    // Lise iki, mühendislik bir formül kartı taşır (TUS ve hukuk derslerinde formül kartı yok).
    expect(formulas.map((item) => item.track)).toEqual(["lise", "lise", "muhendislik"]);
    for (const { track, formula } of formulas) {
      const { container } = render(createElement(FormulaCard, { formula }));
      const expr = container.querySelector(".als-formula-card-expr") as HTMLElement;
      expect(expr.querySelector(".katex-html"), track).toBeTruthy();
      const shown = shownMath(expr);
      expect(shown, track).not.toMatch(/\\|\$|\{|\}/);
      if (formula.title === "Çift dereceli kök") {
        // ²ⁿ√(a²ⁿ) = |a|: kökün derecesi, kökün içi (a ve üssü) ve sağ taraf.
        expect(expr.querySelector(".sqrt .katex-root")?.textContent).toBe("2n");
        expect(shown).toContain("a2n");
        expect(shown).toContain("=|a|");
        expect(shown.replace(/\s/g, "")).toBe("2na2n=|a|");
      }
      if (formula.title === "Tek dereceli kök") expect(shown.replace(/\s/g, "")).toBe("2n+1a2n+1=a");
      if (track === "muhendislik") for (const part of ["F", "k", "V", "batan", "d", "sıvı", "g"]) expect(shown, part).toContain(part);
      cleanup();
    }
  });

  it("formül kartının ifadesi KaTeX'in yazı tiplerini kullanır: ısıtılan yüzler kartta çizilen yüzlerle aynı", () => {
    // KaTeX düz harfleri KaTeX_Main, eğik değişkenleri KaTeX_Math ile çizer; ısıtma listesi ikisini de kapsar.
    const katex = read("node_modules/katex/dist/katex.min.css");
    for (const family of ["KaTeX_Main", "KaTeX_Math", "KaTeX_Size1"]) {
      expect(katex, family).toMatch(new RegExp(`@font-face\\{font-display:block;font-family:${family};`));
      expect(MATH_FONT_FACES.some((face) => face.endsWith(family)), family).toBe(true);
    }
  });
});

describe("formül yazı tipleri formülden önce istenir", () => {
  it("warmMathFonts KaTeX'in düz, eğik ve büyük ayraç yüzlerini ister; yazı tipi listesi yoksa sessiz", () => {
    expect(() => warmMathFonts()).not.toThrow();
    const load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, "fonts", { value: { load }, configurable: true });
    warmMathFonts();
    expect(load.mock.calls.map((call) => (call as unknown[])[0])).toEqual([...MATH_FONT_FACES]);
    expect(MATH_FONT_FACES).toEqual(["1em KaTeX_Main", "italic 1em KaTeX_Math", "1em KaTeX_Size1"]);
    // Reddedilen istek dışarı taşmaz.
    load.mockImplementation(() => Promise.reject(new Error("ağ")));
    expect(() => warmMathFonts()).not.toThrow();
  });

  it("tur ürün ekranları hazır olunca (ders açılmadan) yazı tiplerini ister; dersin kendisi de açılışta ister", async () => {
    const load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, "fonts", { value: { load }, configurable: true });
    render(<FuturisticGuidedJourney segmentId="lise" />);
    expect(load).not.toHaveBeenCalled();
    // Raydan konu testine (formülsüz adım): ekranlar yüklenince yazı tipleri yine istenir.
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım 4: / })[0]!);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(document.querySelector(".lj-studio .tp-frame[data-screen='question']")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("1em KaTeX_Main");
    expect(read("src/components/parity/exam-lesson-steps.tsx")).toMatch(/useEffect\(\(\) => \{\s*warmMathFonts\(\);\s*\}, \[\]\);/);
  });
});

describe("kahramanın altı tek satır", () => {
  it("iki gerçek, hazır müfredat ve örnek ders aynı satırda; eski üç hap ve kabul edilen türler satırı yok", () => {
    const { container } = render(<AudienceHero />);
    const foot = container.querySelector("[data-hero-foot]") as HTMLElement;
    expect(foot.tagName).toBe("P");
    const text = (foot.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(text).toBe("Kart istemiyoruz · İlk dersin süresiz ücretsiz · Notun yoksa hazır müfredattan başla→ · Örnek dersi incele");
    // Ayraçlar ekran okuyucuda okunmaz.
    for (const sep of foot.querySelectorAll(".hm-foot-sep")) expect(sep.getAttribute("aria-hidden")).toBe("true");
    const links = within(foot).getAllByRole("link");
    expect(links.map((link) => [link.textContent?.replace("→", "").trim(), link.getAttribute("href")])).toEqual([
      ["hazır müfredattan başla", "/mufredat"],
      ["Örnek dersi incele", "/ornek"],
    ]);
    expect(HERO_FOOT.facts).toEqual(["Kart istemiyoruz", "İlk dersin süresiz ücretsiz"]);
    expect(container.querySelector(".lp-facts, .lp-inputs, .hm-foot-links")).toBeNull();
    // Birinci adımda kendi notunun yuvası kabul edilen türleri yazar (kahramandan taşındı).
    expect(container.querySelector(".lj-own-types")?.textContent).toBe(JOURNEY_OWN.types);
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/\.hm-foot-link \{[^}]*min-height: 2\.75rem;/);
    expect(css).not.toMatch(/\.hm-facts|\.hm-foot-links|\.lp-aud-tab/);
  });
});

describe("birinci adım: ders çekirdeği (Faz 9.1)", () => {
  it("ray, örnek not, kendi notunun yuvası ve çekirdek; Faz 9'un tek kartı ve iki düğmesi yok; başlık ekran okuyucuda", () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    const card = container.querySelector(".lj-console") as HTMLElement;
    // Sıra: gizli başlık, ray (üstte), birinci adım (not ve çekirdek).
    expect([...card.children].map((child) => child.tagName + "." + child.className.split(" ")[0])).toEqual(["H2.sr-only", "OL.lj-rail", "DIV.lj-door"]);
    expect(within(card).getAllByRole("button", { name: /^Adım \d: / })).toHaveLength(7);
    expect(screen.getByRole("heading", { level: 2, name: JOURNEY_COPY.card }).className).toContain("sr-only");
    expect(container.querySelector("section#nasil")?.getAttribute("aria-labelledby")).toBe("lj-title");
    for (const gone of [
      ".lj-live",
      ".lj-console-head",
      ".lj-context",
      ".lj-own",
      "button.lj-zone",
      "button.lj-file",
      "[data-tracks]",
      "[data-drop]",
      ".lj-drop",
      ".lj-door-actions",
      ".lj-door-start",
    ]) {
      expect(card.querySelector(gone), gone).toBeNull();
    }
    // Örnek not: kâğıt kart, adı, sayfası ve "Tut ve sürükle"; düğmenin adı ne yaptığını söyler.
    const note = card.querySelector("[data-sample-start]") as HTMLButtonElement;
    expect(note.tagName).toBe("BUTTON");
    expect(note.querySelector(".lj-note-name")?.textContent).toBe(journeyFile("lise").name);
    expect(note.querySelector(".lj-note-meta")?.textContent).toBe(`6 sayfa${JOURNEY_FILE.grip}`);
    expect(screen.getByRole("button", { name: `${JOURNEY_FILE.send}: ${journeyFile("lise").name}, 6 sayfa` })).toBe(note);
    // Çekirdek: düğme, adı ve yazısı.
    const core = card.querySelector("[data-core]") as HTMLButtonElement;
    expect(core.textContent).toContain(JOURNEY_FILE.coreLabel);
    expect(screen.getByRole("button", { name: `${JOURNEY_FILE.coreName}: ${JOURNEY_FILE.coreLabel}` })).toBe(core);
    // Kendi notunun yuvası: adı ve kabul edilen türler.
    const slot = card.querySelector("[data-own-pick]") as HTMLButtonElement;
    expect(slot.textContent).toBe(`${JOURNEY_OWN.pick}${JOURNEY_OWN.types}`);
    // Yön ipucu: geniş ve dar ekranın cümlesi.
    expect(card.querySelector(".lj-core-hint")?.textContent).toBe(`${JOURNEY_FILE.hintWide}${JOURNEY_FILE.hintNarrow}`);
    // Adımın yönlendirmesi ekran okuyucuda.
    expect(screen.getByRole("status").textContent).toBe("Adım 1/7: Örnek notu ders çekirdeğine götür ya da kendi notunu bırak");
  });

  it("not kayıt istemeden ana sayfada taranır; gün seçilince ders doğar; 'İlk ekranı aç' stüdyoyu derste açar; yuva dosya seçiciyi açar", () => {
    vi.useFakeTimers();
    const { container } = render(<FuturisticGuidedJourney segmentId="universite" />);
    const input = container.querySelector("input[data-guest-input]") as HTMLInputElement;
    const pick = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${JOURNEY_OWN.pick}`) }));
    expect(pick).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector("[data-sample-start]")!);
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.absorbMs + JOURNEY_FILE.findingsMs);
    });
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(container.querySelector(".lj-console [data-scan-findings]")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "7 gün" }));
    expect(container.querySelector("[data-born]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /İlk ekranı aç/ }));
    expect(screen.getByRole("dialog", { name: JOURNEY_COPY.title }).getAttribute("data-step")).toBe("lesson");
    vi.useRealTimers();
  });

  it("çekirdeğe ya da yuvaya bırakılan dosya misafirin kendi dosyasıdır: sunucuya gitmez, onay kartı açılır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    const core = container.querySelector("[data-core]") as HTMLElement;
    const file = new File([new Uint8Array(1024)], "Kimya_notu.pdf", { type: "application/pdf" });
    fireEvent.dragOver(core, { dataTransfer: { types: ["Files"], files: [file] } });
    // Üstünde dosya tutulurken çekirdek "Bırak" der.
    expect(container.querySelector(".lj-core-stage")?.hasAttribute("data-near")).toBe(true);
    expect(core.textContent).toContain(JOURNEY_FILE.coreNear);
    fireEvent.drop(core, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(await screen.findByText("“Kimya_notu.pdf” taramaya hazır!")).toBeTruthy();
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("yuvaya bırakılan dosya da aynı yoldan gider", async () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    const slot = container.querySelector("[data-own-pick]") as HTMLElement;
    const file = new File([new Uint8Array(512)], "Fizik.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    fireEvent.dragOver(slot, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(slot.className).toContain("is-over");
    fireEvent.drop(slot, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(await screen.findByText("“Fizik.pptx” taramaya hazır!")).toBeTruthy();
  });
});

describe("tam ekran stüdyo ilk kareden opak ve menünün üstünde", () => {
  it("katman canlanmaz (yalnız içi belirir), z-index pazarlama menüsünün ve çerez şeridinin üstünde", () => {
    const css = withoutComments(read("src/styles/landing-journey.css"));
    const studio = css.match(/\n\.lj-studio \{[^}]*\}/)?.[0] ?? "";
    expect(studio).toContain("position: fixed;");
    expect(studio).not.toMatch(/animation|opacity|transform/);
    const z = Number(studio.match(/z-index: (\d+);/)?.[1]);
    expect(z).toBeGreaterThanOrEqual(100);
    // Taban opak sıcak siyah: arkadan hiçbir şey okunmaz (bulanıklaştırma yok).
    expect(studio).toMatch(/background:[^;]*var\(--lj-bg\);/);
    expect(css).toMatch(/:is\(\.lj, \.lj-studio\) \{[^}]*--lj-bg: #0b0907;/);
    expect(css).not.toMatch(/backdrop-filter/);
    // İçerik belirir; hareket azaltmada o da durur.
    expect(css).toMatch(/\.lj-studio > \* \{\s*animation: lj-studio-in/);
    expect(css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"))).toContain(".lj-studio > *");
    // Menü 50, çerez şeridi 70.
    expect(read("src/styles/parity-marketing.css")).toMatch(/> header\.mkh \{\s*position: sticky;\s*top: 0;\s*z-index: 50;/);
    expect(read("src/styles/legal-consent.css")).toMatch(/\.cp-cookie-bar \{[^}]*z-index: 70;/);
  });
});

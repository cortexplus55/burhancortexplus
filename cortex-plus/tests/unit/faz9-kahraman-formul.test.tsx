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
  - Kahramanın altı tek satır; birinci adım tek kart ("Akıllı Not Stüdyosu").
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
    // Birinci adımın bırakma alanında kabul edilen türler yazılı (kahramandan taşındı).
    expect(container.querySelector(".lj-drop-line")?.textContent).toBe(JOURNEY_FILE.dropLine);
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/\.hm-foot-link \{[^}]*min-height: 2\.75rem;/);
    expect(css).not.toMatch(/\.hm-facts|\.hm-foot-links|\.lp-aud-tab/);
  });
});

describe("birinci adım: tek kart (Akıllı Not Stüdyosu)", () => {
  it("ray, bırakma alanı ve iki düğme; canlı rozeti, konsol başlığı ve bağlam satırı yok; başlık ekran okuyucuda", () => {
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    const card = container.querySelector(".lj-console") as HTMLElement;
    // Sıra: gizli başlık, ray (üstte), birinci adım (bırakma alanı ve düğmeler).
    expect([...card.children].map((child) => child.tagName + "." + child.className.split(" ")[0])).toEqual(["H2.sr-only", "OL.lj-rail", "DIV.lj-door"]);
    expect(within(card).getAllByRole("button", { name: /^Adım \d: / })).toHaveLength(7);
    expect(screen.getByRole("heading", { level: 2, name: JOURNEY_COPY.card }).className).toContain("sr-only");
    expect(container.querySelector("section#nasil")?.getAttribute("aria-labelledby")).toBe("lj-title");
    for (const gone of [".lj-live", ".lj-console-head", ".lj-context", ".lj-own", "button.lj-zone", "button.lj-file", "[data-tracks]"]) {
      expect(card.querySelector(gone), gone).toBeNull();
    }
    // Bırakma alanı: örnek notun rozeti ve tek cümle.
    const drop = card.querySelector("[data-drop]") as HTMLElement;
    expect(drop.querySelector(".lj-drop-name")?.textContent).toBe(journeyFile("lise").name);
    expect(drop.querySelector(".lj-drop-pages")?.textContent).toBe("· 6 sayfa");
    expect(drop.textContent).toContain(JOURNEY_FILE.dropLine);
    // Tam olarak iki düğme yan yana: birincil örnek tur, ikincil kendi dosyası (süs simgeleri adın parçası değil).
    const actions = card.querySelector(".lj-door-actions") as HTMLElement;
    const buttons = within(actions).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["✨Örnek Notla 7 Adımı İzle", "📎Kendi Notunu Seç"]);
    expect(screen.getByRole("button", { name: JOURNEY_FILE.start })).toBe(buttons[0]);
    expect(screen.getByRole("button", { name: JOURNEY_OWN.pick })).toBe(buttons[1]);
    expect(buttons[0]!.className).toContain("lj-cta");
    expect(buttons[1]!.className).toContain("lj-ghost");
    // Adımın yönlendirmesi ekran okuyucuda.
    expect(screen.getByRole("status").textContent).toBe("Adım 1/7: Örnek notla yedi adımı izle ya da kendi notunu seç");
  });

  it("birincil düğme kayıt istemeden stüdyoyu açar ve tarama anını oynatır; ikincil düğme dosya seçiciyi açar", () => {
    vi.useFakeTimers();
    const { container } = render(<FuturisticGuidedJourney segmentId="universite" />);
    const input = container.querySelector("input[data-guest-input]") as HTMLInputElement;
    const pick = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_OWN.pick }));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".lj-studio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: JOURNEY_FILE.start }));
    expect(screen.getByRole("dialog", { name: JOURNEY_COPY.title })).toBeTruthy();
    expect(document.querySelector(".lj-studio [data-scan-findings]")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
    vi.useRealTimers();
  });

  it("bırakma alanına bırakılan dosya misafirin kendi dosyasıdır: sunucuya gitmez, onay kartı açılır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<FuturisticGuidedJourney segmentId="lise" />);
    const drop = container.querySelector("[data-drop]") as HTMLElement;
    const file = new File([new Uint8Array(1024)], "Kimya_notu.pdf", { type: "application/pdf" });
    fireEvent.dragOver(drop, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(drop.className).toContain("is-over");
    fireEvent.drop(drop, { dataTransfer: { types: ["Files"], files: [file] } });
    expect(await screen.findByText("“Kimya_notu.pdf” taramaya hazır!")).toBeTruthy();
    expect(document.querySelector(".lj-studio")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
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

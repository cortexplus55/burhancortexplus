// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { FuturisticGuidedJourney } from "@/components/landing/futuristic-guided-journey";
import { PLUS_ONLY_ACTIONS, PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";
import {
  JOURNEY_CARD,
  JOURNEY_FILE,
  JOURNEY_FINAL,
  JOURNEY_LESSON,
  JOURNEY_PLUS_CARDS,
  JOURNEY_QUESTION,
  JOURNEY_ROADMAP,
  JOURNEY_STEP_IDS,
  JOURNEY_STEPS,
  JOURNEY_TRUTH,
  journeyGuideLine,
  journeyScore,
  journeySignupHref,
  nextJourneyStep,
} from "@/lib/marketing/landing-journey";
import { FREE_PLAN_POINTS, HERO_FACTS, PLUS_PLAN_POINTS } from "@/lib/marketing/landing-content";

/*
  11 Kasım 2026, ürün sahibi: misafir ana sayfada örnek bir notu tarama alanına bırakıp ürünü yedi adımda kendi
  tıklamasıyla yaşasın (not → yol haritası → ders → soru → kart → doğru/yanlış → Plus vitrini); tur sıfır model
  maliyetiyle, hiç ağ isteği atmadan çalışsın. Ana sayfa üç bölüme insin, üst menü sabit kalsın ve logo öne çıksın.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

describe("turun içeriği kendi içinde tutarlı", () => {
  it("yedi adım, sırayla; yönlendirme satırı adım numarasını yazar", () => {
    expect(JOURNEY_STEP_IDS).toEqual(["upload", "roadmap", "lesson", "question", "cards", "check", "plus"]);
    expect(JOURNEY_STEPS.map((step) => step.id)).toEqual([...JOURNEY_STEP_IDS]);
    expect(journeyGuideLine("upload")).toMatch(/^Adım 1\/7: /);
    expect(journeyGuideLine("plus")).toMatch(/^Adım 7\/7: /);
    expect(nextJourneyStep("upload")).toBe("roadmap");
    expect(nextJourneyStep("plus")).toBeNull();
  });

  it("sorunun cevabı hesapla tutar; ipucu çifti şıklardan ve cevabı içerir, ipucu cevabı söylemez", () => {
    // √((−4)²) + ∛(−8) = |−4| + (−2) = 2
    expect(Math.sqrt((-4) ** 2) + Math.cbrt(-8)).toBe(2);
    expect(JOURNEY_QUESTION.options).toHaveLength(5);
    expect(JOURNEY_QUESTION.options).toContain(JOURNEY_QUESTION.answer);
    expect(JOURNEY_QUESTION.answer).toBe("2");
    const { pair, hint } = JOURNEY_QUESTION.twoOption;
    expect(pair).toContain(JOURNEY_QUESTION.answer);
    for (const option of pair) expect(JOURNEY_QUESTION.options).toContain(option);
    // En çok karıştırılan yanlış, tuzağa düşünce çıkan sonuçtur: −4 + (−2) = −6.
    expect(pair).toContain(String(-4 + Math.cbrt(-8)).replace("-", "−"));
    expect(hint).not.toMatch(/=\s*2\b|cevap\s*2|doğru (cevap|şık)/i);
    expect(hint).not.toMatch(/\d/);
    // Her yanlış şıkkın kendi açıklaması var; hiçbiri sonucu yazmıyor.
    for (const option of JOURNEY_QUESTION.options.filter((item) => item !== JOURNEY_QUESTION.answer)) {
      const why = JOURNEY_QUESTION.wrongWhy[option];
      expect(why, option).toBeTruthy();
      expect(why).not.toMatch(/=\s*2\b|cevap\s*2|sonuç\s*2/i);
    }
  });

  it("dersin kuralı, kartı ve önermesi aynı kuralı söyler ve doğrudur", () => {
    expect(JOURNEY_LESSON.trap.right).toContain("|−5| = 5");
    expect(Math.sqrt((-5) ** 2)).toBe(5);
    expect(Math.cbrt(-27)).toBe(-3);
    expect(JOURNEY_CARD.back).toContain("|a|");
    // x < 0 iken √(x²) = |x| = −x.
    for (const x of [-3, -0.5, -12]) expect(Math.sqrt(x ** 2)).toBe(-x);
    expect(JOURNEY_TRUTH.answer).toBe(true);
    expect(JOURNEY_ROADMAP.days.filter((day) => day.ready)).toHaveLength(1);
  });

  it("sonuç ziyaretçinin gerçek cevaplarından: uydurma yüzde yok", () => {
    expect(journeyScore({ questionCorrect: true, truthCorrect: true })).toMatchObject({ correct: 2, answered: 2, pct: 100 });
    expect(journeyScore({ questionCorrect: false, truthCorrect: true })).toMatchObject({ correct: 1, pct: 50, line: "2 sorudan 1 doğru" });
    expect(journeyScore({ questionCorrect: null, truthCorrect: false })).toMatchObject({ correct: 0, answered: 1, pct: 0 });
    expect(journeyScore({ questionCorrect: null, truthCorrect: null })).toMatchObject({ answered: 0, pct: null });
  });

  it("Plus vitrinindeki her şey gerçekten Plus'ta; ücretsiz sütun yalnız ücretsiz olanları sayar", () => {
    expect(JOURNEY_PLUS_CARDS.map((card) => card.id)).toEqual(["podcast", "video", "oral", "exam"]);
    // Yol adımlarında ücretsizde açılmayan türler: podcast, sözlü, yazılı deneme, video.
    for (const kind of ["podcast", "oral", "written_exam"]) expect(PLUS_ONLY_NODE_KINDS.has(kind), kind).toBe(true);
    expect(PLUS_ONLY_ACTIONS.some((action) => /VIDEO/.test(action))).toBe(true);
    const freeText = `${FREE_PLAN_POINTS.join(" ")} ${HERO_FACTS.join(" ")} ${JOURNEY_FINAL.body}`.toLocaleLowerCase("tr");
    expect(freeText).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/);
    const plusText = PLUS_PLAN_POINTS.join(" ").toLocaleLowerCase("tr");
    for (const word of ["podcast", "video", "sözlü", "yazılı deneme", "sınav sabahı"]) expect(plusText).toContain(word);
    expect(JOURNEY_FINAL.body).toContain("süre sınırı olmadan ücretsiz");
    expect(journeySignupHref("akademik")).toBe("/kayit?hedef=akademik");
  });
});

describe("tur sıfır maliyetle çalışır", () => {
  it("veri dosyası ve bileşen ağ isteği atmaz, sunucu modülü içe aktarmaz", () => {
    for (const path of ["src/lib/marketing/landing-journey.ts", "src/components/landing/futuristic-guided-journey.tsx"]) {
      const source = withoutComments(read(path));
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|\/api\/|supabase|server-only|openai/i);
    }
    // Veri dosyası yalnız tip içe aktarır.
    expect(read("src/lib/marketing/landing-journey.ts").match(/^import .*$/gm)).toEqual([
      'import type { AudienceSegmentId } from "@/lib/marketing/landing-showcase";',
    ]);
  });

  it("yedi adım sırayla, ziyaretçinin tıklamasıyla ve hiç ağ isteği olmadan oynanır", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<FuturisticGuidedJourney segmentId="universite" />);

    // 1. Not: dosyaya dokununca tarama başlar, süre dolunca yol haritası açılır.
    expect(screen.getByRole("status").textContent).toContain("Adım 1/7");
    click(new RegExp(JOURNEY_FILE.name));
    expect(screen.getByText(JOURNEY_FILE.scanning[0]!)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });

    // 2. Yol haritası
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
    for (const day of JOURNEY_ROADMAP.days) expect(screen.getByText(day.title)).toBeTruthy();
    click(JOURNEY_ROADMAP.cta);

    // 3. Ders: formül kartı, sınav tuzağı, hafıza çivisi
    expect(screen.getByRole("group", { name: JOURNEY_LESSON.formula.title })).toBeTruthy();
    expect(screen.getByText(JOURNEY_LESSON.trap.wrong)).toBeTruthy();
    expect(screen.getByText(JOURNEY_LESSON.hook.body)).toBeTruthy();
    click(JOURNEY_LESSON.cta);

    // 4. Soru: ipucu → yanlış şık (sıcak açıklama, yeniden seçtirir) → doğru şık
    expect(screen.getByText(JOURNEY_QUESTION.prompt)).toBeTruthy();
    click(/İki şık arasında kaldım/);
    expect(screen.getByText(JOURNEY_QUESTION.twoOption.hint, { exact: false })).toBeTruthy();
    click("−6");
    expect(screen.getByText(JOURNEY_QUESTION.wrongWhy["−6"]!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: JOURNEY_QUESTION.cta })).toBeNull();
    click("2");
    expect(screen.getByText(JOURNEY_QUESTION.explanation)).toBeTruthy();
    click(JOURNEY_QUESTION.cta);

    // 5. Kart: dokununca döner
    const card = screen.getByRole("button", { name: /Ön yüz/ });
    expect(card.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(card);
    expect(screen.getByRole("button", { name: /Arka yüz/ }).getAttribute("aria-pressed")).toBe("true");
    click(JOURNEY_CARD.cta);

    // 6. Doğru/Yanlış: sonuç halkası gerçek cevaplardan (ilk seçim yanlıştı → 2 sorudan 1 doğru)
    expect(screen.getByText(JOURNEY_TRUTH.statement)).toBeTruthy();
    click(/Doğru$/);
    expect(screen.getByText(JOURNEY_TRUTH.explanation)).toBeTruthy();
    expect(screen.getByText("2 sorudan 1 doğru")).toBeTruthy();
    expect(screen.getByText("%50")).toBeTruthy();
    click(JOURNEY_TRUTH.cta);

    // 7. Plus vitrini: her kart "Plus" rozetli; kayıt bağlantısı seçili sekmeyi taşır
    expect(screen.getAllByText("Plus", { selector: ".lj-plus-badge" })).toHaveLength(JOURNEY_PLUS_CARDS.length);
    const signup = screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.cta) });
    expect(signup.getAttribute("href")).toBe("/kayit?hedef=universite");
    expect(screen.getByText(JOURNEY_FINAL.body)).toBeTruthy();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ilerleme rayındaki her durak tıklanır; tur baştan oynanır", () => {
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const stops = screen.getAllByRole("button", { name: /^Adım \d: / });
    expect(stops).toHaveLength(7);
    fireEvent.click(stops[6]!);
    expect(stops[6]!.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: new RegExp(JOURNEY_FINAL.cta) }).getAttribute("href")).toBe("/kayit?hedef=lise");
    click("Turu baştan oyna");
    expect(screen.getByRole("status").textContent).toContain("Adım 1/7");
    // Soruyu çözmeden de ilerlenir: "Bu adımı geç".
    fireEvent.click(screen.getAllByRole("button", { name: /^Adım \d: / })[3]!);
    click("Bu adımı geç");
    expect(screen.getByRole("button", { name: /Ön yüz/ })).toBeTruthy();
  });

  it("sürükle-bırak da taramayı başlatır", () => {
    render(<FuturisticGuidedJourney segmentId="lise" />);
    const zone = screen.getByRole("button", { name: new RegExp(JOURNEY_FILE.zoneTitle) });
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);
    act(() => {
      vi.advanceTimersByTime(JOURNEY_FILE.scanMs);
    });
    expect(screen.getByRole("heading", { name: "Yol haritan çıktı" })).toBeTruthy();
  });
});

describe("görünüm kuralları", () => {
  const css = read("src/styles/landing-journey.css");

  it("yazı 12 px altına inmez, dokunma alanı 44 px, hareket azaltmada durur", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(20);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.75);
    for (const selector of [".lj-stop", ".lj-cta", ".lj-option", ".lj-truth-btn"]) {
      const rule = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? "";
      const height = Number(rule.match(/min-height:\s*([\d.]+)rem/)?.[1] ?? 0);
      expect(height, selector).toBeGreaterThanOrEqual(2.75);
    }
    expect(css).toMatch(/\.lj-ghost,\n\.lj-chip \{[^}]*min-height: 2\.75rem/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Dolu düğme zemini beyaz yazıyla okunur tonda (#6366f1 4,5:1'in altında kalıyordu).
    expect(css).toMatch(/\.lj-cta \{[^}]*background: var\(--lj-indigo-deep\)/);
  });

  it("ana sayfa üç bölüm: kahraman + tur, karşılaştırma, SSS ve son çağrı", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx"));
    expect(page).toContain("<AudienceHero />");
    for (const removed of ["<PlusMonth", "<AdvantageShowcase", "<AdvantageComparison", "lp-proof", "lp-flow", "lp-bento"]) {
      expect(page, removed).not.toContain(removed);
    }
    expect(page.indexOf("<AudienceHero />")).toBeLessThan(page.indexOf('id="planlar"'));
    expect(page.indexOf('id="planlar"')).toBeLessThan(page.indexOf("lp-faq"));
    // Tur "Nasıl çalışır" çapasını taşır.
    expect(read("src/components/landing/futuristic-guided-journey.tsx")).toContain('<section id="nasil" className="lj"');
  });

  it("üst menü: logo çekirdeği, şerit ve kaydırmada sabit; kayıt telefonda da görünür", () => {
    const header = read("src/components/marketing/parity-site-header.tsx");
    expect(header).toContain('<CortexMark size={40} priority className="mkh-mark" />');
    expect(header).toContain('className="mkh-rail"');
    expect(header).toContain("mk-btn-primary mkh-cta inline-flex min-h-[44px]");
    expect(header).not.toMatch(/mk-btn-primary hidden/);
    const shell = read("src/styles/parity-marketing.css");
    expect(shell).toMatch(/:is\(\.cinematic-home, \.cinematic-marketing\) > header\.mkh \{\s*position: sticky;\s*top: 0;/);
    expect(shell).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.mkh-halo,/);
  });
});

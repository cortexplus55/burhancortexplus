// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Sinematik ana sayfa (11 Kasım 2026, ikinci tur). Ürün sahibi: "mavi arka ton, mavi düğmeler çok basit kaldı; klasik
  bir yapay zekâ sitesi gibi oldu. Yenilikçi, sinematik, fütüristik olsun; ana ekran boş kalmış, karşılaştırmalarımız
  da olsun."

  Bu test şunları tutar:
  - Pazarlama katmanında mavi eylem rengi geri gelmez (zemin sıcak siyah, eylem kâğıt beyazı, vurgu logonun şeridi).
  - Kahramandaki sahnenin durakları ücretsiz ilk dersin adımlarıdır; film şeridinin Plus etiketleri gerçek kilitlerle
    aynıdır; karşılaştırma satırları kanıtlı kaynaktan gelir ve rakip adı taşımaz.
  - Sayfa hareket azaltmada ve hareketsizken de eksiksiz görünür.
*/

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} />,
}));

import { FeatureReel } from "@/components/landing/feature-reel";
import { HeroScene } from "@/components/landing/hero-scene";
import { LandingDuel } from "@/components/landing/landing-duel";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";
import { FIRST_LESSON_STEPS, PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { ADVANTAGE_ROWS, FORBIDDEN_BRAND_NAMES } from "@/lib/marketing/advantage-content";
import { HERO_SCENE, HOME_COPY, REEL_FRAMES } from "@/lib/marketing/landing-content";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const fold = (text: string) => text.toLocaleLowerCase("tr").replace(/[^a-zçğıöşü]+/g, "");

afterEach(cleanup);

describe("palet: mavi zemin ve mavi düğme geri gelmez", () => {
  const BLUE = [/#4353f3/i, /#5463ff/i, /#6366f1/i, /#4f46e5/i, /rgba\(67, 83, 243/, /rgba\(99, 102, 241/, /rgba\(79, 70, 229/, /rgba\(6, 182, 212/];
  const SHEETS = [
    "src/styles/home-cinema.css",
    "src/styles/landing.css",
    "src/styles/landing-journey.css",
    "src/styles/landing-showcase.css",
    "src/styles/cinematic-home.css",
    "src/styles/advantage.css",
  ];

  it("pazarlama stil dosyalarında mavi eylem rengi yok", () => {
    for (const path of SHEETS) {
      const css = withoutComments(read(path));
      for (const blue of BLUE) expect(css, `${path} ${blue}`).not.toMatch(blue);
    }
  });

  it("zemin sıcak siyah, birincil eylem kâğıt beyazı ve üstündeki yazı mürekkep", () => {
    const landing = read("src/styles/landing.css");
    expect(landing).toContain("--lp-bg: #0b0907;");
    expect(landing).toContain("--lp-action: #f6ecd9;");
    expect(landing).toContain("--lp-on-action: #1b140d;");
    expect(landing).toMatch(/\.lp-btn--primary \{[^}]*background: var\(--lp-action\);[^}]*color: var\(--lp-on-action\);/);
    // Kâğıt zeminde beyaz yazı kalmadı.
    for (const block of withoutComments(landing).split("}")) {
      if (block.includes("background: var(--lp-action)")) expect(block).not.toContain("color: #fff");
    }
    const marketing = read("src/styles/cinematic-home.css");
    expect(marketing).toMatch(/\.mk-btn-primary \{[^}]*background: #f6ecd9;[^}]*color: #1b140d;/);
    const journey = read("src/styles/landing-journey.css");
    expect(journey).toMatch(/\.lj-cta \{[^}]*background: var\(--lj-paper\);[^}]*color: var\(--lj-paper-ink\);/);
  });

  it("şerit logonun dört rengini taşır; altın yalnız Plus karesinde", () => {
    const css = read("src/styles/home-cinema.css");
    expect(css).toContain("--hm-ribbon: linear-gradient(90deg, #ffb224 0%, #ff4d8d 36%, #8b5cf6 68%, #22d3ee 100%);");
    const gold = withoutComments(css)
      .split("}")
      .filter((block) => /253, 179, 0|#fdc94a/.test(block))
      .map((block) => block.slice(block.lastIndexOf("\n.") + 1, block.indexOf("{")).trim());
    for (const selector of gold) expect(selector).toMatch(/plus/);
  });
});

describe("kahramandaki sahne", () => {
  it("duraklar ücretsiz ilk dersin adımları, aynı sırada", () => {
    expect(HERO_SCENE.stops.map((stop) => fold(stop.label))).toEqual(FIRST_LESSON_STEPS.map(fold));
  });

  it("ekran okuyucuya tek cümle; içindeki parçalar gizli", () => {
    const { container } = render(<HeroScene />);
    const scene = screen.getByRole("img", { name: HERO_SCENE.label });
    expect(scene.querySelector(".hs-stage")?.getAttribute("aria-hidden")).toBe("true");
    // Şerit ve dört durak aynı düzlemde: her durak şeridin üstünde bir noktada.
    expect(container.querySelectorAll(".hs-stop")).toHaveLength(HERO_SCENE.stops.length);
    expect(container.querySelectorAll("path.hs-r")).toHaveLength(4);
    for (const stop of container.querySelectorAll<HTMLElement>(".hs-stop")) {
      expect(stop.style.left).toMatch(/%$/);
      expect(stop.style.top).toMatch(/%$/);
    }
  });

  it("not, turda oynanan örnekle aynı konu ve söz vermez", () => {
    expect(HERO_SCENE.note.title).toBe("Köklü Sayılar");
    expect(JSON.stringify(HERO_SCENE)).not.toMatch(/sınavda çıkar|garanti|kesin/i);
  });

  it("hareket azaltmada şerit çizilmiş, sahne düz durur", () => {
    const css = read("src/styles/home-cinema.css");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.hs-r \{\s*stroke-dashoffset: 0;/);
    expect(reduced).toMatch(/\.hs-r--spark,\s*\.hs-scan \{\s*display: none;/);
    // Ölçüler kabın genişliğine bağlı; sahne telefonda da aynı kompozisyon.
    expect(css).toMatch(/\.hs \{[^}]*container-type: inline-size;/);
    expect(css).toMatch(/\.hs-stage \{[^}]*aspect-ratio: 5 \/ 6;/);
  });
});

describe("karşılaştırma düellosu", () => {
  it("her satır kanıtlı kaynaktan: bizim taraf, öbür taraf, rakip adı yok", () => {
    render(<LandingDuel />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(ADVANTAGE_ROWS.length);
    rows.forEach((row, at) => {
      const data = ADVANTAGE_ROWS[at]!;
      expect(within(row).getByText(data.cortex.body)).toBeTruthy();
      expect(within(row).getByText(data.others.body)).toBeTruthy();
      expect(within(row).getByText(`${HOME_COPY.duel.us}: ${data.cortex.verdict}`)).toBeTruthy();
      expect(within(row).getByText(`${HOME_COPY.duel.them}: ${data.others.verdict}`)).toBeTruthy();
      // Başlık emojisiz okunur; emoji süs olarak ayrı ve gizli.
      const heading = within(row).getByRole("heading", { level: 3 });
      expect(data.feature.endsWith(heading.textContent ?? "\u0000")).toBe(true);
      expect(heading.textContent).not.toBe(data.feature);
    });
    const text = document.body.textContent ?? "";
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(text, brand).not.toMatch(new RegExp(`\\b${brand}\\b`));
    expect(JSON.stringify(HOME_COPY)).not.toMatch(new RegExp(FORBIDDEN_BRAND_NAMES.join("|")));
  });

  it("kör deney kartı dipnotuyla birlikte: öğrencinin canlandırıldığı yazılı", () => {
    render(<LandingDuel />);
    const proof = screen.getByTestId("blind-proof");
    expect(within(proof).getByRole("img", { name: /Ön sınav 35, Son sınav 100/ })).toBeTruthy();
    expect(proof.textContent).toMatch(/yapay zekâ ile canlandırıldı/);
    expect(proof.textContent).toMatch(/Tek konu, tek deney/);
  });

  it("bölüm #farklar çapasını taşır; telefonda tek sütun, masaüstünde şerit ortada", () => {
    render(<LandingDuel />);
    expect(document.querySelector("section#farklar")).toBeTruthy();
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/\.hm-duel-row \{[^}]*grid-template-columns: 3rem minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(min-width: 900px\) \{[\s\S]*\.hm-duel-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 4\.5rem minmax\(0, 1fr\);/);
  });
});

describe("film şeridi", () => {
  it("Plus etiketi gerçek kilitlerle aynı", () => {
    const plus = new Set(REEL_FRAMES.filter((frame) => frame.plusOnly).map((frame) => frame.id));
    expect([...plus].sort()).toEqual(["podcast", "sinav-sabahi", "sozlu", "video", "yazili"]);
    for (const code of ["PODCAST_GENERATE", "VIDEO_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE"] as const) {
      expect(isPlusOnlyAction(code), code).toBe(true);
    }
    // Ücretsizde hiç açılmayanların açık listesi (kredi kapıları + sınav sabahı kâğıdı) karelerle bire bir.
    expect(PLUS_ONLY_FEATURES).toHaveLength(plus.size);
    // İlk dersin adımları (ücretsiz, süresiz) etiketsiz.
    for (const id of ["ders", "kartlar", "dogru-yanlis", "konu-testi"]) expect(plus.has(id), id).toBe(false);
  });

  it("on iki kare; Plus kareleri etiketli, düğmeler adlı, şerit klavyeyle kayar", () => {
    render(<FeatureReel />);
    const strip = screen.getByRole("list", { name: HOME_COPY.reel.title });
    expect(strip.getAttribute("tabindex")).toBe("0");
    const frames = within(strip).getAllByRole("listitem");
    expect(frames).toHaveLength(REEL_FRAMES.length);
    expect(frames.filter((frame) => /Plus$/.test(within(frame).getByRole("heading").textContent ?? ""))).toHaveLength(5);
    expect(screen.getByRole("button", { name: HOME_COPY.reel.prev })).toBeTruthy();
    expect(screen.getByRole("button", { name: HOME_COPY.reel.next })).toBeTruthy();
  });

  it("şerit yana kayar, sayfa kaymaz; düğmeler 44 px", () => {
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/\.hm-film-strip \{[^}]*overflow-x: auto;/);
    expect(css).toMatch(/\.hm-frame \{[^}]*width: min\(74vw, 16\.5rem\);/);
    expect(css).toMatch(/\.hm-reel-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  });
});

describe("sayfa", () => {
  it("sahneler sırayla: kahraman ve tur, düello, film şeridi, planlar, sık sorulanlar, son çağrı", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const order = ["<AudienceHero />", "<LandingDuel />", "<FeatureReel />", 'id="planlar"', "lp-faq", "lp-final"];
    const at = order.map((mark) => page.indexOf(mark));
    for (const index of at) expect(index).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(page).toContain('<div className="lp hm">');
    expect(read("src/components/landing/audience-hero.tsx")).toContain("<HeroScene />");
  });

  it("yazı ve dokunma tabanı: metin 14 px, etiket 12 px altına inmez", () => {
    const css = withoutComments(read("src/styles/home-cinema.css"));
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    // Sahnedeki etiketler kabın genişliğine bağlı ama 12 px'in altına inmez.
    expect(css).toMatch(/\.hs-stop \{[^}]*font-size: clamp\(0\.75rem, 3\.5cqw, 1\.05rem\);/);
    expect(css).toMatch(/\.hm-cta \{[^}]*min-height: 3\.5rem;/);
  });
});

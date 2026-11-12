// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Sinematik ana sayfa (11 Kasım 2026, ikinci tur). Ürün sahibi: "mavi arka ton, mavi düğmeler çok basit kaldı; klasik
  bir yapay zekâ sitesi gibi oldu. Yenilikçi, sinematik, fütüristik olsun; ana ekran boş kalmış, karşılaştırmalarımız
  da olsun."

  Aynı gece, kokpit (canlı denetim): sayfa dört bölüme indi. Durağan kahraman sahnesi ve film şeridi kalktı (anlattıklarını
  kokpit canlı gösteriyor); kör deney kartının yerinde "aynı not, iki ayrı sonuç" kartı var; planlar üç kart; çerez
  bandı ince bir şerit; hedef kitle sekmeleri yüksek kontrastlı.

  Bu test şunları tutar:
  - Pazarlama katmanında mavi eylem rengi geri gelmez (zemin sıcak siyah, eylem kâğıt beyazı, vurgu logonun şeridi).
  - Karşılaştırma kartı ve satırları kanıtlı kaynaktan gelir, rakip adı ve tutulamayan söz taşımaz.
  - Sayfanın dört bölümü sırayla durur; yazı ve dokunma tabanı korunur.
*/

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt="" {...(props as object)} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HOME_DUEL_ROW_IDS, LandingDuel } from "@/components/landing/landing-duel";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";
import { PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { WEEKLY_PLUS_PLAN_NAME } from "@/lib/billing/tier-presentation";
import { ADVANTAGE_ROWS, FORBIDDEN_BRAND_NAMES, SAME_NOTE_CASE, allAdvantageCopy } from "@/lib/marketing/advantage-content";
import { FAQ, HOME_COPY, WEEK_PLAN_POINTS } from "@/lib/marketing/landing-content";
import { JOURNEY_PLUS_ALSO, JOURNEY_PLUS_PREVIEWS } from "@/lib/marketing/landing-journey";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");

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
    "src/styles/tour-previews.css",
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

  it("şerit logonun dört rengini taşır; altın yalnız Plus kartında", () => {
    const css = read("src/styles/home-cinema.css");
    expect(css).toContain("--hm-ribbon: linear-gradient(90deg, #ffb224 0%, #ff4d8d 36%, #8b5cf6 68%, #22d3ee 100%);");
    const gold = withoutComments(css)
      .split("}")
      .filter((block) => /253, 179, 0|#fdc94a/.test(block))
      .map((block) => block.slice(block.lastIndexOf("\n.") + 1, block.indexOf("{")).trim());
    expect(gold.length).toBeGreaterThan(0);
    for (const selector of gold) expect(selector).toMatch(/plus/);
  });

  it("hedef kitle sekmeleri yüksek kontrastlı: seçili olmayan dolu koyu yüzey ve açık yazı, seçili kâğıt beyazı", () => {
    const css = withoutComments(read("src/styles/landing-showcase.css"));
    const base = css.match(/\.lp-aud-tab \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("background: #1e1813;");
    expect(base).toContain("color: #f7f1e8;");
    expect(base).toContain("border: 1px solid rgba(247, 241, 232, 0.42);");
    expect(base).toContain("min-height: 2.75rem;");
    const on = css.match(/\.lp-aud-tab\.is-on \{[^}]*\}/)?.[0] ?? "";
    expect(on).toContain("background: #f6ecd9;");
    expect(on).toContain("color: #1b140d;");
    // Seçili sekmenin halesi şeridin renklerinden; çivit ya da camgöbeği dolgu yok.
    expect(on).toMatch(/box-shadow:[\s\S]*rgba\(255, 178, 36/);
    expect(css).not.toMatch(/indigo|#6366f1|#4f46e5/i);
  });
});

describe("kahraman: söz kısa, kokpit ilk ekranda", () => {
  it("durağan sahne kalktı; başlık, cümle, sekmeler ve düğmeden sonra kokpit gelir", () => {
    const hero = withoutComments(read("src/components/landing/audience-hero.tsx"));
    expect(hero).not.toMatch(/HeroScene|hero-scene/);
    const order = ['className="hm-title"', 'className="hm-lead"', "<AudienceTabs", "segment.ctaLabel", "<FuturisticGuidedJourney", "HERO_FACTS.map"];
    const at = order.map((mark) => hero.indexOf(mark));
    for (const index of at) expect(index).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const css = read("src/styles/home-cinema.css");
    expect(css).not.toMatch(/\.hs-|\.hm-proof|\.hm-reel|\.hm-film|\.hm-frame/);
    expect(css).toMatch(/\.hm-hero-grid \{[^}]*grid-template-areas:\s*"copy"\s*"pick"\s*"cockpit"\s*"foot";/);
    // Tur kahramanın içinde: kendi zemini ve dış boşluğu yok.
    expect(css).toMatch(/\.hm-hero \.lj \{\s*padding: 0;\s*background: none;/);
    // Geniş ekranda sekmeler ve kayıt düğmesi tek satırda: ilk ekranda kokpite yer kalır.
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.hm-hero-pick \{\s*display: flex;/);
  });

  it("hareket azaltmada başlığın çizgisi çizilmiş durur", () => {
    const css = read("src/styles/home-cinema.css");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.hm-title-under path \{\s*stroke-dashoffset: 0;/);
  });
});

describe("aynı not, iki ayrı sonuç", () => {
  it("somut karşılaştırma kartı: ortak girdi, genel bot ve Cortex Plus; kör deney kartı ana sayfada yok", () => {
    render(<LandingDuel />);
    expect(screen.queryByTestId("blind-proof")).toBeNull();
    expect(document.body.textContent).not.toMatch(/canlandırıl|Örnek Senaryo Deneyinde|35 → 100/);
    const card = screen.getByTestId("same-note-case");
    expect(within(card).getByText(SAME_NOTE_CASE.input.file)).toBeTruthy();
    for (const line of SAME_NOTE_CASE.input.lines) expect(within(card).getByText(line)).toBeTruthy();
    const them = within(card).getByRole("region", { name: HOME_COPY.duel.them });
    const us = within(card).getByRole("region", { name: HOME_COPY.duel.us });
    for (const point of SAME_NOTE_CASE.others.points) expect(within(them).getByText(point)).toBeTruthy();
    for (const point of SAME_NOTE_CASE.cortex.points) expect(within(us).getByText(point.text)).toBeTruthy();
    expect(within(us).getByText(SAME_NOTE_CASE.cortex.badge)).toBeTruthy();
  });

  it("Cortex tarafındaki her sözün kodda kanıtı var; tutulamayan söz yok", () => {
    for (const point of SAME_NOTE_CASE.cortex.points) {
      expect(point.evidence.length, point.text).toBeGreaterThan(0);
      for (const ref of point.evidence) expect(() => readFileSync(ref.split(" ")[0]!), ref).not.toThrow();
    }
    const copy = JSON.stringify(SAME_NOTE_CASE);
    // Bugünkü motor: yazar + hafif doğrulayıcı + kod denetimi. "Sembolik çözücü", "birebir", "%100" yazılmaz.
    expect(copy).not.toMatch(/sembolik|birebir|%100|garanti|her zaman|asla/i);
    // LGS dört şıklıdır: "4 şık yabancı format" denmez.
    expect(copy).not.toMatch(/yabancı/i);
    expect(copy).toContain("LGS'de 4 şık (A–D)");
    // Öbür taraf kesinlik bildirmez, rakip adı taşımaz.
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(copy.toLocaleLowerCase("tr")).not.toContain(brand.toLocaleLowerCase("tr"));
    expect(allAdvantageCopy()).toContain(SAME_NOTE_CASE.cortex.points[0]!.text);
  });

  it("fark satırları açılır; kartın anlattığı iki fark ikinci kez yazılmaz", () => {
    render(<LandingDuel />);
    expect([...HOME_DUEL_ROW_IDS]).toEqual(["ikiz-sinav", "sinav-sabahi", "ikiz-soru", "sessiz-sozlu", "velime-link"]);
    const list = document.querySelector("ol.hm-duel-list") as HTMLElement;
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(HOME_DUEL_ROW_IDS.length);
    rows.forEach((row, at) => {
      const data = ADVANTAGE_ROWS.find((item) => item.id === HOME_DUEL_ROW_IDS[at])!;
      expect(within(row).getByText(data.cortex.body)).toBeTruthy();
      expect(within(row).getByText(data.others.body)).toBeTruthy();
      expect(within(row).getByText(`${HOME_COPY.duel.us}: ${data.cortex.verdict}`)).toBeTruthy();
      expect(within(row).getByText(`${HOME_COPY.duel.them}: ${data.others.verdict}`)).toBeTruthy();
      // Başlık emojisiz okunur; emoji süs olarak ayrı ve gizli.
      const heading = within(row).getByRole("heading", { level: 3 });
      expect(data.feature.endsWith(heading.textContent ?? "\u0000")).toBe(true);
      expect(heading.textContent).not.toBe(data.feature);
      // İlk satır açık gelir, ötekiler kapalı: sayfa kısa kalır, metin sayfada durur.
      expect(row.querySelector("details")?.hasAttribute("open")).toBe(at === 0);
    });
    const text = document.body.textContent ?? "";
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(text, brand).not.toMatch(new RegExp(`\\b${brand}\\b`));
    expect(JSON.stringify(HOME_COPY)).not.toMatch(new RegExp(FORBIDDEN_BRAND_NAMES.join("|")));
    // Tam tablo Özellikler sayfasında.
    expect(screen.getByRole("link", { name: HOME_COPY.duel.more }).getAttribute("href")).toBe("/ozellikler#farklar");
  });

  it("bölüm #farklar çapasını taşır; kart geniş ekranda iki sütun, satırların omurgası solda", () => {
    render(<LandingDuel />);
    expect(document.querySelector("section#farklar")).toBeTruthy();
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/\.hm-duel-row \{[^}]*grid-template-columns: 3rem minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.hm-case-split \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(min-width: 900px\) \{\s*\.hm-case-split \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.hm-duel-summary \{[^}]*min-height: 3rem;/);
  });
});

describe("planlar ve güvenceler", () => {
  it("üç kart: Ücretsiz (ilk ders süresiz açık), Plus, Sınav Haftası; fiyatlar veritabanından", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(page).toContain('className="lp-duo lp-trio"');
    expect(page.match(/<article className="lp-duo-card/g)).toHaveLength(3);
    expect(page).toContain("{copy.freeBadge}");
    expect(HOME_COPY.plans.freeBadge).toBe("İlk ders süresiz açık");
    expect(page).toContain("{WEEKLY_PLUS_PLAN_NAME}");
    expect(WEEKLY_PLUS_PLAN_NAME).toContain("Sınav Haftası");
    // Fiyat elle yazılmaz.
    expect(page).toContain("formatTryWhole(prices.plusMonthly)");
    expect(page).toContain("formatTryWhole(prices.plusWeekly)");
    expect(page).not.toMatch(/₺\s?(599|349)/);
    expect(page).toContain("lp-sigma-strip");
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*\.hm \.lp-trio \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });

  it("Sınav Haftası kartı yalnız doğru olanı söyler: tek ödeme, yenileme yok, Plus'taki her şey", () => {
    const text = WEEK_PLAN_POINTS.join(" ");
    expect(text).toMatch(/7 gün/);
    expect(text).toMatch(/kendiliğinden yenilenmez/);
    expect(HOME_COPY.plans.weekLede).toMatch(/abonelik açılmaz/);
  });

  it("Plus adımındaki önizlemeler ve 'ayrıca' satırı gerçek kilitlerle aynı", () => {
    for (const code of ["PODCAST_GENERATE", "VIDEO_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE"] as const) {
      expect(isPlusOnlyAction(code), code).toBe(true);
    }
    const shown = `${JOURNEY_PLUS_PREVIEWS.map((item) => `${item.title} ${item.body}`).join(" ")} ${JOURNEY_PLUS_ALSO}`.toLocaleLowerCase("tr");
    for (const feature of PLUS_ONLY_FEATURES) {
      const word = feature.toLocaleLowerCase("tr").split(" ")[0]!;
      expect(shown, feature).toContain(word);
    }
  });
});

describe("sayfa", () => {
  it("dört bölüm sırayla: kahraman ve kokpit, aynı not, planlar, sık sorulanlar ve son çağrı", () => {
    const page = withoutComments(read("src/components/landing/landing-page.tsx")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const order = ["<AudienceHero />", "<LandingDuel />", 'id="planlar"', "lp-faq", "lp-final"];
    const at = order.map((mark) => page.indexOf(mark));
    for (const index of at) expect(index).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(page).toContain('<div className="lp hm">');
    // "Bir nottan çıkan her şey" şeridi kalktı: aynı etkinlikleri kokpit canlı gösteriyor.
    expect(page).not.toMatch(/FeatureReel|hm-reel|Bir nottan çıkan her şey/);
  });

  it("SSS denetimi bugünkü motorla anlatır; geniş ekranda sorular iki sütun", () => {
    const answer = FAQ.find((item) => item.q.startsWith("İçerik yanlış olursa"))!.a;
    expect(answer).toMatch(/ikinci bir kontrol çağrısı/);
    expect(answer).not.toMatch(/kavram kavram|Düzelmeyen kısım sana gösterilmiyor/);
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/@media \(min-width: 900px\) \{[\s\S]*\.hm \.lp-faq \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it("yazı ve dokunma tabanı: metin 14 px, etiket 12 px altına inmez", () => {
    const css = withoutComments(read("src/styles/home-cinema.css"));
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    expect(css).toMatch(/\.hm-cta \{[^}]*min-height: 3\.5rem;/);
    expect(css).toMatch(/\.hm-duel-more a \{[^}]*min-height: 2\.75rem;/);
  });
});

describe("çerez bandı ince bir şerit", () => {
  it("masaüstünde tek satır, telefonda kısa metin ve üç eşit düğme; başlık satırı yok", () => {
    const banner = read("src/components/legal/cookie-banner.tsx");
    expect(banner).not.toContain("cp-cookie-title");
    expect(banner).toContain('aria-label="Çerez tercihi"');
    expect(banner).toContain('<Link href="/cerez-politikasi">Çerez Politikası</Link>');
    for (const label of ["Reddet", "Tercihler", "Kabul et"]) expect(banner).toContain(`>\n              ${label}\n`);
    const css = read("src/styles/legal-consent.css");
    const bar = css.match(/\n\.cp-cookie-bar \{[^}]*\}/)?.[0] ?? "";
    expect(bar).toContain("left: 0;");
    expect(bar).toContain("right: 0;");
    expect(bar).toContain("bottom: 0;");
    expect(bar).toContain("display: grid;");
    // Geniş ekranda metin solda, düğmeler sağda: tek satır. Eski sol alt kutu (26 rem genişlik) yok.
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*\.cp-cookie-bar \{\s*grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(css).not.toMatch(/width: min\(26rem, calc\(100vw - 2rem\)\)/);
    // Üç düğme eşit ve 44 px (Kurul rehberi: ret, kabul kadar kolay).
    expect(css).toMatch(/\.cp-cookie-actions \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.cp-cookie-btn \{[^}]*min-height: 2\.75rem;/);
    // Bant açıkken pazarlama sayfasının sonu şeridin arkasında kalmaz.
    expect(css).toMatch(/body:has\(\[data-cookie-banner\]\) \.cinematic-marketing \{\s*padding-bottom:/);
  });
});

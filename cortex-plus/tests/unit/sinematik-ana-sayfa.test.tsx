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

import { LandingDuel } from "@/components/landing/landing-duel";
import { isPlusOnlyAction } from "@/lib/billing/free-meters";
import { PLUS_ONLY_FEATURES } from "@/lib/billing/free-tier-copy";
import { WEEKLY_PLUS_PLAN_NAME } from "@/lib/billing/tier-presentation";
import { FORBIDDEN_BRAND_NAMES, SAME_NOTE_CASE, allAdvantageCopy } from "@/lib/marketing/advantage-content";
import { FARK_ITEMS, FARK_LABELS, NOTE_SCENE } from "@/lib/marketing/fark-accordion";
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
    // 20 Kasım 2026 (Faz 7): fark vitrini kartları.
    "src/styles/fark-vitrini.css",
    // 20 Kasım 2026 (Faz 9): fark akordeonu, güven satırı, SSS.
    "src/styles/home-farklar.css",
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

  it("kahramanın tek seçicisi yüksek kontrastlı: seçili olmayan koyu tepside tam açık yazı, seçili kâğıt beyazı", () => {
    // Faz 9 (20 Kasım 2026): dört sekme ve turun branş şeridi tek seçicide birleşti; seçili olmayan seçeneğin sönük
    // durduğu şerit ("Üniversite zayıf görünüyor") kalktı. Oranlar hesaplanır: her biri en az 4,5:1.
    const css = withoutComments(read("src/styles/landing-showcase.css"));
    const tray = css.match(/\.lp-pick \{[^}]*\}/)?.[0] ?? "";
    expect(tray).toContain("background: #15110d;");
    const base = css.match(/\.lp-pick-opt \{[^}]*\}/)?.[0] ?? "";
    expect(base).toContain("color: #f7f1e8;");
    expect(base).toContain("min-height: 3.5rem;");
    const field = css.match(/\.lp-pick-field \{[^}]*\}/)?.[0] ?? "";
    expect(field).toContain("color: #c4b8aa;");
    const on = css.match(/\.lp-pick-opt\.is-on \{[^}]*\}/)?.[0] ?? "";
    expect(on).toContain("background: #f6ecd9;");
    expect(on).toContain("color: #1b140d;");
    expect(css).toMatch(/\.lp-pick-opt\.is-on \.lp-pick-field \{\s*color: #5c4a37;/);
    // Seçili seçeneğin halesi şeridin renklerinden; çivit ya da camgöbeği dolgu yok.
    expect(on).toMatch(/box-shadow:[\s\S]*rgba\(255, 178, 36/);
    expect(css).not.toMatch(/indigo|#6366f1|#4f46e5/i);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const [text, ground] of [
      ["#f7f1e8", "#15110d"],
      ["#c4b8aa", "#15110d"],
      ["#f7f1e8", "#241c15"],
      ["#1b140d", "#f6ecd9"],
      ["#5c4a37", "#f6ecd9"],
      ["#1b140d", "#fffaf0"],
    ]) {
      expect(ratio(text!, ground!), `${text} / ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("kahraman: söz kısa, kokpit ilk ekranda", () => {
  it("durağan sahne kalktı; başlık, cümle, tek seçici ve düğmeden sonra kokpit, en altta tek satır gelir", () => {
    const hero = withoutComments(read("src/components/landing/audience-hero.tsx"));
    expect(hero).not.toMatch(/HeroScene|hero-scene/);
    const order = ['className="hm-title"', 'className="hm-lead"', "<AudiencePicker", "segment.ctaLabel", "<FuturisticGuidedJourney", "HERO_FOOT.facts.map"];
    const at = order.map((mark) => hero.indexOf(mark));
    for (const index of at) expect(index).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const css = read("src/styles/home-cinema.css");
    expect(css).not.toMatch(/\.hs-|\.hm-proof|\.hm-reel|\.hm-film|\.hm-frame/);
    // 27 Kasım 2026 (GEO): ürünün tanımı HTML'de başlıktan hemen sonra, ekranda turun altında (`define` alanı); ilk ekranın
    // sırası (başlık, seçici, kokpit) değişmez.
    expect(css).toMatch(/\.hm-hero-grid \{[^}]*grid-template-areas:\s*"copy"\s*"pick"\s*"cockpit"\s*"define"\s*"foot";/);
    expect(css).toMatch(/\.hm-define \{[^}]*grid-area: define;/);
    const define = hero.indexOf('className="hm-define"');
    expect(define).toBeGreaterThan(hero.indexOf('className="hm-lead"'));
    expect(define).toBeLessThan(hero.indexOf("<AudiencePicker"));
    // Tur kahramanın içinde: kendi zemini ve dış boşluğu yok.
    expect(css).toMatch(/\.hm-hero \.lj \{\s*padding: 0;\s*background: none;/);
    // Geniş ekranda seçici ve kayıt düğmesi tek satırda, ortada: ilk ekranda kokpite yer kalır.
    expect(css).toMatch(/@media \(min-width: 1100px\) \{\s*\.hm-hero-pick \{\s*display: flex;[^}]*justify-content: center;/);
    // Söz ortada (Faz 9): başlık, cümle ve seçici.
    expect(css).toMatch(/\.hm-hero-copy \{[^}]*text-align: center;/);
    expect(css).toMatch(/\.hm-lead \{[^}]*margin: 0\.7rem auto 0;/);
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
    // Faz 9 (20 Kasım 2026): kart akordeonun 1. sahnesi; ilk yüklemede açık başlığın sahnesi.
    expect(card.closest('[data-testid="fark-scene"]')?.getAttribute("data-scene")).toBe("notuna-sadik");
    const them = within(card).getByRole("region", { name: FARK_LABELS.them });
    const us = within(card).getByRole("region", { name: FARK_LABELS.us });
    for (const point of SAME_NOTE_CASE.others.points) expect(within(them).getByText(point)).toBeTruthy();
    for (const point of SAME_NOTE_CASE.cortex.points) expect(within(us).getByText(point.text)).toBeTruthy();
    expect(within(us).getByText(SAME_NOTE_CASE.cortex.badge)).toBeTruthy();
    // Çift kontrolün üç halkası sahnede: yazar, ikinci çağrı, kod.
    for (const step of NOTE_SCENE.checks) expect(within(us).getByText(step)).toBeTruthy();
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

  it("Faz 9: üç düzenli on kartlık yığın tek akordeona indi; başlıklar emojisiz okunur, ilk başlık açık gelir", () => {
    render(<LandingDuel />);
    // Eski yığın yok: fark vitrini ızgarası ve açılır fark satırları.
    expect(document.querySelector('[data-testid="fark-vitrini"], ol.hm-duel-list, details.hm-duel-item')).toBeNull();
    const heads = [...document.querySelectorAll<HTMLElement>(".fk-head")];
    expect(heads).toHaveLength(FARK_ITEMS.length);
    heads.forEach((head, at) => {
      const item = FARK_ITEMS[at]!;
      // Emoji süs: ekran okuyucudan gizli, başlığın adı emojisiz.
      expect(head.querySelector(".fk-node")?.getAttribute("aria-hidden")).toBe("true");
      expect(head.querySelector(".fk-node")?.textContent).toBe(item.emoji);
      expect(head.querySelector(".fk-title")?.textContent).toBe(item.title);
      expect(head.querySelector("button")?.getAttribute("aria-expanded")).toBe(String(at === 0));
    });
    const text = document.body.textContent ?? "";
    for (const brand of FORBIDDEN_BRAND_NAMES) expect(text, brand).not.toMatch(new RegExp(`\\b${brand}\\b`));
    expect(JSON.stringify(HOME_COPY)).not.toMatch(new RegExp(FORBIDDEN_BRAND_NAMES.join("|")));
    // Tam tablo Özellikler sayfasında.
    expect(screen.getByRole("link", { name: HOME_COPY.duel.more }).getAttribute("href")).toBe("/ozellikler#farklar");
  });

  it("bölüm #farklar çapasını taşır; geniş ekranda başlıklar solda (5/12), sahne sağda (7/12); sahne kartı iki sütun", () => {
    render(<LandingDuel />);
    expect(document.querySelector("section#farklar")).toBeTruthy();
    const css = read("src/styles/home-farklar.css");
    expect(css).toMatch(/@media \(min-width: 960px\) \{\s*\.fk \{\s*grid-template-columns: minmax\(0, 5fr\) minmax\(0, 7fr\);/);
    expect(css).toMatch(/\.fk-split \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@container \(min-width: 34rem\) \{\s*\.fk-split \{\s*grid-template-columns: minmax\(0, 0\.85fr\) minmax\(0, 1\.15fr\);/);
    expect(css).toMatch(/\.fk-trigger \{[^}]*min-height: 3\.5rem;/);
    // Eski kurallar silindi (ölü CSS kalmadı).
    expect(read("src/styles/home-cinema.css")).not.toMatch(/\.hm-duel|\.hm-case/);
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

  it("denetim bugünkü motorla anlatılır (akordeonun 1. sahnesinde); SSS'de eski söz yok; geniş ekranda sorular iki sütun", () => {
    // Faz 9 (20 Kasım 2026): "İçerik yanlış olursa" sorusu SSS'den çıktı; çift kontrol akordeonun 1. başlığında ve sahnesinde.
    expect(FARK_ITEMS[0]!.body).toContain("Sorularını çift kontrolden geçirir.");
    expect([...NOTE_SCENE.checks]).toEqual(["Model notundan yazar", "İkinci çağrı soruyu çözer", "Kod anahtarı hesapla denetler"]);
    for (const item of FAQ) expect(`${item.q} ${item.a}`).not.toMatch(/kavram kavram|Düzelmeyen kısım sana gösterilmiyor/);
    const css = read("src/styles/home-cinema.css");
    expect(css).toMatch(/@media \(min-width: 900px\) \{[\s\S]*\.hm \.lp-faq \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it("yazı ve dokunma tabanı: metin 14 px, etiket 12 px altına inmez", () => {
    const css = withoutComments(read("src/styles/home-cinema.css"));
    const sizes = [...css.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
    expect(css).toMatch(/\.hm-cta \{[^}]*min-height: 3\.5rem;/);
    // Faz 9: bölümün ve SSS'nin altındaki bağlantılar `home-farklar.css`te.
    const farklar = withoutComments(read("src/styles/home-farklar.css"));
    expect(farklar).toMatch(/\.fk-more a,\s*\.lp-faq-more a \{[^}]*min-height: 2\.75rem;/);
    for (const size of [...farklar.matchAll(/font-size: ([0-9.]+)rem;/g)].map((match) => Number(match[1]))) {
      expect(size).toBeGreaterThanOrEqual(0.75);
    }
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

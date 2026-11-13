import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Canlı mobil denetim (6 Kasım 2026, 375×812 ve 360×800, gerçek mobil emülasyon).
  1) Podcast oynatıcısı uygulama kabuğundaydı: yapışkan alt menü dökümün son satırlarını örtüyor,
     kontrol çubuğu ilk ekranın altında kalıyordu.
  2) Yirmiyi aşkın düğme ve bağlantının ölçülen kutusu 20–35 px idi.
  Bu bekçi iki düzeltmenin geri gitmesini engeller; gerekçeler CSS yorumlarında.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

type Rule = { selectors: string[]; body: string };

/** Düz kural listesi (iç içe olmayan blok); yorumlar atılır. */
function rulesOf(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    out.push({
      selectors: m[1]!.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
      body: m[2]!,
    });
  }
  return out;
}

function mediaBody(css: string, query: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = clean.indexOf(`@media ${query}`);
  if (start < 0) return "";
  const open = clean.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === "{") depth += 1;
    if (clean[i] === "}") {
      depth -= 1;
      if (depth === 0) return clean.slice(open + 1, i);
    }
  }
  return "";
}

const px = (body: string, prop: string): number | null => {
  const m = body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([\\d.]+)(px|rem)\\s*;`));
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
};

/** Seçicinin kurallarında prop için bulunan en büyük değer. */
const maxFor = (rules: Rule[], selector: string, prop: string) =>
  Math.max(
    0,
    ...rules.filter((r) => r.selectors.includes(selector)).map((r) => px(r.body, prop) ?? 0),
  );

describe("telefon dokunma alanı tabanı (36 px)", () => {
  const css = read("src/styles/mobile-tap-targets.css");
  const mobile = rulesOf(mediaBody(css, "(max-width: 480px)"));

  it("dosya kök düzende yüklenir: her sayfada geçerli", () => {
    expect(read("src/app/layout.tsx")).toContain('import "@/styles/mobile-tap-targets.css";');
  });

  it("kural yalnız telefonda: medya sorgusu dışında bildirim yok", () => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(clean.startsWith("@media (max-width: 480px)")).toBe(true);
    expect(mobile.length).toBeGreaterThan(0);
  });

  const TALL = [
    ".cp-tap",
    ".cp-docs-link",
    ".lc-skip",
    ".ls-pod-lock-link",
    ".ls-back",
    ".cp-sor-logo",
    ".cortex-premium-auth__logo",
    ".cp-path-sketch",
    ".cp-prep-tabs button",
    ".cp-node-sources",
    ".cp-pod-chapter",
    ".cp-pod-rate",
    ".cp-pod-script-btn",
    ".cp-video-ratio button",
    ".cp-video-script summary",
    ".cp-qreport-trigger",
    ".cp-sor-subject",
    ".als-source-page",
    ".cp-exam-coach-chip",
    ".cp-back-pill",
    ".tool-back",
    ".cp-prep-icon",
    ".cp-video-speed",
    ".cp-video-icon",
    ".cp-cal-month button",
    ".cp-survey-close",
  ];

  it.each(TALL)("%s en az 36 px yüksek", (selector) => {
    expect(maxFor(mobile, `:root ${selector}`, "min-height")).toBeGreaterThanOrEqual(36);
  });

  const SQUARE = [".cp-tap", ".cp-prep-icon", ".cp-video-speed", ".cp-video-icon", ".cp-cal-month button", ".cp-survey-close"];

  it.each(SQUARE)("%s simge düğmesi en az 36 px geniş", (selector) => {
    expect(maxFor(mobile, `:root ${selector}`, "min-width")).toBeGreaterThanOrEqual(36);
  });

  it("satır içi bağlantılar kutu kazanır (min-height satır içi öğede işlemez)", () => {
    for (const selector of [".cp-tap", ".cp-docs-link", ".lc-skip", ".ls-pod-lock-link"]) {
      const rule = mobile.find((r) => r.selectors.includes(`:root ${selector}`) && /display:\s*inline-flex/.test(r.body));
      expect(rule, selector).toBeTruthy();
    }
  });

  it("Tailwind sınıflı küçük düğmeler cp-tap taşır", () => {
    const uses: Array<[string, RegExp]> = [
      // 8 Kasım 2026: "Sil" hap (cp-docs-delete, 36 px).
      ["src/components/documents/document-delete-button.tsx", /className="cp-docs-delete cp-tap"\s*\n\s*onClick=\{\(\) => setConfirming\(true\)\}/],
      ["src/components/parity/subscription-cards.tsx", /className="cp-tap [^"]*"\s*\n\s*onClick=\{\(\) => setPlusOpen/],
      ["src/components/parity/mistake-notebook-view.tsx", /className="cp-tap mt-3 inline-flex/],
      ["src/components/layout/premium-auth-shell.tsx", /className="cp-tap [^"]*"\s*\n\s*>\s*\n\s*Ücretsiz dene/],
      ["src/components/marketing/parity-site-header.tsx", /"cp-tap flex shrink-0 items-center/],
      ["src/components/documents/document-pdf-preview.tsx", /className="cp-tap rounded border[^"]*"[\s\S]*className="cp-tap rounded border/],
    ];
    for (const [path, pattern] of uses) expect(read(path), path).toMatch(pattern);
    const review = read("src/components/parity/exam-question-review-client.tsx");
    expect(review.match(/className="cp-tap inline-flex items-center/g)?.length).toBe(2);
  });

  it("haftalık anketin 0–10 düğmeleri telefonda iki satıra kırılır ve 36 px'in üstünde", () => {
    const survey = rulesOf(mediaBody(read("src/styles/weekly-survey.css"), "(max-width: 480px)"));
    const grid = survey.find((r) => r.selectors.includes(".cp-survey-scale--11"));
    expect(grid?.body).toMatch(/grid-template-columns:\s*repeat\(6,/);
    expect(maxFor(survey, ".cp-survey-scale--11 button", "min-height")).toBeGreaterThanOrEqual(36);
    expect(maxFor(survey, ".cp-survey-close", "min-height")).toBeGreaterThanOrEqual(36);
  });
});

describe("podcast oynatıcısı bir oturum ekranı", () => {
  it("hazırlığın podcast sayfası oturum kabuğunda: üst çubuk ve alt menü yok", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/podcast/page.tsx");
    expect(page).toMatch(/<ParitySorShell \{\.\.\.shell\} chrome="session">\s*\n\s*<PrepPodcastSession/);
    // Kabukta oturum kipi alt menüyü çizmez.
    const shell = read("src/components/parity/sor-shell.tsx");
    // 13 Kasım 2026 (kabuk): oturum kipinde (ders, test, podcast, fiyat) üst çubuk ve alt menü yok.
    expect(shell).toContain('const showTopBar = chrome !== "session";');
    expect(shell).toContain('{showTopBar ? <nav className="cp-sor-bottomnav"');
  });

  it("yoldaki podcast düğümü de oturum kabuğunda", () => {
    expect(read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx")).toContain('chrome="session"');
  });

  it("kontrol çubuğu ekranın altına yapışık, çentik payıyla; gömülü oynatıcı yapışmaz", () => {
    const rules = rulesOf(read("src/styles/parity-shell.css"));
    const dock = rules.find((r) => r.selectors.includes(".cp-pod:not(.cp-pod--embed) > .cp-pod-dock"));
    expect(dock, "yapışık kontrol çubuğu kuralı").toBeTruthy();
    expect(dock!.body).toMatch(/position:\s*sticky;/);
    expect(dock!.body).toMatch(/bottom:\s*0;/);
    expect(dock!.body).toMatch(/padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/);
    expect(dock!.body).toMatch(/background:/);
    // Çubuk dökümün altındaki akışta durur: sabit (fixed) değil, son satır örtülmez.
    expect(dock!.body).not.toMatch(/position:\s*fixed/);
    expect(read("src/components/parity/exam-podcast-player.tsx")).toContain('<footer className="cp-pod-dock">');
  });

  it("hata ekranında çıkış var (oturum kabuğunda Geri yok)", () => {
    const session = read("src/components/parity/prep-podcast-session.tsx");
    expect(session).toMatch(/<Link href=\{home\} className="cp-pod-leave">/);
  });
});

describe("ders ve test ekranlarındaki ek bulgular", () => {
  const ruleFor = (file: string, selector: string) =>
    rulesOf(read(file)).filter((r) => r.selectors.includes(selector));

  it("kaynak çekmecesinin Kapat düğmesi 36 px kutu, 44 px dokunma alanı", () => {
    expect(read("src/components/parity/source-page-drawer.tsx")).toMatch(
      /className="als-source-drawer-close" aria-label="Kapat"/,
    );
    const own = ruleFor("src/styles/exam-lesson-steps.css", ".als-source-drawer-close");
    expect(own.some((r) => /position:\s*relative/.test(r.body))).toBe(true);
    expect(maxFor(own, ".als-source-drawer-close", "min-height")).toBeGreaterThanOrEqual(36);
    expect(maxFor(own, ".als-source-drawer-close", "min-width")).toBeGreaterThanOrEqual(36);
    const after = ruleFor("src/styles/exam-lesson-steps.css", ".als-source-drawer-close::after");
    expect(maxFor(after, ".als-source-drawer-close::after", "width")).toBeGreaterThanOrEqual(44);
    expect(maxFor(after, ".als-source-drawer-close::after", "height")).toBeGreaterThanOrEqual(44);
  });

  it("yapışkan test çubuğu kaydırma payı bırakır; şık seçimi ve kilit görünür alana kaydırır", () => {
    const pad = ruleFor("src/styles/parity-shell.css", ":root:has(.cp-quiz-action-bar)");
    expect(pad[0]?.body).toMatch(/scroll-padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/);
    const play = read("src/components/parity/exam-quiz-play.tsx");
    expect(play).toContain("<div ref={twoSlotRef}>{twoOption(index)}</div>");
    expect(play).toContain('<div ref={optionsRef} className="space-y-3"');
    expect(play).toMatch(/scrollIntoView\(\{ block: "nearest"/);
  });

  it("araç sürgüleri 40 px dokunma yüksekliğinde, tutamaç 24 px (iz ince)", () => {
    const rules = rulesOf(read("src/styles/parity-shell.css"));
    const at = (selector: string, prop: string) => maxFor(rules, selector, prop);
    expect(at('.tool-field input[type="range"]', "height")).toBeGreaterThanOrEqual(36);
    expect(at('.tool-field input[type="range"]::-webkit-slider-runnable-track', "height")).toBeLessThanOrEqual(8);
    expect(at('.tool-field input[type="range"]::-webkit-slider-thumb', "width")).toBeGreaterThanOrEqual(24);
    expect(at('.tool-field input[type="range"]::-moz-range-thumb', "height")).toBeGreaterThanOrEqual(24);
    for (const tool of ["birim-cember.tsx", "parabol-kesif.tsx"]) {
      expect(read(`src/components/lab/tools/${tool}`), tool).toMatch(/<ToolField[\s\S]*type="range"/);
    }
  });

  it("kurulum sihirbazı: konu düzenleme düğmeleri ve ay okları telefonda 44 px", () => {
    const css = read("src/styles/exam-create-wizard.css");
    const start = css.indexOf("/*\n  Dokunma alanı (6 Kasım 2026 telefon denetimi, 375×812)");
    expect(start).toBeGreaterThan(-1);
    const mobile = rulesOf(mediaBody(css.slice(start), "(max-width: 480px)"));
    for (const selector of [".apw-topic-edit", ".apw-cal-head button"]) {
      expect(maxFor(mobile, selector, "min-height"), selector).toBeGreaterThanOrEqual(44);
      expect(maxFor(mobile, selector, "min-width"), selector).toBeGreaterThanOrEqual(44);
    }
    expect(maxFor(mobile, ".apw-topic-add-btn", "min-height")).toBeGreaterThanOrEqual(44);
    // Düğmeler kendi satırında ve kırılabilir: 375 px'te taşmaz.
    const actions = rulesOf(css).find((r) => r.selectors.includes(".apw-topic-actions") && /flex-wrap:\s*wrap/.test(r.body));
    expect(actions).toBeTruthy();
  });

  it("soru çözücünün büyük fotoğrafında görünür ×: 44×44, Esc ve odak ortak kancayla", () => {
    const solver = read("src/components/learning/question-solver.tsx");
    expect(solver).toMatch(
      /useDismiss\(lightbox, \(\) => setLightbox\(false\), \{ initialFocus: lightboxClose \}\)/,
    );
    expect(solver).toMatch(/ref=\{lightboxClose\}[\s\S]{0,120}className="cp-solver-lightbox-close"\s*\n\s*aria-label="Kapat"/);
    const close = rulesOf(read("src/styles/question-solver.css")).filter((r) =>
      r.selectors.includes(".cp-solver-lightbox-close"),
    );
    expect(maxFor(close, ".cp-solver-lightbox-close", "width")).toBeGreaterThanOrEqual(44);
    expect(maxFor(close, ".cp-solver-lightbox-close", "height")).toBeGreaterThanOrEqual(44);
  });

  it("sonuç ekranında yıldız rozeti telefonda × düğmesinin altına iner", () => {
    const media = rulesOf(mediaBody(read("src/styles/stars.css"), "(max-width: 767px)"));
    const moved = media.find((r) => r.selectors.includes(":root:has(.cp-back-pill) .cp-stars-earned"));
    expect(moved?.body).toMatch(/top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 4\.25rem\)/);
  });
});

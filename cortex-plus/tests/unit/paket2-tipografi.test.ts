/**
 * Paket 2 — tipografi, kontrast ve dokunma alanı (6 Kasım 2026, ürün sahibi):
 * "Öğretim geri bildirimleri, kart/soru açıklamaları ve yardımcı metinlerde 11–12px olan küçük
 * yazıları en az 14px–15px ve yüksek kontrastlı hale getir."
 *
 * Kurallar: açıklama, ipucu, not, boş durum metni ≥ 14 px; etiket, rozet, üst yazı ≥ 12 px
 * (eşaralıklı tokenlar ≥ 11 px); başlık satır aralığı ≥ 1.15; yalnız simgeli kapat/geri/gönder
 * düğmesinin tıklanan alanı ≥ 44×44 px; soluk metin tokenı koyu yüzeylerde ≥ 4,5:1.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const css = (file: string) => read(`src/styles/${file}`);

type Rule = { selectors: string[]; body: string; media: string | null };

/** Virgülü yalnız en üst düzeyde böler (`:is(a, b) .c` tek seçicidir). */
function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
}

function rules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index);
    const opens = [...before.matchAll(/@media[^{]*\{/g)];
    // Açık kalan bir @media bloğu var mı (kaba ama bu dosyalarda yeterli: iç içe @media yok).
    let media: string | null = null;
    const last = opens.at(-1);
    if (last) {
      const tail = before.slice(last.index! + last[0].length);
      const depth = (tail.match(/\{/g)?.length ?? 0) - (tail.match(/\}/g)?.length ?? 0);
      if (depth >= 0) media = last[0];
    }
    out.push({ selectors: splitSelectors(m[1]), body: m[2], media });
  }
  return out;
}

const toPx = (value: string): number | null => {
  const m = value.trim().match(/^([\d.]+)(rem|px)\b/);
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
};

const decl = (body: string, prop: string): string | null => {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};

function matching(file: string, selector: string): Rule[] {
  return rules(css(file)).filter((r) => r.selectors.includes(selector));
}

function fontSizes(file: string, selector: string): number[] {
  return matching(file, selector)
    .map((r) => decl(r.body, "font-size"))
    .filter((v): v is string => Boolean(v))
    .map((v) => toPx(v))
    .filter((v): v is number => v !== null);
}

/** WCAG göreli parlaklık ve kontrast. */
function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 0xff, n & 0xff].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function tokenBlock(selector: string): string {
  const source = css("tokens.css");
  const start = source.indexOf(`${selector} {`);
  return source.slice(start, source.indexOf("}", start));
}
const tokenValue = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? "";

describe("yardımcı metin ve öğretim geri bildirimi ≥ 14 px", () => {
  const BODY: Array<[string, string]> = [
    ["parity-shell.css", ".cp-hub-tool-hint"],
    ["parity-shell.css", ".tool-field-hint"],
    ["parity-shell.css", ".cp-upload-hint"],
    ["parity-shell.css", ".cp-limit-row p"],
    ["parity-shell.css", ".cp-exam-day-block header p"],
    ["parity-shell.css", ".cp-rating-lead"],
    ["parity-shell.css", ".cp-rating-error"],
    ["parity-shell.css", ".cp-quiz-multi-hint"],
    ["parity-shell.css", ".cp-exam-multi-hint"],
    ["parity-shell.css", ".cp-msg-action-hint"],
    ["parity-shell.css", ".cp-more-empty"],
    ["parity-shell.css", ".cp-exam-history-empty"],
    ["parity-shell.css", ".cp-docs-note"],
    ["parity-shell.css", ".cp-tutor-check-hint"],
    ["parity-shell.css", ".cp-written-review li p"],
    ["exam-lesson-steps.css", ".als-hint"],
    ["exam-lesson-steps.css", ".als-source-detail"],
    ["exam-lesson-steps.css", ".als-reference-table-caption"],
    ["exam-lesson-steps.css", ".als-reference-table-hint"],
    ["exam-lesson-steps.css", ".als-diagram figcaption"],
    ["exam-lesson-steps.css", ".als-formula-card-note"],
    ["node-generation-progress.css", ".apg-warmup-hint"],
    ["upgrade-gate.css", ".ug-why"],
    ["paper-exam.css", ".cp-paper-hint"],
    ["oral-exam-chrome.css", ".cp-oral-note"],
    ["video-lesson.css", ".cp-video-note"],
    ["learning-studio.css", ".ls-setup-note"],
  ];

  it.each(BODY)("%s %s", (file, selector) => {
    const sizes = fontSizes(file, selector);
    expect(sizes.length, `${selector} kuralı bulunamadı`).toBeGreaterThan(0);
    for (const px of sizes) expect(px, selector).toBeGreaterThanOrEqual(14);
  });

  it("araç alanı ipucu sabit #6a6a6a yerine soluk metin tokenını kullanır", () => {
    const [rule] = matching("parity-shell.css", ".tool-field-hint");
    expect(decl(rule.body, "color")).toBe("var(--cp-muted)");
  });

  it("sınav incelemesinde açıklama, puan notu ve ilk hatalı satır cümlesi küçük yazı değil", () => {
    const src = read("src/components/parity/exam-question-review-client.tsx");
    expect(src).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(src).toContain('<p className="basis-full pl-12 text-sm font-semibold leading-snug text-rose-300">{sentence}</p>');
    expect(src).toContain('<p className="text-sm text-[var(--cp-muted)]">{review.feedback.note}</p>');
    expect(src).toMatch(/<p className="text-\[0\.9375rem\] text-\[var\(--c-text-muted\)\] leading-relaxed">\s*\{explanation\}/);
  });

  it("sohbetin kota/stil satırı 14 px", () => {
    const src = read("src/components/chat/chat-panel.tsx");
    expect(src).not.toContain('text-center text-[11px] text-[var(--cs-muted)]');
  });
});

describe("etiket, rozet ve üst yazı ≥ 12 px", () => {
  const LABELS: Array<[string, string]> = [
    ["parity-shell.css", ".cp-sor-bottomnav-link"],
    ["landing.css", ".lp-eyebrow"],
    ["landing.css", ".lp-note-pdf"],
    ["landing.css", ".lp-note-tip span"],
    ["cinematic-home.css", ":is(.cinematic-home, .cinematic-marketing) .mk-phone-sub"],
    ["cinematic-home.css", ":is(.cinematic-home, .cinematic-marketing) .mk-eyebrow"],
  ];

  it.each(LABELS)("%s %s", (file, selector) => {
    const sizes = fontSizes(file, selector);
    expect(sizes.length, `${selector} kuralı bulunamadı`).toBeGreaterThan(0);
    for (const px of sizes) expect(px, selector).toBeGreaterThanOrEqual(12);
  });

  // Simge içi rakam/harf, SVG kullanıcı birimiyle ölçeklenen grafik yazısı, sabit 0.7rem satırlı
  // ısı haritası ve süs filigranı: metin değil, kutuya göre çizilir.
  const GLYPHS = [".pt-z", ".cp-activity-weekdays", ".cp-radar-label", ".cp-forecast-", ".cp-path-letters", ".cp-pod-skip em", ".cp-video-center button span", ".ls-paper::after", ".mk-dash-ring span", ".mk-hero-ui-ring span"];
  const FILES = [
    "parity-shell.css", "exam-lesson-steps.css", "node-generation-progress.css", "cinematic-home.css", "landing.css",
    "learning-studio.css", "oral-exam-chrome.css", "parity-sor.css", "paper-exam.css", "in-app-browser-banner.css",
    "weekly-survey.css", "upgrade-gate.css", "video-lesson.css", "plus-month.css", "demo.css",
  ];

  it.each(FILES)("%s içinde 12 px'ten küçük yazı yok (simge içi yazılar hariç)", (file) => {
    const offenders: string[] = [];
    for (const rule of rules(css(file))) {
      const joined = rule.selectors.join(", ");
      if (GLYPHS.some((g) => joined.includes(g))) continue;
      const size = decl(rule.body, "font-size");
      const px = size ? toPx(size) : null;
      if (px !== null && px < 12) offenders.push(`${joined} → ${px}px`);
    }
    expect(offenders).toEqual([]);
  });

  it("bileşenlerdeki 9–11 px sınıfları kalktı", () => {
    for (const path of [
      "src/components/documents/topic-map-editor.tsx",
      "src/app/resmi/page.tsx",
      "src/components/student/learning-time-card.tsx",
      "src/components/parity/exam-question-review-client.tsx",
    ]) {
      expect(read(path), path).not.toMatch(/text-\[(9|10|11)px\]/);
    }
  });
});

describe("tokenlar", () => {
  const root = tokenBlock(":root");

  const sizeOf = (token: string) => toPx(tokenValue(root, token).split(/\s+/)[1] ?? "") ?? 0;
  const lineHeightOf = (token: string) => Number(tokenValue(root, token).match(/\/\s*([\d.]+)/)?.[1] ?? 0);

  it("label-11 en az 12 px, mono-xs en az 11 px", () => {
    expect(sizeOf("--t-label-11")).toBeGreaterThanOrEqual(12);
    expect(sizeOf("--t-mono-xs")).toBeGreaterThanOrEqual(11);
  });

  it("başlık satır aralığı ≥ 1.15 (İ, Ş, Ğ üst satıra değmesin)", () => {
    expect(lineHeightOf("--t-heading-xl")).toBeGreaterThanOrEqual(1.15);
    expect(lineHeightOf("--t-heading-s")).toBeGreaterThanOrEqual(1.15);
  });

  it("video alt yazısı ve ders başlığı satır aralığı", () => {
    const caption = matching("video-lesson.css", ".cp-video-caption").map((r) => Number(decl(r.body, "line-height") ?? NaN)).filter(Number.isFinite);
    expect(Math.min(...caption)).toBeGreaterThanOrEqual(1.4);
    const heading = matching("exam-lesson-steps.css", ".als-heading").map((r) => Number.parseFloat(decl(r.body, "line-height") ?? "")).filter(Number.isFinite);
    expect(Math.min(...heading)).toBeGreaterThanOrEqual(1.3);
  });

  it("soluk metin tokenı koyu yüzeylerde AA (4,5:1)", () => {
    const dark = tokenBlock(".dark");
    for (const token of ["--c-text-muted", "--c-text-subtle"]) {
      const fg = tokenValue(dark, token);
      expect(fg, token).toMatch(/^#[0-9a-f]{3,6}$/i);
      for (const bg of ["#0d0d0d", "#141414", "#1f1f1f"]) {
        expect(contrast(fg, bg), `${token} ${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(tokenValue(root, "--c-text-muted"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Eski sabit renk koyu yüzeyde kalıyordu — kural neden token kullanıyor.
    expect(contrast("#6a6a6a", "#141414")).toBeLessThan(4.5);
  });
});

describe("yalnız simgeli düğmelerde dokunma alanı ≥ 44 px", () => {
  const TARGETS: Array<[string, string]> = [
    ["parity-shell.css", ".cp-exam-how-head button"],
    ["parity-shell.css", ".cp-hub-close"],
    ["parity-shell.css", ".cp-exam-menu-x"],
    ["parity-shell.css", ".cp-send"],
    ["parity-shell.css", ".cp-sor-mic"],
    ["parity-shell.css", ".cp-topic-pick-x"],
    ["parity-shell.css", ".cp-pod-back"],
    ["parity-shell.css", ".cp-ptable-close"],
    ["parity-shell.css", ".cp-jr-info-close"],
    ["parity-shell.css", ".cp-path-jump"],
    ["in-app-browser-banner.css", ".cp-inapp-banner__close"],
    ["paper-exam.css", ".cp-paper-qr-close"],
    ["upgrade-gate.css", ".ug-aside-close"],
    ["weekly-survey.css", ".cp-survey-close"],
    ["parity-sor.css", ".cs-sor-send"],
    ["parity-sor.css", ".cs-sor-attach"],
    ["oral-exam-chrome.css", ".cp-oral-x"],
    ["node-generation-progress.css", ".apg-close"],
    ["node-generation-progress.css", ".apg-toast button"],
  ];

  const atLeast44 = (body: string, a: string, b: string) => {
    const x = toPx(decl(body, a) ?? "");
    const y = toPx(decl(body, b) ?? "");
    return x !== null && y !== null && x >= 44 && y >= 44;
  };

  it.each(TARGETS)("%s %s", (file, selector) => {
    const own = matching(file, selector).filter((r) => !r.media);
    const direct = own.some((r) => atLeast44(r.body, "min-width", "min-height") || atLeast44(r.body, "width", "height"));
    if (direct) return;
    const after = matching(file, `${selector}::after`);
    const hit = after.find((r) => atLeast44(r.body, "width", "height") && decl(r.body, "position") === "absolute");
    expect(hit, `${selector}: ne 44 px boyut ne de ::after dokunma alanı var`).toBeTruthy();
    // ::after'ın kutusu düğmenin kendisi olmalı: düğme konumlandırılmış.
    const positioned = own.some((r) => /^(relative|absolute|sticky|fixed)$/.test(decl(r.body, "position") ?? ""));
    expect(positioned, `${selector} konumlandırılmamış; ::after başka bir ataya göre yerleşir`).toBe(true);
  });

  it("sıradaki adıma atla düğmesi telefonda ekranın içinde kalır", () => {
    const mobile = rules(css("parity-shell.css")).filter(
      (r) => r.selectors.includes(".cp-path-jump") && r.media && /max-width:\s*480px/.test(r.media),
    );
    expect(mobile.some((r) => decl(r.body, "margin-right") === "0")).toBe(true);
  });

  it("üretim bildirimi telefonda alt menünün üstünde", () => {
    const toast = rules(css("node-generation-progress.css")).find(
      (r) => r.selectors.some((s) => s.endsWith(".apg-toast") && s.includes(".cp-sor-bottomnav")) && r.media,
    );
    expect(toast).toBeTruthy();
    expect(decl(toast!.body, "bottom")).toContain("4.6rem");
    expect(Number(decl(toast!.body, "z-index"))).toBeGreaterThan(40);
  });
});

// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkipLink } from "@/components/layout/skip-link";
import { MAIN_CONTENT_ID } from "@/lib/ui/main-content";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
/** Yorumlar çıkarılmış kaynak: yorumda geçen "<main>" sözcüğü öğe sayılmaz. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full.replace(/\\/g, "/"));
  }
  return out;
}

afterEach(cleanup);

/* Faz 3 (20 Kasım 2026): "İçeriğe atla", tek <main>, etiketli alanlar, her temada odak çerçevesi, 44 px simge düğmesi. */

describe("İçeriğe atla", () => {
  it("kökte, sayfanın ilk öğesi; ana içeriğin kimliği tek sabitten", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("<SkipLink />");
    expect(layout.indexOf("<SkipLink />")).toBeLessThan(layout.indexOf("<Providers>"));
    expect(MAIN_CONTENT_ID).toBe("icerik");
  });

  it("basınca odak ana içeriğe geçer (Tab sırasına girmeden)", () => {
    render(
      <>
        <SkipLink />
        <nav>
          <a href="/x">Menü</a>
        </nav>
        <main id={MAIN_CONTENT_ID}>
          <p>İçerik</p>
        </main>
      </>,
    );
    const link = screen.getByRole("link", { name: "İçeriğe atla" });
    expect(link.getAttribute("href")).toBe("#icerik");
    fireEvent.click(link);
    const main = screen.getByRole("main");
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute("tabindex")).toBe("-1");
  });

  it("kimliği olmayan tek <main>'li sayfada da çalışır (hata ekranı)", () => {
    render(
      <>
        <SkipLink />
        <main>
          <p>Bulunamadı</p>
        </main>
      </>,
    );
    fireEvent.click(screen.getByRole("link", { name: "İçeriğe atla" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("yalnız klavye odağında görünür; atlanan kap çerçevelenmez", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.cx-skip-link \{[^}]*transform: translateY\(calc\(-100% - 16px\)\)/);
    expect(css).toMatch(/\.cx-skip-link:focus,\n\.cx-skip-link:focus-visible \{\n\s*transform: none;/);
    expect(css).toMatch(/#icerik:focus \{\n\s*outline: none;/);
  });
});

describe("tek <main>", () => {
  it("öğrenci ve pazarlama kabuğunun <main>'i ana içerik kimliğini taşır", () => {
    expect(read("src/components/parity/sor-shell.tsx")).toContain('<main id={MAIN_CONTENT_ID} className={cn("cp-sor-main"');
    expect(read("src/components/parity/marketing.tsx")).toContain('<main id={MAIN_CONTENT_ID} className="min-w-0 flex-1">');
  });

  it("<main> yalnız kabuklarda ve kabuksuz tek sayfalarda; kabuğun içindeki bileşen <main> yazmaz", () => {
    // Kendi <main>'ini taşıması gereken yerler: kabuklar ve kabuk kullanmayan tam sayfalar.
    const OWNERS = new Set([
      "src/components/parity/sor-shell.tsx",
      "src/components/parity/marketing.tsx",
      "src/components/layout/signup-premium-shell.tsx",
      "src/components/billing/veli/parent-pay-shell.tsx",
      "src/components/level-check/guest-quick-scan.tsx",
      "src/components/brand/status-screen.tsx",
      "src/app/admin/layout.tsx",
      "src/app/duello/[code]/page.tsx",
      "src/app/global-error.tsx",
      "src/app/tasarim/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/loading.tsx",
      "src/app/deneme-sinavlari/[prepId]/deneme/[examId]/loading.tsx",
      // Hata dalı kabuksuz (misafir de görür); başarı dalı kabuğun içinde <article>.
      "src/app/hazirlik-davet/[token]/page.tsx",
    ]);
    const files = [...walk("src/components"), ...walk("src/app")].filter(
      (file) => !file.startsWith("src/app/e2e/") && !file.startsWith("src/app/(dev)/"),
    );
    const withMain = files.filter((file) => /<main\b/.test(code(file)));
    expect(withMain.filter((file) => !OWNERS.has(file))).toEqual([]);
  });

  it("kabuk içinde çizilen sonuç ve tekrar ekranları <div>", () => {
    for (const file of [
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx",
      "src/components/learning/review-deck-session.tsx",
      "src/components/parity/prep-review-session.tsx",
    ]) {
      expect(code(file), file).not.toMatch(/<main\b/);
    }
    const invite = read("src/app/hazirlik-davet/[token]/page.tsx");
    // Kabuklu dalda <main> yok.
    expect(invite.slice(invite.indexOf("<ParitySorShell"))).not.toMatch(/<main\b/);
  });

  it("kabuksuz sayfaların <main>'i de ana içerik kimliğini taşır (marka klasörü hariç: dokunulmaz)", () => {
    for (const file of [
      "src/components/layout/signup-premium-shell.tsx",
      "src/components/billing/veli/parent-pay-shell.tsx",
      "src/components/level-check/guest-quick-scan.tsx",
      "src/app/admin/layout.tsx",
      "src/app/duello/[code]/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/loading.tsx",
      "src/app/deneme-sinavlari/[prepId]/deneme/[examId]/loading.tsx",
      "src/app/hazirlik-davet/[token]/page.tsx",
    ]) {
      const source = read(file);
      const mains = source.match(/<main\b[^>]*>/g) ?? [];
      expect(mains.length, file).toBeGreaterThan(0);
      for (const tag of mains) expect(tag, file).toContain("id={MAIN_CONTENT_ID}");
    }
  });
});

describe("etiketli alanlar", () => {
  it("yazılı deneme cevap alanları hangi sorunun cevabı olduğunu söyler", () => {
    const runner = read("src/components/parity/exam-runner.tsx");
    expect(runner).toContain("aria-label={`Soru ${index + 1} için sayısal cevabın`}");
    expect(runner).toContain("aria-label={`Soru ${index + 1} için cevabın`}");
  });

  it("uyarlamalı oturum, konu haritası düzenleyicisi ve sözlü stüdyonun mikrofonu adlı", () => {
    expect(read("src/components/parity/adaptive-study-session.tsx")).toContain('aria-label="Sorunun cevabı"');
    const editor = read("src/components/documents/topic-map-editor.tsx");
    expect(editor).toContain('aria-label="Konu adı"');
    expect(editor).toContain('aria-label={`${topic.title || "Konu"}: öğrenme hedefi`}');
    expect(editor).toContain('aria-label={`${topic.title || "Konu"}: kendi notun`}');
    expect(editor).toContain("aria-label={`Konuyu sil: ${topic.title}`}");
    const oral = read("src/components/learning/studio/oral-studio.tsx");
    expect(oral).toMatch(/className=\{cn\("ls-mic-orb"[\s\S]{0,300}aria-label="Mikrofonla cevapla"/);
  });
});

describe("odak çerçevesi", () => {
  it("açık temada da: kök kural `.dark` önekli değil, aynı özgüllükte", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/:root :focus-visible \{\n\s*outline: 2px solid var\(--c-focus\);\n\s*outline-offset: 2px;/);
    expect(css).not.toMatch(/^\.dark :focus-visible \{/m);
  });

  it("çerçevesi kaldırılan yazma alanı ve arama kutularında halka kutunun kendisine çizilir", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(
      ":root :is(.cp-sor-composer-box, .cp-exam-search, .cp-search, .cp-exam-history-search):has(:is(input, textarea):focus-visible)",
    );
    expect(css).toContain(":is(.cinematic-home, .cinematic-marketing) .mk-prompt-bar:focus-within");
    const filter = read("src/styles/list-filter.css");
    expect(filter).toMatch(/\.cx-list-search:focus-within \{\n\s*outline: 2px solid var\(--cx-focus\);/);
  });

  it("açık ve koyu temada odak rengi tanımlı", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens.match(/--cx-focus: #[0-9a-f]{6};/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(tokens).toContain("--c-focus: var(--cx-focus);");
  });
});

describe("telefonda simge düğmeleri", () => {
  it("44×44 px dokunma alanı (görünen kutu aynı, yana taşmaz)", () => {
    const css = read("src/styles/mobile-tap-targets.css");
    const block = css.slice(css.indexOf("@media (max-width: 767px)"));
    for (const selector of [".cp-prep-icon::after", ".cp-video-speed::after", ".cp-video-icon::after", ".cp-cal-month button::after"]) {
      expect(block).toContain(`:root ${selector}`);
    }
    expect(block).toMatch(/width: max\(100%, 44px\);\n\s*height: max\(100%, 44px\);/);
  });

  it("yeni süzgeç, arama ve onay penceresi düğmeleri telefonda 44 px", () => {
    const filter = read("src/styles/list-filter.css");
    const mobile = filter.slice(filter.indexOf("@media (max-width: 767px)"));
    expect(mobile).toMatch(/\.cx-list-chip,\n\s*\.cx-list-search-clear \{\n\s*min-height: var\(--cx-tap-min\);/);
    expect(read("src/styles/confirm-dialog.css")).toMatch(/\.cx-confirm-close \{\n\s*width: var\(--cx-tap-min\);\n\s*height: var\(--cx-tap-min\);/);
    expect(read("src/styles/confirm-dialog.css")).toContain("min-height: var(--cx-control-m);");
  });

  it("390 px'te taşmasın: süzgeç çubuğu sarar, arama alanı daralabilir, pencere ekrandan geniş olamaz", () => {
    const filter = read("src/styles/list-filter.css");
    expect(filter).toMatch(/\.cx-list-chips \{\n\s*display: flex;\n\s*flex-wrap: wrap;/);
    expect(filter).toMatch(/\.cx-list-search input \{\n\s*flex: 1;\n\s*min-width: 0;/);
    expect(read("src/styles/confirm-dialog.css")).toContain("width: min(480px, calc(100vw - 2 * var(--cx-gutter)));");
  });
});

describe("renkler token'dan", () => {
  it("yeni stil dosyalarında ham renk yok (yalnız --cx-* değişkenleri)", () => {
    for (const file of ["src/styles/list-filter.css", "src/styles/confirm-dialog.css"]) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});

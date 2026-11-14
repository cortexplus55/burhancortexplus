// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Faz 11A / 11B: ayarlar + /davet (`ui.v2.ayarlar`), Kütüphane iç ekranları (`ui.v2.kutuphane`), laboratuvarlar ve hesap
  araçları (`ui.v2.araclar2`). Yalnız sarmalayıcı + CSS: ayarların etkisi, listeler, silme onayları, çizim motoru ve
  matematik aynen.
*/

const read = (path: string) => readFileSync(path, "utf8");
const uncomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("sarmalayıcılar", () => {
  it("düzenler bayrağı okur; kapalıyken UiScope çocukları olduğu gibi döndürür", () => {
    const routes: [string, string, string][] = [
      ["ayarlar", "ayarlar", "ui-v2-ayarlar.css"],
      ["davet", "ayarlar", "ui-v2-ayarlar.css"],
      ["dokumanlar", "kutuphane", "ui-v2-kutuphane.css"],
      ["yanlislarim", "kutuphane", "ui-v2-kutuphane.css"],
      ["siniflar", "kutuphane", "ui-v2-kutuphane.css"],
      ["araclar/[id]", "araclar2", "ui-v2-araclar2.css"],
    ];
    for (const [route, key, css] of routes) {
      const layout = read(`src/app/${route}/layout.tsx`);
      expect(layout, route).toContain(`(await uiV2("${key}")) ? ["${key}"] : []`);
      expect(layout, route).toContain(`@/styles/${css}`);
    }
  });

  it("Geçmiş konuşmalar: sarmalayıcı sayfanın içinde, loading.tsx'e dokunulmadı (Suspense kuralı)", () => {
    const page = read("src/app/sohbetler/page.tsx");
    expect(page).toContain('uiV2("kutuphane", user.id)');
    expect(page).toContain('<UiScope keys={kutuphane ? ["kutuphane"] : []}>');
    expect(() => read("src/app/sohbetler/layout.tsx")).toThrow();
    expect(read("src/app/sohbetler/loading.tsx")).not.toContain("uiV2");
  });
});

describe("kapsam ve kurallar", () => {
  for (const [key, file] of [
    ["ayarlar", "src/styles/ui-v2-ayarlar.css"],
    ["kutuphane", "src/styles/ui-v2-kutuphane.css"],
    ["araclar2", "src/styles/ui-v2-araclar2.css"],
  ] as const) {
    it(`${key}: seçiciler kapsamlı, ham renk yok, odak halkası var`, () => {
      const css = uncomment(read(file));
      for (const rule of css.match(/[^{}]+\{/g) ?? []) {
        const selector = rule.replace("{", "").trim();
        if (!selector || selector.startsWith("@")) continue;
        for (const part of selector.split(",")) expect(part.trim(), part).toMatch(new RegExp(`^\\[data-ui~="${key}"\\]`));
      }
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css).not.toMatch(/outline:\s*none/);
      expect(css).toMatch(/:focus-visible[\s\S]*var\(--cx-focus\)/);
    });
  }

  it("ayarlar: gruplar kenarsız bg-1 köşe 24, satırlar arası çizgi yok, yıkıcı grup tehlike tonunda", () => {
    const css = uncomment(read("src/styles/ui-v2-ayarlar.css"));
    expect(css).toMatch(/\.cp-set-group-body \{[^}]*border: 0;[^}]*var\(--cx-radius-l\)[^}]*var\(--cx-bg-1\)/);
    expect(css).toMatch(/\.cp-set-rows li \+ li \{\s*border-top: 0;/);
    expect(css).toMatch(/\.cp-set-group--danger \.cp-set-group-title \{\s*color: var\(--cx-danger\)/);
    // Yıkıcı grup sayfada var ve bugünkü gibi en sonda.
    const page = read("src/app/ayarlar/page.tsx");
    expect(page).toContain('tone="danger"');
  });

  it("periyodik tablo: hücre ≥ 40 px, kendi kabında kayar, hücre yazısı ≥ 11 px; hareket azaltmada büyüme yok", () => {
    const css = uncomment(read("src/styles/ui-v2-araclar2.css"));
    expect(css).toMatch(/repeat\(18, minmax\(40px, 1fr\)\)/);
    expect(css).toMatch(/min-width: 771px/);
    expect(css).toMatch(/\.pt-z \{\s*font-size: 11px;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*transform: none/);
    // Kap bugün de kendi içinde kayıyor (sayfa taşmaz).
    expect(read("src/styles/parity-shell.css")).toMatch(/\.pt-wrap \{\s*overflow-x: auto;/);
  });
});

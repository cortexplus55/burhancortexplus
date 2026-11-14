import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* Faz 6A: öğretmen katmanı bayrağa bağlı; kapalıyken sohbet bugünkü gibi. */

describe("ui.v2.ogretmen", () => {
  const page = readFileSync("src/app/ogretmen/page.tsx", "utf8");
  const chat = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
  it("sayfa bayrağı okur, kapalıyken sarmalayıcı yok, sohbete followUser verir", () => {
    expect(page).toContain('uiV2("ogretmen", user.id)');
    expect(page).toMatch(/uiOgretmen \? \(\s*<div className="cx-ui-scope" data-ui="ogretmen">/);
    expect(page).toContain("followUser={uiOgretmen}");
  });
  it("followUser kapalıyken liste bugünkü gibi canlı; açıkken tek duyuru ve 'Yeni mesaja git'", () => {
    expect(chat).toContain('aria-live={followUser ? "off" : "polite"}');
    expect(chat).toContain("if (followUser && !grew) return;");
    expect(chat).toContain('aria-label="Yeni mesaja git"');
    expect(chat).toContain('setDoneNote("Öğretmen yanıtladı")');
  });
  it("katman yalnız [data-ui~=ogretmen] altında; ham renk ve outline:none yok", () => {
    const css = readFileSync("src/styles/ui-v2-ogretmen.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.match(/[^{}]+\{/g) ?? []) {
      const selector = rule.replace("{", "").trim();
      if (!selector || selector.startsWith("@") || selector === ".cx-ui-scope") continue;
      for (const part of selector.split(",")) expect(part.trim(), part).toMatch(/^\[data-ui~="ogretmen"\]/);
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/outline:\s*none/);
  });
});

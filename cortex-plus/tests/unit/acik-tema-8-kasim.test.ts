import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
  Açık tema tamamlaması (8 Kasım 2026, ürün sahibinin kararı). Bileşenlerin çoğu koyu tema için sabit koyu zemin ve
  açık yazıyla yazılmıştı; açık temada koyu zeminde koyu yazı (hazırlık yolu, takvim, yazma alanı, ruh hali seçimi)
  ya da açık zeminde açık yazı (stüdyo başlığı, seçili düğme) kalıyordu. Canlıda her sayfa açık temada tarandı.
*/
describe("açık tema", () => {
  const shell = read("src/styles/parity-shell.css");
  const studio = read("src/styles/learning-studio.css");

  it("canlı taramada koyu kalan parçalar temanın yüzeyine bağlanır", () => {
    for (const selector of [
      ".cp-path-section",
      ".cp-path-exam-day",
      ".cp-cal-date",
      ".cp-cal-day--has",
      ".cp-sor-composer-box",
      ".cp-tutor-mode-pill",
      ".cp-signal-emoji",
      ".cp-chip",
    ]) {
      const block = shell.slice(shell.indexOf("Açık tema tamamlaması"));
      expect(block, selector).toContain(selector);
    }
    expect(shell).toContain(':root:not(.dark) .cp-signal-option[aria-pressed="true"]');
    expect(shell).toContain(":root:not(.dark) .cp-sor-root.cp-sor-root--exam");
  });

  it("stüdyoların yazı değişkenleri temadan; koyu alanlar yüzeyden; seçili düğme okunur", () => {
    expect(studio).toMatch(/:root:not\(\.dark\) \.ls-studio \{\s*--ls-text: var\(--c-text\);\s*--ls-muted: var\(--c-text-muted\);/);
    expect(studio).toContain(':root:not(.dark) .ls-studio .ls-seg button[aria-pressed="true"]');
    expect(studio).toMatch(/:root:not\(\.dark\) \.ls-studio :is\(\.ls-field, \.ls-option/);
  });

  it("koyu tema değişmez: açık tema kuralları yalnız :root:not(.dark) altında", () => {
    const lightBlock = shell.slice(shell.indexOf("Açık tema tamamlaması"));
    const rules = lightBlock.split("}").filter((rule) => rule.includes("{") && !rule.trim().startsWith("/*"));
    for (const rule of rules) expect(rule.slice(rule.lastIndexOf("*/") + 2).trim()).toMatch(/^:root:not\(\.dark\)/);
  });
});

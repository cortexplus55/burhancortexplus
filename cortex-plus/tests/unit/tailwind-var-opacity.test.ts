import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/*
  Tailwind 3.4 CSS değişkenine saydamlık uygulayamıyor: "bg-[var(--x)]/20"
  sınıfı sessizce üretilmiyor. Canlıda Aktivitelerim çubukları, abonelik
  kartının yükleme örtüsü ve hesap şeridi rozeti şeffaftı (1 Ekim 2026).
  Doğrusu: "bg-[color:color-mix(in_srgb,var(--x)_20%,transparent)]".
*/
describe("Tailwind: değişken + saydamlık", () => {
  it("bg/border/text-[var(--x)]/N yazımı kullanılmıyor", () => {
    const offenders = files("src").flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("{/*") && !line.trim().startsWith("*"))
        .filter(({ line }) => /(?:bg|text|border)-\[var\(--[a-z0-9-]+\)\]\/\d+/.test(line))
        .map(({ index }) => `${file}:${index + 1}`);
    });
    expect(offenders).toEqual([]);
  });
});

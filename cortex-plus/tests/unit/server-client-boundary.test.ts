import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

/*
  "use client" dosyasından dışa aktarılan bir fonksiyon sunucu bileşeninde
  çağrılamaz. /tasarim 500 dönüyordu: "Attempted to call buttonVariants()
  from the server but buttonVariants is on the client" (1 Ekim 2026). Aynı
  çağrı boş durum bileşenindeydi; verisi olmayan öğrencinin ekranında patlardı.
*/
describe("sunucu / istemci sınırı", () => {
  it("sunucu dosyaları buttonVariants'ı istemci dosyasından almıyor", () => {
    const offenders = files("src").filter((file) => {
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(source)) return false;
      return /import\s*\{[^}]*\bbuttonVariants\b[^}]*\}\s*from\s*["']@\/components\/ui\/button["']/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});

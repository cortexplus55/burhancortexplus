import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GATE_VERSION } from "@/lib/content-pool/gate";

/*
  Kapı sürümü tek kaynaktan (5 Kasım 2026). Kokpitten "Reddet ve yeniden ürettir" ile üretilen pekiştirme soruları
  `qa.gate_version: 14` sabitiyle yazılıyordu: kapı 15'e çıkınca sorular v15 kurallarıyla doğrulandığı hâlde etiketi
  eski kaldı (canlıda 5 soru). Havuza soru yazan her yer sürümü `GATE_VERSION`'dan okur; sayı yalnız gate.ts'te.
*/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("havuz kapısının sürümü tek kaynaktan yazılır", () => {
  it("src altında gate.ts dışında sayı sabitiyle gate_version yazılmaz", () => {
    const offenders = walk("src")
      .filter((file) => !file.replace(/\\/g, "/").endsWith("src/lib/content-pool/gate.ts"))
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        const hits = text.match(/gate_version\s*:\s*\d+/g) ?? [];
        return hits.map((hit) => `${file.replace(/\\/g, "/")}: ${hit}`);
      });
    expect(offenders).toEqual([]);
  });

  it("pekiştirme satırları GATE_VERSION ile etiketlenir; sürüm en az 15", () => {
    const source = readFileSync("src/lib/content-pool/reinforce-new.ts", "utf8");
    expect(source).toContain('import { GATE_VERSION } from "@/lib/content-pool/gate"');
    expect(source).toContain("gate_version: GATE_VERSION");
    expect(GATE_VERSION).toBeGreaterThanOrEqual(15);
  });
});

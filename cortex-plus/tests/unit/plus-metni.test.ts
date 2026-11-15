/** Plus sayfası vaadinin daraltılması (15 Kasım 2026; yayına girmesi Burhan'ın "PLUS METNİ OK" onayına bağlı). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Plus sayfası metni", () => {
  it("sohbetin bütün modlarına 'uydurmaz' demez; katı modu adıyla söyler", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).not.toContain("Notunda olmayanı uydurmaz.");
    expect(cards.replace(/\s+/g, " ")).toContain(
      "«Yalnızca belgem» modunda notunda olmayanı uydurmaz; öbür modlarda genel bilgiyi ayrı etiketler. Cevaplayamadığı soruda hakkından düşmez.",
    );
  });
});

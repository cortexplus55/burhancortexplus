import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICON_3D_NAMES } from "@/components/ui/icon-3d";
import { STUDY_TOOLS } from "@/lib/learning/study-tools";

/*
  Bize özgü 3B simge seti (17 Ekim 2026, tasarım 7. adım; ürün sahibinin kararı). Astra özel
  3B çizimler kullanıyor; bizimkiler tek tarzda bir kez üretildi (256 px şeffaf webp).
*/
const DIR = "public/illustrations/3d";

describe("3B simge seti", () => {
  it("listedeki her ad için küçük bir dosya var; klasörde listede olmayan dosya yok", () => {
    for (const name of ICON_3D_NAMES) {
      const path = `${DIR}/${name}.webp`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size, path).toBeLessThan(40_000);
    }
    const files = readdirSync(DIR).map((file) => file.replace(/\.webp$/, ""));
    expect(files.sort()).toEqual([...ICON_3D_NAMES].sort());
  });

  it("Ders oluştur penceresindeki her aracın kendi görseli var", () => {
    const hub = readFileSync("src/components/parity/study-tools-hub.tsx", "utf8");
    for (const tool of STUDY_TOOLS) expect(hub, tool.id).toMatch(new RegExp(`\\b${tool.id}: "[a-z-]+",`));
    expect(hub).toContain("<Icon3D name={TOOL_ICONS[tool.id]}");
  });
});

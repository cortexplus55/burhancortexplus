import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NODE_MAX_DURATION_SECONDS } from "@/lib/learning/node/shared";
import { NODE_ROUTE_FILE, nodeRouteFiles } from "./helpers/node-sources";

/*
  Yol etkinliği hattının dosya düzeni (30 Ekim 2026). Rota ince kalır: istek ayrıştırma ve yönlendirme; türün
  üretimi ve notlandırması `src/lib/learning/node/` altında kendi modülünde. Next.js rota dosyası yalnız izinli
  adları dışa aktarabilir (yoksa derleme düşer).
*/

describe("yol etkinliği rotasının düzeni", () => {
  const route = readFileSync(NODE_ROUTE_FILE, "utf8").replace(/\r\n/g, "\n");

  it("rota yalnız Next.js'in tanıdığı adları dışa aktarır", () => {
    const exported = [...route.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["POST", "maxDuration"]);
  });

  it("rotanın süre tavanı ile modüllerin bildiği tavan aynı (bitirme sahipliği bundan bayatlar)", () => {
    expect(route).toContain("export const maxDuration = 300;");
    expect(NODE_MAX_DURATION_SECONDS).toBe(300);
  });

  it("modüller sunucuya özel", () => {
    for (const file of nodeRouteFiles().filter((item) => item !== NODE_ROUTE_FILE)) {
      expect(readFileSync(file, "utf8"), file).toContain('import "server-only";');
    }
  });
});

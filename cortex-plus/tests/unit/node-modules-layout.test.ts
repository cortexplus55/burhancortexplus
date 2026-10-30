import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NODE_MAX_DURATION_SECONDS } from "@/lib/learning/node/shared";
import { NODE_ROUTE_FILE, NODE_SESSION_FILE, nodeRouteFiles, sourceGroupFiles } from "./helpers/node-sources";

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

/*
  Oturum ekranı (30 Ekim 2026): aşama, kayıt kimlikleri ve bütün istekler tek kancada (`use-node-lifecycle.ts`).
  Çizim bileşenleri durum tutmaz ve istek atmaz; 30 Ekim'de açılış etkisi `router.refresh()` sonrası yeniden koşup
  "Tekrar incele"yi başa sarıyordu — açılışın tek yeri olsun.
*/
describe("oturum ekranının düzeni", () => {
  const files = sourceGroupFiles(NODE_SESSION_FILE);
  const hook = files.find((file) => file.endsWith("use-node-lifecycle.ts"));

  it("yaşam döngüsü tek kancada; çizim bileşenleri durum tutmaz, istek atmaz", () => {
    expect(hook).toBeTruthy();
    expect(files.length).toBeGreaterThan(5);
    for (const file of files.filter((item) => item !== hook)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect)\(/);
      expect(text, file).not.toMatch(/\b(fetch|fetchWithRetry|postJsonWithRetry)\(/);
    }
  });

  it("açılış etkisi kancada ve düğüm başına bir kez (openedForRef)", () => {
    const text = readFileSync(hook!, "utf8");
    expect(text.match(/openedForRef\.current === openKey/g)).toHaveLength(2);
    expect(text).toContain('action: "resume", lessonFormat: 3');
  });

  it("eski adresin dışa aktardıkları yerinde", async () => {
    const mod = await import("@/components/parity/exam-node-session");
    expect(typeof mod.ExamNodeSession).toBe("function");
    expect(typeof mod.resultPollDelay).toBe("function");
    expect(typeof mod.nodeGateForCode).toBe("function");
    expect(mod.SAVE_TYPING_DEBOUNCE_MS).toBe(4_000);
    expect(mod.LESSON_PODCAST_GATE.action).toBe("PODCAST_GENERATE");
    expect(mod.VOICE_MODE_GATE.action).toBe("VOICE_TURN");
    // Modül testin içinde yükleniyor (ağır istemci ağacı): tam pakette yük altında 5 sn varsayılanı aşıyordu.
  }, 30_000);
});

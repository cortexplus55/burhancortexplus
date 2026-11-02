import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("paylaşımlı ünite podcast sesi", () => {
  const route = read("src/app/api/learning/podcast/audio/route.ts");
  const cache = read("src/lib/learning/audio-cache.ts");
  const lib = read("src/lib/content-pool/shared-media.ts");
  it("Plus kapısı paylaşım kontrolünden önce kalır", () => {
    expect(route.indexOf("requireFeature(entitlements")).toBeLessThan(route.indexOf("isSharedPodcastScript("));
  });
  it("senaryo sunucuda doğrulanır ve tavan aşılırsa ücretli yola dönülür", () => {
    expect(route).toContain('sharedBudgetAllows(guard.ctx.service, "podcast")');
    expect(route).toContain("shared ? synthesizeShared(...args) : synthesizeCharged(...args)");
    expect(lib).toContain('.like("kind", "podcast:%")');
    expect(lib).toContain("lines.every(");
  });
  it("paylaşımlı ses kredi ayırmaz, maliyeti SHARED_CONTENT_MEDIA'ya yazar", () => {
    const fn = cache.slice(cache.indexOf("export async function synthesizeShared"));
    expect(fn).not.toContain("reserveCredits");
    expect(fn).toContain('usageCode: "SHARED_CONTENT_MEDIA"');
    expect(cache).toContain('actionCode: options?.usageCode ?? "TTS_SYNTHESIZE"');
  });
});

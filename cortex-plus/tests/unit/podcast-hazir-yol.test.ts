import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
  30 Ekim 2026 canlı tur: yoldaki podcast adımı önceden yazılmış hazır beklerken aynı konu "Podcast oluştur"
  sayfasından istendi; sayfa onu görmedi, 90 sn'de baştan yazdı. Artık sayfa öğrenciyi o adıma götürür; hazır
  içerik ve ücret tek yerde (düğüm açılışı).
*/

let lib: typeof import("@/lib/learning/path-podcast-ready");
let variant: (length: string) => string;

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "test-secret-for-podcast-ready");
  vi.resetModules();
  lib = await import("@/lib/learning/path-podcast-ready");
  const prefetch = await import("@/lib/learning/lesson-prefetch");
  variant = (length) => prefetch.prefetchVariant("podcast", { topicLabel: "", podcastLength: length });
});

const node = (nodeId: string, topicId: string | null, status = "ready") => ({ nodeId, kind: "podcast", status, topicId });

describe("aynı konunun hazır yol podcast'i", () => {
  it("konu iki kimliğinden biriyle eşleşir, süre aynıysa adım döner", () => {
    const picked = lib.pickReadyPathPodcast({
      topicIds: ["prep-topic-1", "doc-node-1"],
      length: "diyalog",
      nodes: [node("n-other", "doc-node-9"), node("n-1", "doc-node-1")],
      prefetch: [{ nodeId: "n-1", status: "ready", variant: variant("diyalog") }],
    });
    expect(picked).toBe("n-1");
  });

  it("süre farklıysa, yazım sürüyorsa ya da adım bittiyse hazır sayılmaz", () => {
    const base = { topicIds: ["doc-node-1"], nodes: [node("n-1", "doc-node-1")] };
    expect(lib.pickReadyPathPodcast({ ...base, length: "ozet", prefetch: [{ nodeId: "n-1", status: "ready", variant: variant("diyalog") }] })).toBeNull();
    expect(lib.pickReadyPathPodcast({ ...base, length: "diyalog", prefetch: [{ nodeId: "n-1", status: "creating", variant: variant("diyalog") }] })).toBeNull();
    expect(
      lib.pickReadyPathPodcast({
        topicIds: ["doc-node-1"],
        length: "diyalog",
        nodes: [node("n-1", "doc-node-1", "done")],
        prefetch: [{ nodeId: "n-1", status: "ready", variant: variant("diyalog") }],
      }),
    ).toBeNull();
  });

  it("sayfa ucu yalnız kontrollü istekte yönlendirir; ekran yönlendirmeyi izler", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/podcast/route.ts", "utf8");
    expect(route).toMatch(/if \(withCheck\) \{\r?\n\s+const pathNode = await readyPathPodcastNode/);
    expect(route).toContain("openNode: `/deneme-sinavlari/${prepId}/dugum/${pathNode}`");
    const page = readFileSync("src/components/parity/prep-podcast-session.tsx", "utf8");
    expect(page).toContain("router.replace(data.openNode)");
  });
});

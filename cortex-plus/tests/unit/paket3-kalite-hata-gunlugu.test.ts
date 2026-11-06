/*
  Paket 3 kalite (6 Kasım 2026): yutulan hatalar. Tamamlama sonrası yan işler (öğrenme izi, Yanlışlar Defteri,
  seri, sözlü raporu, deneme etkinliği/yeniden planlama) ölümcül değildir; ama hata sessizce yutulmaz, kararlı bir
  kodla günlüğe düşer. Başarılı yolda günlük satırı yazılmaz.
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { awaitLoggedWrite, failureCause, logNodeFailure, onNodeFailure } from "@/lib/learning/node/shared";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

afterEach(() => vi.restoreAllMocks());

describe("günlük yardımcıları", () => {
  it("awaitLoggedWrite: Supabase { error } sonucunu kodla yazar, fırlatmaz", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await awaitLoggedWrite("x_failed", { nodeId: "n1" }, Promise.resolve({ error: { message: "permission denied" } }));
    expect(spy).toHaveBeenCalledWith("x_failed", { nodeId: "n1", cause: "permission denied" });
  });

  it("awaitLoggedWrite: ağ reddini de yazar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(awaitLoggedWrite("x_failed", {}, Promise.reject(new Error("fetch failed")))).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("x_failed", { cause: "fetch failed" });
  });

  it("başarılı yazımda günlük satırı yok", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await awaitLoggedWrite("x_failed", {}, Promise.resolve({ data: [], error: null }));
    await awaitLoggedWrite("x_failed", {}, Promise.resolve(undefined));
    expect(spy).not.toHaveBeenCalled();
  });

  it("onNodeFailure yedeği döndürür ve yazar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(Promise.reject(new Error("boom")).catch(onNodeFailure("y_failed", { a: 1 }, 0))).resolves.toBe(0);
    expect(spy).toHaveBeenCalledWith("y_failed", { a: 1, cause: "boom" });
  });

  it("neden kısa ve bilinmeyen için 'unknown'", () => {
    expect(failureCause("x".repeat(10))).toBe("unknown");
    expect(failureCause(new Error("e".repeat(400))).length).toBe(160);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logNodeFailure("z", {}, null);
    expect(spy).toHaveBeenCalledWith("z", { cause: "unknown" });
  });
});

describe("kaynak bekçisi: yazım ve kredi çağrılarında sessiz yutma yok", () => {
  const WRITE_FILES = [
    "src/lib/learning/node/complete.ts",
    "src/lib/learning/node/lesson-adopt.ts",
    "src/lib/learning/node/prefetched.ts",
    "src/lib/learning/node/lesson-store.ts",
    "src/lib/learning/node/pool-start.ts",
    "src/lib/learning/node/outcome-start.ts",
  ];

  it.each(WRITE_FILES)("%s: boş catch, `.then(undefined, () => undefined)` ve `.catch(() => undefined)` yok", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/catch\s*\{/);
    expect(source).not.toContain(".then(undefined, () => undefined)");
    expect(source).not.toContain(".catch(() => undefined)");
  });

  it("complete.ts kararlı kodları yazar", () => {
    const source = read("src/lib/learning/node/complete.ts");
    for (const code of [
      "node_complete_tracking_failed",
      "node_complete_notebook_streak_failed",
      "node_complete_grade_meta_failed",
      "node_complete_topic_gain_failed",
      "node_complete_release_claim_failed",
      "node_complete_store_result_failed",
    ]) {
      expect(source).toContain(`"${code}"`);
    }
  });

  it("sözlü raporu RPC'den önce beklenerek yazılır ({ error } denetlenir)", () => {
    const source = read("src/lib/learning/node/complete.ts");
    const meta = source.indexOf('"node_complete_grade_meta_failed"');
    const rpc = source.indexOf('service.rpc("complete_exam_prep_node"');
    expect(meta).toBeGreaterThan(0);
    expect(meta).toBeLessThan(rpc);
    expect(source.slice(meta - 40, meta)).toContain("await awaitLoggedWrite(");
  });

  it("grade-exam.ts etkinlik/yeniden planlama hatasını yazar", () => {
    const source = read("src/lib/learning/mock-exam/grade-exam.ts");
    expect(source).toContain('"mock_exam_activity_reschedule_failed"');
    expect(source).not.toMatch(/catch\s*\{\s*\/\/\s*ignore/);
  });
});

/**
 * Zod v4'ün `Function("")` yoklaması (28 Kasım 2026): üretimde CSP `unsafe-eval` içermediği için her sayfa açılışında
 * bir ihlal raporu ve `/api/csp-report` çağrısı üretiyordu. Tarayıcının ilk dosyası (`instrumentation-client.ts`)
 * zod'u `jitless` başlatır; o zaman nesne şeması kurulurken ve doğrulanırken `Function` hiç çağrılmaz.
 * Karşı deneme: ayar kapalıyken aynı şema `Function`'ı çağırır (test gerçekten bu davranışı ölçüyor).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type ZodGlobal = { __zod_globalConfig?: { jitless?: boolean } };

const realFunction = globalThis.Function;

/** `Function` çağrılarını sayar; zod'un yoklamasıyla aynı sonucu verir (izin yok → hata). */
function watchFunction() {
  const calls: unknown[][] = [];
  const watched = new Proxy(realFunction, {
    apply(_target, _this, args) {
      calls.push(args);
      throw new EvalError("CSP: eval izni yok");
    },
    construct(_target, args) {
      calls.push(args);
      throw new EvalError("CSP: eval izni yok");
    },
  });
  globalThis.Function = watched as FunctionConstructor;
  return calls;
}

async function freshZod() {
  vi.resetModules();
  return import("zod");
}

afterEach(() => {
  globalThis.Function = realFunction;
  const holder = (globalThis as ZodGlobal).__zod_globalConfig;
  if (holder) delete holder.jitless;
});

describe("zod tarayıcı ayarı", () => {
  it("jitless açıkken nesne şeması kurulurken ve doğrulanırken Function hiç çağrılmaz", async () => {
    const { applyZodBrowserConfig } = await import("@/lib/zod-browser");
    applyZodBrowserConfig();
    const { z } = await freshZod();
    const calls = watchFunction();
    const schema = z.object({ ad: z.string(), yas: z.number().int() });
    expect(schema.parse({ ad: "Ada", yas: 16 })).toEqual({ ad: "Ada", yas: 16 });
    expect(schema.safeParse({ ad: 3 }).success).toBe(false);
    expect(calls).toEqual([]);
  });

  it("karşı deneme: ayar kapalıyken aynı şema Function'ı yoklar (CSP raporunun kaynağı)", async () => {
    const { z } = await freshZod();
    const calls = watchFunction();
    const schema = z.object({ ad: z.string() });
    expect(schema.parse({ ad: "Ada" })).toEqual({ ad: "Ada" });
    expect(calls.length).toBeGreaterThan(0);
  });

  it("ayar tarayıcının ilk dosyasında, uygulama kodundan önce verilir", () => {
    const source = readFileSync("src/instrumentation-client.ts", "utf8");
    expect(source).toContain('import { applyZodBrowserConfig } from "@/lib/zod-browser";');
    const call = source.indexOf("applyZodBrowserConfig();");
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(source.indexOf("Sentry.init"));
  });
});

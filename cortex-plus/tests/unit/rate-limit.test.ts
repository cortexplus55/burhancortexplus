import { describe, expect, it, beforeEach } from "vitest";
import {
  clientKey,
  dailyKey,
  peekCount,
  rateLimit,
  rateLimitBackend,
  retryAfterSeconds,
  userKey,
} from "@/lib/rate-limit";

function clearRedisEnv() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("rate limiting", () => {
  beforeEach(clearRedisEnv);

  it("allows requests under the limit and blocks the overflow", async () => {
    const key = `test:${Math.random()}`;
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60)).allowed).toBe(false);
  });

  it("derives a key from the forwarded client address", () => {
    const request = new Request("https://cortexplus.app/api/ai/chat", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientKey(request, "chat")).toBe("cortex:chat:203.0.113.9");
  });

  it("keeps each user in a separate queue", async () => {
    const scope = `scope-${Math.random()}`;
    await rateLimit(userKey("ali", scope), 1, 60);
    await rateLimit(userKey("ali", scope), 1, 60);

    // Ali sınırı doldurdu; Ayşe'nin kuyruğu bundan etkilenmemeli. Sayaç
    // adrese bağlı olsaydı aynı okuldan giren ikisi birbirini engellerdi.
    expect((await rateLimit(userKey("ayse", scope), 1, 60)).allowed).toBe(true);
  });

  it("puts the date in the daily key so it dies on its own", () => {
    const key = dailyKey("ali", "chat", new Date("2026-09-05T22:00:00Z"));
    expect(key).toBe("cortex:d:chat:ali:2026-09-05");
    expect(dailyKey("ali", "chat", new Date("2026-09-06T01:00:00Z"))).not.toBe(
      key,
    );
  });

  it("reads the counter without spending it", async () => {
    const key = `peek:${Math.random()}`;
    expect(await peekCount(key)).toBe(0);

    await rateLimit(key, 3, 60);
    expect(await peekCount(key)).toBe(1);
    // Bakmak saymamalı: yanlış kod sayacında doğru kodu giren öğrenci
    // kendi kotasından yemesin.
    expect(await peekCount(key)).toBe(1);
  });

  it("reports at least one second of wait", () => {
    expect(retryAfterSeconds({ allowed: false, remaining: 0, resetAt: 0 })).toBe(
      1,
    );
    const inTenSeconds = Date.now() + 10_000;
    expect(
      retryAfterSeconds({ allowed: false, remaining: 0, resetAt: inTenSeconds }),
    ).toBeGreaterThan(8);
  });
});

/*
  Bu blok 5 Eylül 2026'daki sessiz arızayı sabitliyor.

  Upstash 1 Eylül'den beri projeye bağlıydı ama hız sınırı hiç çalışmamıştı:
  Vercel'in entegrasyonu değişkenleri KV_REST_API_* adıyla enjekte ediyor,
  kod ise UPSTASH_REDIS_REST_* arıyordu. Hiçbir hata verilmedi — sayaç
  sessizce bellek yedeğine düştü, yani üretimde sınır yokmuş gibi davrandı.

  Sessiz arıza en pahalı arıza türü. Testin işi, kodun hangi adları tanıdığını
  yazılı hâle getirmek.
*/
describe("Redis bağlantısı — isim çözümlemesi", () => {
  beforeEach(clearRedisEnv);

  it("hiçbir ad tanımlı değilse belleğe düşer", () => {
    expect(rateLimitBackend()).toBe("memory");
  });

  it("Vercel entegrasyonunun KV_* adlarını tanır", () => {
    process.env.KV_REST_API_URL = "https://ornek.upstash.io";
    process.env.KV_REST_API_TOKEN = "sahte-token";
    expect(rateLimitBackend()).toBe("redis");
  });

  it("elle verilen UPSTASH_* adlarını tanır", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://ornek.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "sahte-token";
    expect(rateLimitBackend()).toBe("redis");
  });

  it("yarım tanımı bağlı saymaz", () => {
    // Tek başına adres, token olmadan işe yaramaz. "Bağlı" demek, olmayan
    // bir korumayı var sanmak olurdu.
    process.env.KV_REST_API_URL = "https://ornek.upstash.io";
    expect(rateLimitBackend()).toBe("memory");
  });
});

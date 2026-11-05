import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { embeddedIpv4, expandIpv6, isPrivateAddress, safeImportUrl } from "@/lib/documents/url-import";
import { renderMarkdownToHtml } from "@/lib/markdown";
import {
  REDACTED_SEGMENT,
  SENTRY_IGNORE,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
} from "@/lib/observability/sentry-shared";
import {
  REDIS_BREAKER_THRESHOLD,
  peekCount,
  rateLimit,
  redisBreakerOpen,
  redisPipeline,
  resetRedisBreaker,
} from "@/lib/rate-limit";

/* Paket 1 güvenlik düzeltmeleri (6 Kasım 2026): ağ ve sızıntı kapıları. */

describe("bağlantıdan materyal: IPv6 içine gömülü IPv4", () => {
  const noDns = async () => {
    throw new Error("dns çağrılmamalı");
  };

  it("bulut üst veri adresinin eşlenmiş IPv6 biçimleri reddedilir (noktalı ve onaltılık)", async () => {
    // `new URL()` noktalı biçimi onaltılığa çeviriyor: eski denetim tam bu biçimi kaçırıyordu.
    expect(new URL("http://[::ffff:169.254.169.254]/").hostname).toBe("[::ffff:a9fe:a9fe]");
    expect(await safeImportUrl("http://[::ffff:169.254.169.254]/", noDns)).toEqual({ ok: false, error: "url_private" });
    expect(await safeImportUrl("http://[::ffff:a9fe:a9fe]/latest/meta-data", noDns)).toEqual({ ok: false, error: "url_private" });
  });

  it("NAT64, 6to4, SIIT ve uyumlu biçimler IPv4'e çevrilip denetlenir", () => {
    expect(isPrivateAddress("64:ff9b::a9fe:a9fe")).toBe(true);
    expect(isPrivateAddress("64:ff9b::169.254.169.254")).toBe(true);
    expect(isPrivateAddress("2002:7f00:1::1")).toBe(true); // 6to4 → 127.0.0.1
    expect(isPrivateAddress("2002:c0a8:101::")).toBe(true); // 6to4 → 192.168.1.1
    expect(isPrivateAddress("::ffff:0:a00:1")).toBe(true); // SIIT → 10.0.0.1
    expect(isPrivateAddress("::127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.5")).toBe(true);
  });

  it("198.18.0.0/15 ve öbür yerel aralıklar yasak; herkese açık adresler geçer", () => {
    expect(isPrivateAddress("198.18.0.1")).toBe(true);
    expect(isPrivateAddress("198.19.255.254")).toBe(true);
    expect(isPrivateAddress("198.20.0.1")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("fd12::1")).toBe(true);
    expect(isPrivateAddress("ff02::1")).toBe(true);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateAddress("64:ff9b::808:808")).toBe(false); // NAT64 → 8.8.8.8
    expect(isPrivateAddress("2002:808:808::1")).toBe(false); // 6to4 → 8.8.8.8
  });

  it("DNS çözümü gömülü adrese dönerse de reddedilir", async () => {
    const resolve = async () => ["::ffff:a9fe:a9fe"];
    expect(await safeImportUrl("https://ornek-site.test/", resolve)).toEqual({ ok: false, error: "url_private" });
  });

  it("IPv6 açma doğru grupları verir, bozuk biçim güvenli sayılmaz", () => {
    expect(expandIpv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
    expect(embeddedIpv4(expandIpv6("::ffff:a9fe:a9fe")!)).toBe("169.254.169.254");
    expect(expandIpv6("1::2::3")).toBeNull();
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("markdown bağlantısı: ters bölü dış adrese götürmez", () => {
  it("/\\evil.com bağlantı olmaz", () => {
    const html = renderMarkdownToHtml("[tıkla](/\\evil.com)");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('href="/\\');
  });

  it("yolun ortasındaki ters bölü de bağlantı olmaz", () => {
    expect(renderMarkdownToHtml("[x](/a\\b)")).not.toContain("<a ");
  });

  it("site içi göreli bağlantı eskisi gibi çalışır, // hâlâ reddedilir", () => {
    expect(renderMarkdownToHtml("[Belge](/dokumanlar/1?page=3)")).toContain('<a href="/dokumanlar/1?page=3"');
    expect(renderMarkdownToHtml("[x](//evil.com)")).not.toContain("<a ");
  });
});

describe("Sentry: adresteki belirteçler ve sorgu dizesi gitmez", () => {
  it("sorgu ve parça atılır, uzun belirteç parçası gizlenir", () => {
    const token = "veli.0b7c1e2a-1111-4222-8333-944455556666.abcDEF123456";
    expect(scrubUrl(`https://cortexplus.app/odeme/veli/${token}?x=1#y`)).toBe(
      `https://cortexplus.app/odeme/veli/${REDACTED_SEGMENT}`,
    );
    expect(scrubUrl("/hazirlik-davet/abcdefghijklmnopqrstuvwxyz0123?ref=k")).toBe(`/hazirlik-davet/${REDACTED_SEGMENT}`);
  });

  it("kısa parçalar ve uzun sayfa adları dokunulmaz", () => {
    expect(scrubUrl("https://cortexplus.app/ogretmenler-ve-profesorler-icin")).toBe(
      "https://cortexplus.app/ogretmenler-ve-profesorler-icin",
    );
    expect(scrubUrl("/deneme-sinavlari/abc/dugum/12")).toBe("/deneme-sinavlari/abc/dugum/12");
    expect(scrubUrl("https://cortexplus.app")).toBe("https://cortexplus.app");
  });

  it("scrubEvent request.url ve kırıntıları temizler", () => {
    const event = {
      request: { url: "https://cortexplus.app/u/0b7c1e2a11114222833394445555?token=gizli", data: "x", query_string: "a=b" },
      breadcrumbs: [{ category: "fetch", data: { url: "/api/x?token=gizli" } }],
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.url).toBe(`https://cortexplus.app/u/${REDACTED_SEGMENT}`);
    expect(out.request?.data).toBeUndefined();
    expect(out.breadcrumbs?.[0]?.data?.url).toBe("/api/x");
  });

  it("beforeBreadcrumb yardımcısı gezinme adreslerini temizler ve üç ortamda bağlı", async () => {
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/a?q=1", to: "/odeme/veli/abcdefghijklmnopqrstuvwxyz012345" },
    } as Breadcrumb);
    expect(crumb.data).toEqual({ from: "/a", to: `/odeme/veli/${REDACTED_SEGMENT}` });

    const fs = await import("node:fs");
    for (const file of ["src/instrumentation-client.ts", "src/sentry.server.config.ts", "src/sentry.edge.config.ts"]) {
      expect(fs.readFileSync(file, "utf8"), file).toMatch(/beforeBreadcrumb:\s*\(breadcrumb\)\s*=>\s*scrubBreadcrumb\(breadcrumb\)/);
    }
  });

  it("'cancelled' yalnız iletinin kendisiyle eşleşir, request_cancelled gizlenmez", () => {
    const matches = (message: string) =>
      SENTRY_IGNORE.some((pattern) => (typeof pattern === "string" ? message.includes(pattern) : pattern.test(message)));
    expect(matches("cancelled")).toBe(true);
    expect(matches("TypeError: cancelled")).toBe(true);
    expect(matches("request_cancelled")).toBe(false);
    expect(matches("Error: generation cancelled by server")).toBe(false);
    expect(SENTRY_IGNORE).not.toContain("cancelled");
  });
});

describe("hız sınırı: Redis devre kesici", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    resetRedisBreaker();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRedisBreaker();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("art arda 3 hatadan sonra Redis 30 sn sorulmaz, bellek yedeği çalışır; süre dolunca yeniden denenir", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
    const fetchMock = vi.fn(async () => {
      throw new Error("down");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    for (let i = 0; i < REDIS_BREAKER_THRESHOLD; i += 1) {
      expect((await rateLimit(`brk:${i}`, 5, 60)).allowed).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(REDIS_BREAKER_THRESHOLD);
    expect(redisBreakerOpen()).toBe(true);

    // Kesici açık: fetch çağrılmaz, bellek sayacı karar verir.
    const key = `brk:mem:${Math.random()}`;
    expect((await rateLimit(key, 1, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 60)).allowed).toBe(false);
    await peekCount(key);
    expect(await redisPipeline([["GET", "x"]])).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(REDIS_BREAKER_THRESHOLD);

    vi.setSystemTime(new Date("2026-11-06T10:00:31Z"));
    expect(redisBreakerOpen()).toBe(false);
    await rateLimit(`brk:after:${Math.random()}`, 5, 60);
    expect(fetchMock).toHaveBeenCalledTimes(REDIS_BREAKER_THRESHOLD + 1);
  });

  it("sayı yerine hata taşıyan pipeline sonucu geçirilmez: bellek yedeği sayar", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify([{ result: "OK" }, { error: "WRONGTYPE Operation" }, { result: 60 }]), { status: 200 }),
    ) as unknown as typeof fetch;
    const key = `bad:${Math.random()}`;
    expect((await rateLimit(key, 1, 60)).allowed).toBe(true);
    // Eski kod sayıyı 0 okuyup her isteği geçiriyordu.
    expect((await rateLimit(key, 1, 60)).allowed).toBe(false);
  });

  it("başarılı yanıt hata sayacını sıfırlar", async () => {
    let fail = true;
    globalThis.fetch = vi.fn(async () => {
      if (fail) throw new Error("down");
      return new Response(JSON.stringify([{ result: "OK" }, { result: 1 }, { result: 60 }]), { status: 200 });
    }) as unknown as typeof fetch;
    await rateLimit("a", 5, 60);
    await rateLimit("b", 5, 60);
    fail = false;
    await rateLimit("c", 5, 60);
    fail = true;
    await rateLimit("d", 5, 60);
    await rateLimit("e", 5, 60);
    expect(redisBreakerOpen()).toBe(false);
  });
});

describe("SMTP süre sınırları", () => {
  afterEach(() => {
    vi.doUnmock("nodemailer");
    vi.resetModules();
  });

  it("createTransport bağlantı, karşılama ve soket süreleriyle kurulur", async () => {
    vi.resetModules();
    const createTransport = vi.fn(() => ({ verify: async () => true }));
    vi.doMock("nodemailer", () => ({ default: { createTransport } }));
    const { createSmtpTransport } = await import("@/lib/email/smtp");
    createSmtpTransport({ host: "smtp.test", port: 587, user: "u", pass: "p", from: "f" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 8000, greetingTimeout: 5000, socketTimeout: 10000 }),
    );
  });
});

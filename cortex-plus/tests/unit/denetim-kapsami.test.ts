/**
 * Sohbetin %5 örneklemeli arka plan denetimi (15 Kasım 2026) ve Burhan'ın koşulları (karar 3): öğrenciyi bloklamaz ve
 * göstermez; kapatma bayrağı; günlük maliyet tavanı; yazma hacmi belgede. Plus sayfası metni ayrı PR'da.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const limiter = vi.hoisted(() => ({ allowed: true, throws: false, keys: [] as string[] }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: async (key: string) => {
    limiter.keys.push(key);
    if (limiter.throws) throw new Error("redis down");
    return { allowed: limiter.allowed, remaining: 0, resetAt: 0 };
  },
}));

import {
  CHAT_AUDIT_DAILY_CAP,
  CHAT_AUDIT_DEFAULT_RATE,
  CHAT_AUDIT_EST_USD,
  CHAT_AUDIT_FLAG,
  chatAuditDayKey,
  chatAuditRate,
  claimChatAuditSlot,
  shouldSampleChatAudit,
} from "@/lib/ai/chat-audit-sample";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("örnek oranı", () => {
  it("varsayılan %5; ortam değişkeni 0-1 arasına sıkışır; 0 kapatır", () => {
    expect(chatAuditRate(undefined)).toBe(CHAT_AUDIT_DEFAULT_RATE);
    expect(chatAuditRate("0.2")).toBe(0.2);
    expect(chatAuditRate("7")).toBe(1);
    expect(chatAuditRate("abc")).toBe(CHAT_AUDIT_DEFAULT_RATE);
    expect(shouldSampleChatAudit(() => 0.01, 0)).toBe(false);
    expect(shouldSampleChatAudit(() => 0.04, 0.05)).toBe(true);
    expect(shouldSampleChatAudit(() => 0.06, 0.05)).toBe(false);
  });
});

describe("günlük maliyet tavanı", () => {
  it("tavan 150 denetim, para karşılığı günde ~0,30 $", () => {
    expect(CHAT_AUDIT_DAILY_CAP).toBe(150);
    expect(Math.round(CHAT_AUDIT_DAILY_CAP * CHAT_AUDIT_EST_USD * 100) / 100).toBe(0.3);
  });

  it("gün İstanbul gününe göre döner", () => {
    // 15 Kasım 22:30 UTC = 16 Kasım 01:30 İstanbul.
    expect(chatAuditDayKey(new Date("2026-11-15T22:30:00Z"))).toContain("2026-11-16");
    expect(chatAuditDayKey(new Date("2026-11-15T20:00:00Z"))).toContain("2026-11-15");
    expect(chatAuditDayKey(new Date("2026-11-15T10:00:00Z"))).toContain("chat-audit");
  });

  it("tavan dolunca ya da sayaç düşünce denetim yok (belirsizlikte para harcanmaz)", async () => {
    limiter.allowed = true;
    limiter.throws = false;
    expect(await claimChatAuditSlot(new Date("2026-11-15T10:00:00Z"))).toBe(true);
    limiter.allowed = false;
    expect(await claimChatAuditSlot(new Date("2026-11-15T10:00:00Z"))).toBe(false);
    limiter.throws = true;
    expect(await claimChatAuditSlot(new Date("2026-11-15T10:00:00Z"))).toBe(false);
  });
});

describe("sohbet ucu", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("örnek yalnız kod kontrolünden şüphesiz geçen cevaptan, kayıttan sonra", () => {
    expect(route).toContain("if (local.ok && !local.suspicious) auditCandidate = { answer: content, localCitations: local.citations.length };");
    const at = route.indexOf("if (auditCandidate && charge && shouldSampleChatAudit())");
    expect(at).toBeGreaterThan(route.indexOf('stage("saved");'));
  });

  it("bayrak ve tavan yanıttan SONRA (after içinde), model çağrısından önce; sonuç öğrenciye gitmez", () => {
    const at = route.indexOf("if (auditCandidate && charge && shouldSampleChatAudit())");
    const block = route.slice(at, route.indexOf("if (live.started)", at));
    const afterAt = block.indexOf("after(async () => {");
    const flagAt = block.indexOf("await isFeatureEnabled(service, CHAT_AUDIT_FLAG)");
    const capAt = block.indexOf("await claimChatAuditSlot()");
    const modelAt = block.indexOf("await verifyDocumentAnswer({");
    expect(afterAt).toBeGreaterThan(-1);
    expect(flagAt).toBeGreaterThan(afterAt);
    expect(capAt).toBeGreaterThan(flagAt);
    expect(modelAt).toBeGreaterThan(capAt);
    expect(block).toContain('console.info("chat_audit_sample"');
    expect(block).toContain('console.info("chat_audit_sample_capped")');
    expect(block).toContain("splitOutsideMaterial(sample.answer).documentPart");
    expect(block).not.toContain("content =");
    expect(block).not.toContain("live.");
  });

  it("kapatma bayrağı panelde; satır yoksa kapalı (okuyucu eksik satırı kapalı sayar)", () => {
    expect(CHAT_AUDIT_FLAG).toBe("chat_audit_sample");
    expect(read("src/app/admin/feature-flags/page.tsx")).toContain('key: "chat_audit_sample"');
    expect(read("src/lib/admin/feature-flags.ts")).toContain("Missing rows count as disabled");
  });
});

describe("belge", () => {
  it("denetim kapsamı belgesi sembolik çözücü olmadığını, koşulları ve ek yazma hacmini söyler", () => {
    const doc = read("docs/ogretmen-hissi/denetim-kapsami.md");
    expect(doc).toContain("Sembolik çözücü yoktur.");
    expect(doc).toContain("chat_audit_sample");
    expect(doc).toContain("Ek yazma / gün");
    expect(doc).toContain("PLUS METNİ OK");
  });
});

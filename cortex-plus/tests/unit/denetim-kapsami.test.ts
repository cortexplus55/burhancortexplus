/** Sohbetin %5 örneklemeli arka plan denetimi ve Plus sayfası vaadinin daraltılması (15 Kasım 2026). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_AUDIT_DEFAULT_RATE, chatAuditRate, shouldSampleChatAudit } from "@/lib/ai/chat-audit-sample";

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

describe("sohbet ucu", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("örnek yalnız kod kontrolünden şüphesiz geçen cevaptan, yanıttan sonra ve öğrenciye gösterilmeden", () => {
    expect(route).toContain("if (local.ok && !local.suspicious) auditCandidate = { answer: content, localCitations: local.citations.length };");
    const at = route.indexOf("if (auditCandidate && charge && shouldSampleChatAudit())");
    expect(at).toBeGreaterThan(route.indexOf('stage("saved");'));
    const block = route.slice(at, at + 1600);
    expect(block).toContain("after(async () => {");
    expect(block).toContain('console.info("chat_audit_sample"');
    expect(block).toContain("splitOutsideMaterial(sample.answer).documentPart");
    expect(block).not.toContain("content =");
  });
});

describe("ürün metni", () => {
  it("Plus sayfası sohbetin bütün modlarına 'uydurmaz' demez; katı modu adıyla söyler", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).not.toContain("Notunda olmayanı uydurmaz.");
    expect(cards).toContain("«Yalnızca belgem» modunda notunda olmayanı uydurmaz; öbür modlarda genel bilgiyi ayrı etiketler.");
  });

  it("denetim kapsamı belgesi sembolik çözücü olmadığını ve %5 örneği söyler", () => {
    const doc = read("docs/ogretmen-hissi/denetim-kapsami.md");
    expect(doc).toContain("Sembolik çözücü yoktur.");
    expect(doc).toContain("chat_audit_sample");
  });
});

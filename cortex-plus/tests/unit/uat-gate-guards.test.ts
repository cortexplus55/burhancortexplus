import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatSourceSections, DOC_HEADING, GENERAL_HEADING } from "@/lib/ai/source-sections";
import { formatTry, formatTryWhole } from "@/lib/format";

/*
  UAT kapısında canlıda çıkmış üç hatanın bekçileri. Bunlar davranış değil
  kaynak testidir: değişiklik geri alınırsa aynı gün yakalansın.
*/

const read = (p: string) => readFileSync(p, "utf8");

describe("chat belge eki doğru kolonu okuyor", () => {
  const route = read("src/app/api/ai/chat/route.ts");
  it("document_pages.text_content seçiliyor, raw_text yok", () => {
    expect(route).toContain("text_content");
    expect(route).not.toMatch(/raw_text/);
  });
  it("istemci operationId gönderiyor", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toMatch(/operationId,/);
    expect(panel).toContain("chatOperationIds");
  });
});

describe("quiz üretimi kredi sözleşmesi", () => {
  const route = read("src/app/api/learning/quiz/generate/route.ts");
  it("reserveCredits + claim kullanıyor, ham RPC ve Date.now anahtarı yok", () => {
    expect(route).toContain("reserveCredits(");
    expect(route).not.toContain('rpc("credit_reserve"');
    expect(route).not.toMatch(/Date\.now\(\)/);
    expect(route).toContain("operation_in_progress");
  });
});

describe("fiyat yüzeyleri tek utility", () => {
  it("abonelik kartlarında yerel lira/tl yardımcıları yok", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).not.toMatch(/function lira\(/);
    expect(cards).not.toMatch(/function tl\(/);
    expect(cards).toContain("formatTryWhole(");
  });
  it("Plus aylık 59900 kuruş ₺599 görünür", () => {
    expect(formatTryWhole(59900).replace(/\s/g, "")).toBe("₺599");
    expect(formatTry(59900).replace(/\s/g, "")).toBe("₺599,00");
    expect(formatTryWhole(199900).replace(/\s/g, "")).toBe("₺1.999");
  });
});

describe("premium API'ler requireFeature ile kapılı", () => {
  for (const [file, feature] of [
    ["src/app/api/learning/speech/route.ts", "speech"],
    ["src/app/api/learning/podcast/audio/route.ts", "podcast"],
    ["src/app/api/learning/oral/transcribe/route.ts", "oral_transcribe"],
  ] as const) {
    it(`${feature} özelliği ${file}`, () => {
      const src = read(file);
      expect(src).toContain(`requireFeature(entitlements, "${feature}")`);
      expect(src).not.toContain("isPremiumUser(");
    });
  }
});

describe("entitlement sorgusu dönem bitişini SQL'de filtreler", () => {
  it("current_period_end filtresi var", () => {
    const src = read("src/lib/billing/entitlements.ts");
    expect(src).toMatch(/current_period_end\.gt\./);
  });
});

/*
  Vercel Hobby: en fazla 2 cron, her biri günde en fazla 1 kez. Üçüncü/saatlik
  cron eklendiği an tüm production deploy'lar reddediliyor ve bunu ne build ne
  test yakalıyor. Bu bekçi o hatayı push'tan önce kızartır.
*/
describe("vercel.json cron kotası (Hobby)", () => {
  const cfg = JSON.parse(read("vercel.json")) as { crons?: { path: string; schedule: string }[] };
  const crons = cfg.crons ?? [];
  it("en fazla iki cron", () => {
    expect(crons.length).toBeLessThanOrEqual(2);
  });
  it("her cron günde en fazla bir kez (dakika ve saat sabit)", () => {
    for (const c of crons) {
      const [minute, hour] = c.schedule.trim().split(/\s+/);
      expect(minute).toMatch(/^\d+$/);
      expect(hour).toMatch(/^\d+$/);
    }
  });
  it("veri silme kuyruğu günlük abonelik işine bağlı", () => {
    const src = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(src).toContain("processPendingDocumentDeletions(service)");
    expect(src).toContain("processPendingDeletionRequests(service)");
  });
});

describe("karma modda kaynak bölümleri görsel ayrılır", () => {
  it("Belgeden / Genel bilgiden etiketleri başlığa dönüşür", () => {
    const out = formatSourceSections("Belgeden: Hücre zarı seçici geçirgendir [1].\n\nGenel bilgiden: Bu özellik osmoz için temeldir.");
    expect(out).toContain(DOC_HEADING);
    expect(out).toContain(GENERAL_HEADING);
    expect(out).toContain("[1]");
  });
  it("etiket yoksa metne dokunmaz", () => {
    const text = "Düz cevap.";
    expect(formatSourceSections(text)).toBe(text);
  });
});

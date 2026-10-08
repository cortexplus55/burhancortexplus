import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { quotaView } from "@/lib/credits/period";
import {
  FREE_PAGE_TOTAL,
  FREE_PREP_LIMIT,
  FREE_PREP_LIMIT_CODE,
  freePageCapLine,
} from "@/lib/billing/free-tier-copy";
import { tierComparisonRows } from "@/lib/billing/tier-presentation";

/**
 * Ücretsiz katman (3 Ekim 2026, ürün sahibinin kararı; Astra'nın ücretsiz
 * hesabı aynı gün ölçüldü: tek sohbet mesajı günlük hakkın %64'ü, yeni
 * hazırlık kurmak kapalı):
 *   - günde 1 derslik hak (2 kredi); her şey aynı haktan
 *   - bir sınav hazırlığı
 *   - hesap başına toplam 5 sayfa belge işleme
 *   - resim sayfası hakkı dolunca belge reddedilmez, o sayfalar atlanır
 *   - konu haritası, kurulum sohbeti ve (ücretsizde) belge işleme öğrenme
 *     hakkından yemez — belgenin sınırı 5 sayfa
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("ücretsiz katman sınırları", () => {
  // Kredi sistemi v2 (8 Ekim 2026): birim küçüldü, hak aynı iş — bir ders (6) ya da iki mesaj (3).
  it("günlük hak bir ders: SQL ve arayüz aynı sayıyı söylüyor", () => {
    expect(read("supabase/migrations/20261008120000_credit_system_v2.sql")).toContain("v_allowance := 6;");
    expect(quotaView(null, false).allowance).toBe(6);
  });

  it("bir hazırlık ve toplam 5 sayfa; fiyat tablosu aynı sayıları gösteriyor", () => {
    expect(FREE_PREP_LIMIT).toBe(1);
    expect(FREE_PAGE_TOTAL).toBe(5);
    const rows = tierComparisonRows();
    expect(rows.find((row) => row.label === "Sınav hazırlığı")?.free).toBe("1");
    expect(rows.find((row) => row.label === "Belge işleme")?.free).toBe("Toplam 5 sayfa");
    expect(freePageCapLine(211, 5)).toContain("211 sayfalık belgenin ilk 5 sayfası");
  });

  it("hazırlık sınırı kurulumda ve okul kopyasında uygulanıyor; hedef puan kaydı sayılmıyor", () => {
    const limit = read("src/lib/billing/free-prep-limit.ts");
    expect(limit).toMatch(/\.neq\("exam_type", "hedef"\)/);
    for (const route of ["src/app/api/learning/exam-prep/create/route.ts", "src/app/api/school/route.ts"]) {
      expect(read(route)).toMatch(/if \(await freePrepLimitReached\(service, userId\)\)/);
    }
    expect(FREE_PREP_LIMIT_CODE).toBe("free_prep_limit");
    // Astra'daki gibi ders seçilince kapı: sihirbaz ve sohbet ikisi de.
    expect(read("src/components/parity/exam-create-wizard.tsx")).toMatch(/if \(prepLimitReached\) \{\s*openPaywall\(FREE_PREP_LIMIT_MESSAGE\)/);
    expect(read("src/components/parity/exam-create-chat.tsx")).toMatch(/if \(prepLimitReached\) \{/);
  });

  it("5 sayfa: PDF ve diğer belgeler kalan hak kadar işleniyor", () => {
    const pdf = read("src/lib/documents/pdf-ingestion.ts");
    expect(pdf).toMatch(/const remaining = await freePagesRemaining\(service, userId, documentId\);\s*if \(remaining === 0\) throw new Error\("free_page_limit"\);/);
    expect(pdf).toMatch(/const pageCap = remaining \?\? paidCap;/);
    expect(pdf).toMatch(/const total = cappedPageTotal\(read\.total, pageCap\);/);
    expect(pdf).toMatch(/source_page_count: read\.total/);
    const other = read("src/lib/rag/pipeline.ts");
    expect(other).toMatch(/if \(freeRemaining === 0\) return failAndRelease\("free_page_limit"\);/);
    expect(read("src/lib/documents/free-pages.ts")).toMatch(/\.in\("status", \["completed", "processing"\]\)/);
  });

  it("resim sayfası hakkı dolunca belge düşmüyor; yalnız hiçbir sayfa okunamazsa", () => {
    const pdf = read("src/lib/documents/pdf-ingestion.ts");
    expect(pdf).not.toMatch(/if \(data !== true\) throw new Error\("photo_quota_exhausted"\)/);
    expect(pdf).toMatch(/quotaSkipped: true/);
    expect(pdf).toMatch(/read\.scanSkipped\.length \? "photo_quota_exhausted" : "empty_content"/);
  });

  it("konu haritası ve kurulum sohbeti krediden düşmüyor", () => {
    expect(read("src/lib/documents/outline-oneshot.ts")).toMatch(/chargeCredits: false,\s*usageCode: "TOPIC_MAP_OUTLINE"/);
    expect(read("src/app/api/learning/exam-prep/intake/route.ts")).toMatch(/chargeCredits: false,\s*usageCode: "PREP_INTAKE"/);
    const generate = read("src/lib/ai/generate.ts");
    expect(generate).toMatch(/const charge = params\.chargeCredits !== false;/);
    expect(generate.match(/if \(charge\) await refundCredits/g)?.length).toBe(2);
    expect(generate).toMatch(/if \(charge\) await commitCredits/);
  });

  // Kredi sistemi v2: ücretlide sayfa başına kredi (metinli 2, taranmış +6).
  it("ücretsizde belge işleme ders hakkından yemiyor; ücretlide sayfa başına", () => {
    const pdf = read("src/lib/documents/pdf-ingestion.ts");
    expect(pdf).toMatch(/if \(remaining === null\) \{\s*if \(!reservationId\) \{/);
    expect(pdf).toMatch(/reservationId = await ensureReservation\(service, userId, documentId, lease, paidCap\);/);
    expect(pdf).toMatch(/chargeNow\(service, userId, "DOCUMENT_SCAN_PAGE"/);
    const route = read("src/app/api/documents/process/route.ts");
    expect(route).toMatch(/const freeTier = \(await freePagesRemaining\(service, userId, doc\.id\)\) !== null;/);
    expect(route).toMatch(/if \(!freeTier\) \{\s*await commitCredits/);
    expect(route).toMatch(/chargeNow\(service, userId, "DOCUMENT_SCAN_PAGE", `document_scan_\$\{doc\.id\}`, result\.scannedPages \?\? 0\)/);
  });

  it("önceden hazırlama dönem hakkını da sayıyor (#243 hatası)", () => {
    expect(read("src/lib/credits/spendable-server.ts")).toMatch(/free_allowance_remaining/);
    expect(read("src/app/api/learning/exam-prep/node/route.ts")).toMatch(/canAffordLesson\(service, userId, rule\.credit_cost\)/);
  });
});

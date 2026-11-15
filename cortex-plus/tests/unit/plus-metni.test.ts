/** Plus sayfası vaadinin daraltılması (15 Kasım 2026; yayına girmesi Burhan'ın "PLUS METNİ OK" onayına bağlı). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Plus sayfası metni", () => {
  it("sohbetin bütün modlarına 'uydurmaz' demez; katı modu adıyla söyler", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).not.toContain("Notunda olmayanı uydurmaz.");
    expect(cards.replace(/\s+/g, " ")).toContain(
      "«Yalnızca belgem» modunda notunda olmayanı uydurmaz; öbür modlarda genel bilgiyi ayrı etiketler. Cevaplayamadığı soruda hakkından düşmez.",
    );
  });
});

/**
 * Burhan kararı 4 (15 Kasım 2026): yeni metin "Cevaplayamadığı soruda hakkından düşmez" der; yayından önce kanıt.
 * "Emin olamadım" (chatFallbackMessage) iki yolda da ücretsiz kaydedilir ve SQL ayırmayı iade eder; iade ücretsiz sayacı
 * aynı dönemde geri verir (PGlite kanıtı: free-tier-counts.test.ts "aynı haftadaki iade hakkı geri verir").
 */
describe("emin olamadım: hak ve kota düşmez", () => {
  const route = read("src/app/api/ai/chat/route.ts");

  it("ana sohbet ve hazırlık sohbeti aynı !accepted bloğundan geçer; orada charge = false", () => {
    const block = route.slice(route.indexOf("if (!accepted) {"), route.indexOf("if (charge && solveGuard)"));
    expect(block).toContain("chatFallbackMessage({ isPremium, difficulty: difficulty.level })");
    expect(block).toContain("charge = false;");
    // Hazırlık sohbeti (teacher tutor) reddedilince accepted kurulmaz; ikinci döngü açılmaz, aynı bloğa düşer.
    expect(route).toContain('logOpsEvent("document_answer_rejected", { operationId, strict, stage: "teacher_tutor"');
    expect(route).toContain("const attemptLimit = teacherTutor ? 0 : paidChatAttempts(offDocument);");
    expect(route).toContain("p_charge: charge");
  });

  it("SQL: p_charge false → credit_refund; iade ücretsiz sayacı geri verir", () => {
    const settle = read("supabase/migrations/20260923121401_uat_chat_operation_results.sql");
    expect(settle).toContain("IF p_charge THEN PERFORM public.credit_commit(p_reservation_id);");
    expect(settle).toContain("ELSE PERFORM public.credit_refund(p_reservation_id); END IF;");
    expect(settle).toContain("'creditsUsed',CASE WHEN p_charge THEN r.amount ELSE 0 END");
    const refund = read("supabase/migrations/20261024121000_free_tier_counts.sql");
    expect(refund).toContain("UPDATE public.free_usage SET used = GREATEST(used - 1, 0)");
  });
});

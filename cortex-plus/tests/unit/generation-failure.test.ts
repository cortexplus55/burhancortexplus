import { describe, expect, it } from "vitest";
import { describeGenerationFailure } from "@/lib/learning/generation-failure";

/**
 * Üretim başarısız olduğunda ne olacağı.
 *
 * Canlıda yaşanan çıkmaz: ders üretimi düştü, "Yeniden deneyebilirsin"
 * yazdı, tıkladım, aynı ekran. Üç kez. Sebebi istemcinin istek kimliğini
 * yalnızca TEK bir hata kodunda yenilemesiydi; gerçek bir hatadan sonra
 * ilk iki tıklama sunucuya "aynı isteği" gönderiyor ve sunucu onu
 * reddediyordu.
 */
describe("describeGenerationFailure", () => {
  it("mints a new id after a real failure, so the button actually retries", () => {
    for (const code of [
      "content_verification_failed",
      "source_unavailable",
      "generation_failed",
      "lesson_missing",
      undefined,
    ]) {
      expect(describeGenerationFailure(code).retryMintsNewId).toBe(true);
    }
  });

  it("does NOT mint a new id while generation is still running", () => {
    // Yenilemek ikinci bir üretim başlatır ve öğrenci iki kez ödeyebilir.
    const failure = describeGenerationFailure("generation_in_progress");
    expect(failure.retryMintsNewId).toBe(false);
    expect(failure.canRetryNow).toBe(false);
  });

  it("says what went wrong, not just that something did", () => {
    // Tek bir cümle vardı ve hiçbir şey söylemiyordu.
    expect(describeGenerationFailure("source_unavailable").message).toContain(
      "kaynak sayfaları okunamadı",
    );
    expect(
      describeGenerationFailure("content_verification_failed").message,
    ).toContain("kalite kontrolünden geçemedi");
    expect(describeGenerationFailure("topic_map_unavailable").message).toContain(
      "konu haritası",
    );
  });

  it("does not invite a retry that cannot help", () => {
    expect(describeGenerationFailure("premium_required").canRetryNow).toBe(false);
  });

  it("still answers for a code it has never seen", () => {
    const failure = describeGenerationFailure("kim_bilir_ne");
    expect(failure.message.length).toBeGreaterThan(10);
    expect(failure.retryMintsNewId).toBe(true);
  });
});

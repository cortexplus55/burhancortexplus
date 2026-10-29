import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { APP_SECRET: "test-secret-for-parent-link", SUPABASE_SECRET_KEY: undefined } }));

import {
  createParentPayToken,
  PARENT_LINK_TTL_MS,
  parentLinkValidityLine,
  parentShareText,
  verifyParentPayToken,
  whatsappShareUrl,
} from "@/lib/payments/parent-link";
import { DISTANCE_SALES_SECTIONS } from "@/lib/legal/texts";

const read = (path: string) => readFileSync(path, "utf8");
const STUDENT = "11111111-2222-4333-8444-555555555555";
const PLAN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("Paket F · velime ödeme linki: imzalı, süreli, kurcalanamaz", () => {
  let token: string;
  beforeAll(() => {
    token = createParentPayToken({ studentId: STUDENT, planId: PLAN }, 1_000_000, "nonce1")!;
  });

  it("öğrenci ve planı imzayla taşır; URL'de güvenli karakterler", () => {
    expect(token).toMatch(/^veli\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const verified = verifyParentPayToken(token, 2_000_000);
    expect(verified).toEqual({ ok: true, claims: { studentId: STUDENT, planId: PLAN, expiresAt: 1_000_000 + PARENT_LINK_TTL_MS, nonce: "nonce1" } });
    expect(PARENT_LINK_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("süre dolunca 'expired'; tek karakter değişince 'invalid'; başka planla imza tutmaz", () => {
    expect(verifyParentPayToken(token, 1_000_000 + PARENT_LINK_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    const parts = token.split(".");
    parts[2] = PLAN.replace("aaaaaaaa", "ffffffff");
    expect(verifyParentPayToken(parts.join("."), 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    const sig = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyParentPayToken(sig, 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyParentPayToken("veli.x.y", 2_000_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyParentPayToken(null, 2_000_000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("paylaşım metni öğrenciyi, planı ve fiyatı söyler; WhatsApp adresi kodlanır", () => {
    const text = parentShareText({ studentName: "Elif", planName: "Plus aylık", priceLabel: "₺399", url: "https://cortexplus.app/odeme/veli/x" });
    expect(text).toContain("Elif için Cortex Plus Plus aylık (₺399)");
    expect(text).toContain("hesap açmadan");
    expect(text.endsWith("https://cortexplus.app/odeme/veli/x")).toBe(true);
    expect(whatsappShareUrl("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
    expect(parentLinkValidityLine(Date.now() + PARENT_LINK_TTL_MS)).toBe("Bağlantı 3 gün geçerli.");
    expect(parentLinkValidityLine(Date.now() + 1_000)).toBe("Bağlantı bugün geçerli.");
  });

  it("veli ödemesi öğrencinin adına açılır, geri çağrı aynı yoldan; veli yıldız ya da hesap almaz", () => {
    const checkout = read("src/app/api/payments/parent-link/checkout/route.ts");
    expect(checkout).toContain("guestLimit(request, { scope: \"parent-pay-checkout\"");
    expect(checkout).toContain("legalAccepted: z.literal(true)");
    expect(checkout).toContain("userId: verified.claims.studentId");
    expect(checkout).toContain("beneficiaryId: verified.claims.studentId");
    expect(checkout).toContain('via: "parent_link"');
    expect(checkout).not.toMatch(/awardStars|signUp|createUser/);
    const link = read("src/app/api/payments/parent-link/route.ts");
    expect(link).toMatch(/scope: "parent-pay-link", limit: 5, dailyLimit: 20/);
    expect(link).toContain('.from("parent_payment_requests")');
    // Ortak kabuk: sözleşme onayının denetim kaydı tek yerde, iki çağıran da buradan geçer.
    const shell = read("src/lib/payments/checkout.ts");
    expect(shell).toContain('action: "payment.token.created"');
    expect(shell).toContain("legal_consent: {");
    expect(read("src/app/api/payments/paytr/create-token/route.ts")).toContain("createPaytrCheckout(service, {");
  });

  it("öğrenci tarafında düğme, veli tarafında herkese açık sayfa ve sözleşme cümlesi", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    expect(cards).toContain("<ParentPayLinkButton planId={plusPlan.id} planName={plusPlan.name} />");
    expect(read("src/components/billing/parent-pay-link-button.tsx")).toContain("Kartım yanımda değil — velime ödeme linki gönder");
    const page = read("src/app/odeme/veli/[token]/page.tsx");
    expect(page).toContain("verifyParentPayToken(token)");
    expect(page).not.toMatch(/requireUser|requireStudentArea/);
    expect(read("src/components/billing/parent-pay-form.tsx")).toContain("Mesafeli Satış Sözleşmesi");
    const parties = DISTANCE_SALES_SECTIONS.find((section) => section.heading === "Taraflar")!;
    expect(parties.body.some((line) => line.includes("velisi olduğu öğrencinin"))).toBe(true);
  });
});

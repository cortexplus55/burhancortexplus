/**
 * Faz 5 denetimi (19 Kasım 2026): paket adı "Plus" olduğu için veli WhatsApp metni ve veli ödeme sayfası
 * "Cortex Plus Plus" yazıyordu. Marka ile paket bir tire ile ayrılır, "Paketi" bir kez yazılır.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parentLinkPlanName, parentPackageLabel } from "@/lib/payments/parent-link-plan";
import { parentShareText } from "@/lib/payments/parent-link";
import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";

describe("veli paketi etiketi", () => {
  it("satıştaki her paket için akıcı etiket; 'Cortex Plus Plus' hiçbir zaman", () => {
    expect(parentPackageLabel("Plus")).toBe("Cortex Plus — Plus Paketi");
    expect(parentPackageLabel(PLAN_MARKETING_COPY.week.name)).toBe(`Cortex Plus — ${PLAN_MARKETING_COPY.week.name} Paketi`);
    expect(parentPackageLabel(PLAN_MARKETING_COPY.sigma.name)).toBe(`Cortex Plus — ${PLAN_MARKETING_COPY.sigma.name} Paketi`);
    expect(parentPackageLabel("Cortex Plus Plus")).toBe("Cortex Plus — Plus Paketi");
    expect(parentPackageLabel("Örnek Paket")).toBe("Cortex Plus — Örnek Paketi");
    expect(parentPackageLabel("")).toBe(`Cortex Plus — ${PLAN_MARKETING_COPY.plus.name} Paketi`);
    for (const billing_period of ["weekly", "monthly"]) {
      for (const tier of ["plus", "sigma"]) {
        const label = parentPackageLabel(parentLinkPlanName({ name: "Plus", billing_period, tier }));
        expect(label).not.toMatch(/Cortex Plus Plus|Paketi Paketi/);
      }
    }
  });

  it("WhatsApp metni ve veli sayfası aynı etiketi kullanır", () => {
    const text = parentShareText({ planName: "Plus", url: "https://example.test/veli-odeme/x" });
    expect(text).toContain("(Cortex Plus — Plus Paketi)");
    expect(text).not.toContain("Cortex Plus Plus");
    const page = readFileSync("src/app/veli-odeme/[token]/page.tsx", "utf8");
    expect(page).toContain("{parentPackageLabel(planName)}");
    expect(page).not.toMatch(/Cortex Plus \{planName\}/);
  });
});

describe("veli ödeme onay kutuları (Mesafeli Sözleşmeler Yönetmeliği)", () => {
  it("iki ayrı zorunlu kutu: sözleşmeleri okudum-onaylıyorum ve dijital hizmet / cayma hakkı yok", async () => {
    const { PARENT_PERFORMANCE_CONSENT_TEXT } = await import("@/lib/payments/parent-pay-copy");
    expect(PARENT_PERFORMANCE_CONSENT_TEXT).toBe(
      "Dijital hizmetin ödeme anında hemen başlamasını onaylıyorum ve bu nedenle cayma hakkının bulunmadığını biliyorum.",
    );
    const form = readFileSync("src/components/billing/parent-pay-form.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(form).toContain('linkText="Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi"');
    expect(form).toContain("after=\"'ni okudum, onaylıyorum.\"");
    expect(form).toContain("{PARENT_PERFORMANCE_CONSENT_TEXT}");
    // İkisi işaretlenmeden istek gitmez; sunucu da ikisini zorunlu tutar.
    expect(form.indexOf("if (!accepted)")).toBeLessThan(form.indexOf('fetch("/api/payments/parent-link/checkout"'));
    expect(form.indexOf("if (!performance)")).toBeLessThan(form.indexOf('fetch("/api/payments/parent-link/checkout"'));
    const route = readFileSync("src/app/api/payments/parent-link/checkout/route.ts", "utf8");
    expect(route).toContain("legalAccepted: z.literal(true)");
    expect(route).toContain("performanceConsent: z.literal(true)");
  });
});

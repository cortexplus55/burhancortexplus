import { describe, expect, it } from "vitest";
import {
  entitlementsFromSubscriptionRow,
  PHOTO_PAGE_LIMITS,
  requireFeature,
} from "@/lib/billing/entitlements";
import { formatTry, kurusToTry, tryToKurus } from "@/lib/format";
import {
  remainingSeconds,
  writtenExamDeadline,
} from "@/lib/learning/attempt-lifecycle";
import { chatSourceBlock } from "@/lib/learning/chat-source-block";

describe("canonical entitlements", () => {
  it("bozuk dönem tarihi premium erişim açmaz", () => {
    const e = entitlementsFromSubscriptionRow({ status: "active", current_period_end: "invalid", plans: { is_premium: true, tier: "sigma" } });
    expect(e.isPremium).toBe(false);
    expect(e.plan).toBe("free");
  });
  it("kayıtlı ücretsiz stüdyoları açar, gelişmiş sohbeti kapalı tutar", () => {
    const e = entitlementsFromSubscriptionRow(null);
    expect(e.audience).toBe("free");
    expect(e.plan).toBe("free");
    expect(e.isPremium).toBe(false);
    expect(e.showsUpgradeChrome).toBe(true);
    expect(requireFeature(e, "podcast")).toBe(true);
    expect(requireFeature(e, "speech")).toBe(true);
    expect(requireFeature(e, "oral_transcribe")).toBe(true);
    expect(requireFeature(e, "advanced_chat")).toBe(false);
    expect(e.modelTier).toBe("standard");
    expect(e.photoPageLimit).toBe(PHOTO_PAGE_LIMITS.free);
  });

  it("Plus aboneliğini tier kolonundan okur", () => {
    const e = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: new Date(Date.now() + 86400000).toISOString(),
      cancel_at_period_end: false,
      plans: {
        is_premium: true,
        tier: "plus",
        name: "Plus Aylık",
        slug: "plus-aylik",
        monthly_allowance: 400,
      },
    });
    expect(e.audience).toBe("plus");
    expect(e.plan).toBe("plus");
    expect(e.badge).toBe("Plus");
    expect(e.isPaid).toBe(true);
    expect(e.showsUpgradeChrome).toBe(false);
    expect(e.modelTier).toBe("standard");
    expect(requireFeature(e, "podcast")).toBe(true);
    expect(requireFeature(e, "advanced_chat")).toBe(false);
    expect(requireFeature(e, "photo_quota_sigma")).toBe(false);
  });

  it("Sigma kullanıcısına Plus sınırı aşılan kota verir", () => {
    const e = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: new Date(Date.now() + 86400000).toISOString(),
      plans: {
        is_premium: true,
        tier: "sigma",
        name: "Sigma",
        slug: "sigma-aylik",
        monthly_allowance: 1200,
      },
    });
    expect(e.audience).toBe("sigma");
    expect(e.plan).toBe("sigma");
    expect(e.badge).toBe("Sigma");
    expect(e.modelTier).toBe("advanced");
    expect(requireFeature(e, "advanced_chat")).toBe(true);
    expect(e.showsUpgradeChrome).toBe(false);
    expect(e.photoPageLimit).toBe(PHOTO_PAGE_LIMITS.sigma);
    expect(requireFeature(e, "photo_quota_sigma")).toBe(true);
  });

  it("süresi bitmiş aboneliği free'ye düşürür", () => {
    const e = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: new Date(Date.now() - 1000).toISOString(),
      plans: { is_premium: true, tier: "plus", name: "Plus" },
    });
    expect(e.plan).toBe("free");
    expect(e.subscriptionStatus).toBe("expired");
    expect(e.isPremium).toBe(false);
  });

  it("dönem sonuna iptalde cancelling + hâlâ premium", () => {
    const e = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: new Date(Date.now() + 86400000).toISOString(),
      cancel_at_period_end: true,
      plans: { is_premium: true, tier: "plus", name: "Plus" },
    });
    expect(e.subscriptionStatus).toBe("cancelling");
    expect(e.isPremium).toBe(true);
  });
});

describe("TR fiyat formatı", () => {
  it("kuruşu ₺599,00 yazar — 29.900 yanılgısı yok", () => {
    expect(formatTry(59900)).toBe("₺599,00");
    expect(formatTry(299000)).toBe("₺2.990,00");
    expect(kurusToTry(59900)).toBe(599);
    expect(tryToKurus(599)).toBe(59900);
  });
});

describe("exam timer", () => {
  it("expires_at üzerinden kalan süreyi hesaplar", () => {
    const { expires_at } = writtenExamDeadline(
      new Date("2026-01-01T12:00:00.000Z"),
    );
    expect(expires_at).toBe("2026-01-01T12:15:00.000Z");
    expect(
      remainingSeconds(
        expires_at,
        new Date("2026-01-01T12:10:00.000Z").getTime(),
      ),
    ).toBe(300);
    expect(
      remainingSeconds(
        expires_at,
        new Date("2026-01-01T12:20:00.000Z").getTime(),
      ),
    ).toBe(0);
  });
});

describe("yalnızca belgem chat bloğu", () => {
  const match = {
    content: "Fotosentez kloroplastta gerçekleşir.",
    documentName: "Biyoloji.pdf",
    pageNumber: 18,
  };

  it("boş retrieval'da tahmin yasaklar", () => {
    const block = chatSourceBlock([], { documentsOnly: true });
    expect(block).toContain("Bu bilgi yüklediğin belgede yer almıyor");
    expect(block).toContain("Genel bilgiyle cevap VERME");
  });

  it("alıntıda sayfa citation taşır", () => {
    const block = chatSourceBlock([match], { documentsOnly: true });
    expect(block).toContain("s.18");
    expect(block).toContain("documents_only");
  });

  it("genel bilgi modunda kaynak ayrımı ister", () => {
    const block = chatSourceBlock([match], { documentsOnly: false });
    expect(block).toContain("Belgeden:");
    expect(block).toContain("Genel bilgiden:");
  });
});

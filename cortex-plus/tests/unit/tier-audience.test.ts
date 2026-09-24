import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  emptyGuestAudience,
  entitlementsFromSubscriptionRow,
  requireFeature,
  requireSignedIn,
} from "@/lib/billing/entitlements";
import {
  BENEFITS_LEAD,
  defaultQuotaKind,
  plusBenefitLines,
  quotaKindLabel,
  upgradeChrome,
} from "@/lib/billing/tier-presentation";
import { periodLabel, quotaView } from "@/lib/credits/period";

const future = new Date(Date.now() + 86400000).toISOString();

describe("audience", () => {
  it("misafir boş: stüdyo yok, krom yok, foto hakkı yok", () => {
    const guest = emptyGuestAudience();
    expect(guest.audience).toBe("guest");
    expect(requireSignedIn(guest)).toBe(false);
    expect(requireFeature(guest, "podcast")).toBe(false);
    expect(requireFeature(guest, "speech")).toBe(false);
    expect(requireFeature(guest, "oral_transcribe")).toBe(false);
    expect(requireFeature(guest, "advanced_chat")).toBe(false);
    expect(guest.showsUpgradeChrome).toBe(false);
    expect(guest.photoPageLimit).toBe(0);
    expect(upgradeChrome(guest.audience).showBuyNav).toBe(false);
  });

  it("ücretsiz podcast açık, advanced_chat kapalı", () => {
    const free = entitlementsFromSubscriptionRow(null);
    expect(free.audience).toBe("free");
    expect(requireFeature(free, "podcast")).toBe(true);
    expect(requireFeature(free, "advanced_chat")).toBe(false);
    expect(upgradeChrome("free")).toMatchObject({
      showBuyNav: true,
      showCampaignBanner: true,
      showChatUpgradeCard: true,
      showTopUp: false,
      planLabel: "Temel",
      badge: null,
    });
  });

  it("Plus kromsuz, Sigma gelişmiş model ve ek paket", () => {
    const plus = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: future,
      plans: { is_premium: true, tier: "plus", name: "Plus", monthly_allowance: 400 },
    });
    const sigma = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: future,
      plans: { is_premium: true, tier: "sigma", name: "Sigma", monthly_allowance: 1200 },
    });
    expect(requireFeature(plus, "advanced_chat")).toBe(false);
    expect(requireFeature(sigma, "advanced_chat")).toBe(true);
    expect(upgradeChrome("plus").showBuyNav).toBe(false);
    expect(upgradeChrome("plus").badge).toBe("Plus");
    expect(upgradeChrome("sigma")).toMatchObject({
      showTopUp: true,
      badge: "Sigma",
      showChatUpgradeCard: false,
    });
  });
});

describe("kota etiketi", () => {
  it("ücretsiz günlük, premium aylık", () => {
    expect(defaultQuotaKind("free")).toBe("daily");
    expect(defaultQuotaKind("plus")).toBe("monthly");
    expect(defaultQuotaKind("sigma")).toBe("monthly");
    expect(defaultQuotaKind("guest")).toBeNull();
    expect(quotaKindLabel("free")).toBe("Günlük limit");
    expect(quotaKindLabel("plus")).toBe("Aylık limit");
    expect(periodLabel("daily")).toBe("Günlük limit");
    expect(periodLabel("monthly")).toBe("Aylık limit");
    expect(quotaView(null, false).kind).toBe("daily");
    expect(quotaView(null, true).kind).toBe("monthly");
  });
});

describe("pazarlama kopyası ücretsizde açık özelliği Plus'a yazmaz", () => {
  it("başlık ve Plus listesi", () => {
    expect(BENEFITS_LEAD).toBe("Ücretsiz plandaki her şey ve:");
    const lines = plusBenefitLines().join(" ");
    expect(lines).not.toMatch(/podcast/i);
    expect(lines).not.toMatch(/sözlü/i);
    expect(lines).toMatch(/aylık kota/);
    expect(lines).toMatch(/300 sayfa/);
  });
});

describe("sohbet gelişmiş modeli sunucuda Sigma'ya iner", () => {
  const chat = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
  it("advanced_chat yoksa standart eyleme düşer", () => {
    expect(chat).toContain('requireFeature(entitlements, "advanced_chat")');
    expect(chat).toContain('"AI_CHAT_STANDARD"');
  });
});

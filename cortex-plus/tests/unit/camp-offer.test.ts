import { describe, expect, it } from "vitest";
import { campOffer, campHeadline, CAMP_MAX_DAYS } from "@/lib/camp/offer";

const base = { daysLeft: 5, examPassed: false, showsUpgradeChrome: true, weeklyKurus: 34900 };

describe("kamp modu", () => {
  it("≤7 gün ücretsizde görünür, mevcut haftalık plana gider", () => {
    expect(campOffer(base)).toEqual({ daysLeft: 5, weeklyKurus: 34900, href: "/pay" });
    expect(campOffer({ ...base, daysLeft: CAMP_MAX_DAYS })).not.toBeNull();
    expect(campOffer({ ...base, daysLeft: 0 })).not.toBeNull();
  });
  it("Plus'ta, 7 günden uzakta, sınav geçtiyse ya da tarih yoksa gizli", () => {
    expect(campOffer({ ...base, showsUpgradeChrome: false })).toBeNull();
    expect(campOffer({ ...base, daysLeft: 8 })).toBeNull();
    expect(campOffer({ ...base, examPassed: true })).toBeNull();
    expect(campOffer({ ...base, daysLeft: null })).toBeNull();
    expect(campOffer({ ...base, daysLeft: -1 })).toBeNull();
  });
  it("başlık", () => {
    expect(campHeadline(0)).toContain("bugün");
    expect(campHeadline(3)).toBe("Sınavına 3 gün kaldı: kamp haftası.");
  });
});

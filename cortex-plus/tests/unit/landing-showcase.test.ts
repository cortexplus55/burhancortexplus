import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_SEGMENT_IDS,
  AUDIENCE_SEGMENTS,
  audienceSegment,
  DEFAULT_SEGMENT,
  isAudienceSegmentId,
  resolveSegmentParam,
} from "@/lib/marketing/landing-showcase";

/*
  Ana sayfa hedef kitle sekmeleri (7 Kasım 2026). Dört profil, her biri kayıt sayfasına kendi `?hedef=` değeriyle
  gider. Kayıtsız vitrin 11 Kasım 2026'da 7 adımlı tura dönüştü (`misafir-turu.test.tsx`).
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("hedef kitle sekmeleri", () => {
  it("dört profil, her biri kendi kayıt bağlantısıyla", () => {
    expect(AUDIENCE_SEGMENT_IDS).toEqual(["lise", "yks-lgs", "universite", "akademik"]);
    expect(AUDIENCE_SEGMENTS.map((segment) => segment.id)).toEqual([...AUDIENCE_SEGMENT_IDS]);
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(segment.signupHref).toBe(`/kayit?hedef=${segment.id}`);
      expect(segment.badge.length).toBeGreaterThan(10);
      expect(segment.lead.length).toBeGreaterThan(80);
      expect(segment.ctaLabel).toMatch(/ücretsiz başlat$/);
    }
    expect(audienceSegment(DEFAULT_SEGMENT).id).toBe("lise");
    expect(isAudienceSegmentId("lise")).toBe(true);
    expect(isAudienceSegmentId("ortaokul")).toBe(false);
  });

  it("adresten sekme: ?hedef=, yoksa utm anahtar kelimesi, yoksa hiç", () => {
    expect(resolveSegmentParam("?hedef=universite")).toBe("universite");
    expect(resolveSegmentParam("hedef=YKS-LGS")).toBe("yks-lgs");
    expect(resolveSegmentParam("?utm_source=tiktok&utm_campaign=tyt-kamp-kasim")).toBe("yks-lgs");
    expect(resolveSegmentParam("?utm_campaign=kpss_2027")).toBe("akademik");
    expect(resolveSegmentParam("?utm_content=vize-haftasi")).toBe("universite");
    expect(resolveSegmentParam("?utm_campaign=lise_yazili")).toBe("lise");
    expect(resolveSegmentParam("?hedef=bilinmeyen")).toBeNull();
    expect(resolveSegmentParam("?utm_campaign=genel")).toBeNull();
    expect(resolveSegmentParam("")).toBeNull();
    expect(resolveSegmentParam(null)).toBeNull();
  });

  it("YDT gibi üründe olmayan sınav adı ya da rakip adı geçmez", () => {
    const text = AUDIENCE_SEGMENTS.map((segment) => `${segment.badge} ${segment.lead} ${segment.ctaLabel}`).join("\n");
    expect(text).not.toMatch(/\bYDT\b/);
    expect(text).not.toMatch(/astra/i);
    // 11 Kasım 2026: kahraman cümleleri yalnız ücretsizde de açık olanları sayar; Plus'ta olan (podcast, video,
    // sözlü, yazılı deneme, sınav sabahı kâğıdı) burada vaat edilmez, turun Plus adımında "Plus" rozetiyle gösterilir.
    expect(text).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/i);
  });
});

describe("kahraman ve tur aynı sekme durumunu paylaşır", () => {
  it("adres replaceState ile güncellenir; tur seçili sekmeyi kayıt bağlantısına taşır", () => {
    const hero = read("src/components/landing/audience-hero.tsx");
    expect(hero).toContain("resolveSegmentParam(window.location.search)");
    expect(hero).toContain("replaceState");
    expect(hero).toContain("<FuturisticGuidedJourney segmentId={segmentId} />");
    expect(hero).toContain("href={segment.signupHref}");
    const page = read("src/components/landing/landing-page.tsx");
    expect(page).toContain("<AudienceHero />");
    // Sayfa önbellekten gelmeye devam eder (O12): sunucu searchParams okumaz.
    expect(read("src/app/page.tsx")).not.toContain("searchParams");
  });

  // 11 Kasım 2026, kokpit: örnek not tek, bağlam sekmeye göre. Dört profil de turun kendi sınavı için geçerli
  // olduğunu okur; cümleler üründe bugün çalışan şeyleri söyler.
  it("her sekmenin turda bir bağlam cümlesi ve sınav sözü var", () => {
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(segment.tourContext, segment.id).toMatch(/^Örnek not matematik; /);
      expect(segment.examWord, segment.id).toMatch(/^(Yazılına|Sınavına|Vizene)$/);
      expect(segment.tourContext).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/i);
    }
    expect(audienceSegment("akademik").tab).toBe("⚖️ KPSS · TUS · DUS · ALES");
    expect(audienceSegment("akademik").tourContext).toContain("hazır müfredattan");
    expect(audienceSegment("universite").tourContext).toContain("vize");
  });
});

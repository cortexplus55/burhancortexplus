import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GUEST_TRACK_IDS,
  HERO_PICKS,
  guestDemoTrack,
  heroPickName,
  segmentForTrack,
  trackForSegment,
} from "@/lib/marketing/guest-demo-tracks";
import {
  AUDIENCE_SEGMENT_IDS,
  AUDIENCE_SEGMENTS,
  audienceSegment,
  DEFAULT_SEGMENT,
  isAudienceSegmentId,
  resolveSegmentParam,
} from "@/lib/marketing/landing-showcase";

/*
  Ana sayfa hedef kitle profilleri (7 Kasım 2026). Her profil kayıt sayfasına kendi `?hedef=` değeriyle gider. Kayıtsız
  vitrin 11 Kasım 2026'da 7 adımlı tura dönüştü (`misafir-turu.test.tsx`).

  Faz 9 (20 Kasım 2026): kahramanın dört sekmesi ile turun branş şeridi tek seçicide birleşti. Dört seçenek dört branş;
  profil beş (TUS kendi profili oldu). Eski bağlantılar (`?hedef=`) ve kampanya sözcükleri çalışmaya devam eder.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("hedef kitle profilleri", () => {
  it("beş profil, her biri kendi kayıt bağlantısıyla", () => {
    expect(AUDIENCE_SEGMENT_IDS).toEqual(["lise", "yks-lgs", "universite", "akademik", "tus"]);
    expect(AUDIENCE_SEGMENTS.map((segment) => segment.id)).toEqual([...AUDIENCE_SEGMENT_IDS]);
    for (const segment of AUDIENCE_SEGMENTS) {
      expect(segment.signupHref).toBe(`/kayit?hedef=${segment.id}`);
      expect(segment.lead.length).toBeGreaterThan(80);
      expect(segment.ctaLabel).toMatch(/ücretsiz başlat$/);
    }
    expect(audienceSegment("tus").ctaLabel).toBe("TUS kampını ücretsiz başlat");
    expect(audienceSegment(DEFAULT_SEGMENT).id).toBe("lise");
    expect(isAudienceSegmentId("lise")).toBe(true);
    expect(isAudienceSegmentId("tus")).toBe(true);
    expect(isAudienceSegmentId("ortaokul")).toBe(false);
  });

  it("adresten profil: ?hedef= (eski dört değer ve tus), yoksa utm anahtar kelimesi, yoksa hiç", () => {
    expect(resolveSegmentParam("?hedef=universite")).toBe("universite");
    expect(resolveSegmentParam("hedef=YKS-LGS")).toBe("yks-lgs");
    expect(resolveSegmentParam("?hedef=lise")).toBe("lise");
    expect(resolveSegmentParam("?hedef=akademik")).toBe("akademik");
    expect(resolveSegmentParam("?hedef=tus")).toBe("tus");
    expect(resolveSegmentParam("?hedef=TUS")).toBe("tus");
    expect(resolveSegmentParam("?utm_source=tiktok&utm_campaign=tyt-kamp-kasim")).toBe("yks-lgs");
    expect(resolveSegmentParam("?utm_campaign=kpss_2027")).toBe("akademik");
    expect(resolveSegmentParam("?utm_campaign=ales-hazirlik")).toBe("akademik");
    expect(resolveSegmentParam("?utm_term=dgs")).toBe("akademik");
    expect(resolveSegmentParam("?utm_content=yds_kelime")).toBe("akademik");
    // TUS ve DUS kendi profiline gider (Faz 9; önce akademik sekmenin içindeydi).
    expect(resolveSegmentParam("?utm_campaign=tus_2027")).toBe("tus");
    expect(resolveSegmentParam("?utm_content=dus-kampi")).toBe("tus");
    expect(resolveSegmentParam("?utm_term=TUS")).toBe("tus");
    // "tus" bir sözcüğün parçası olduğunda (ör. "status") profil seçmez.
    expect(resolveSegmentParam("?utm_campaign=status-guncelleme")).toBeNull();
    expect(resolveSegmentParam("?utm_content=vize-haftasi")).toBe("universite");
    expect(resolveSegmentParam("?utm_campaign=lise_yazili")).toBe("lise");
    expect(resolveSegmentParam("?hedef=bilinmeyen")).toBeNull();
    expect(resolveSegmentParam("?utm_campaign=genel")).toBeNull();
    expect(resolveSegmentParam("")).toBeNull();
    expect(resolveSegmentParam(null)).toBeNull();
  });

  it("YDT gibi üründe olmayan sınav adı ya da rakip adı geçmez; Plus özelliği vaat edilmez", () => {
    const text = AUDIENCE_SEGMENTS.map((segment) => `${segment.lead} ${segment.ctaLabel}`).join("\n");
    expect(text).not.toMatch(/\bYDT\b/);
    expect(text).not.toMatch(/astra/i);
    // 11 Kasım 2026: kahraman cümleleri yalnız ücretsizde de açık olanları sayar; Plus'ta olan (podcast, video,
    // sözlü, yazılı deneme, sınav sabahı kâğıdı) burada vaat edilmez, turun Plus adımında "Plus" rozetiyle gösterilir.
    expect(text).not.toMatch(/podcast|video|sözlü|yazılı deneme|ikiz sınav|sınav sabahı/i);
    // TUS'ta hazır müfredat yok (resmî kurulumda konu ağacı yok): TUS cümlesi "dosya yüklemeden" demez.
    expect(audienceSegment("tus").lead).not.toMatch(/dosya yüklemeden|hazır müfredat/i);
  });
});

describe("tek seçici: dört seçenek, dört branş", () => {
  it("seçenekler sırayla dört branş; her biri kendi profiline gider ve profil branşı geri açar", () => {
    expect(HERO_PICKS.map((pick) => pick.track)).toEqual([...GUEST_TRACK_IDS]);
    expect(HERO_PICKS.map((pick) => pick.segment)).toEqual(["lise", "universite", "tus", "akademik"]);
    expect(GUEST_TRACK_IDS.map(heroPickName)).toEqual([
      "Lise & YKS · Matematik",
      "Üniversite · Mühendislik",
      "TUS / Tıp · Farmakoloji",
      "KPSS / Hukuk · Anayasa",
    ]);
    for (const pick of HERO_PICKS) expect(trackForSegment(pick.segment)).toBe(pick.track);
  });

  it("her profil bir seçeneğe düşer: lise ve YKS/LGS 'Lise & YKS', üniversite, akademik KPSS, tus TUS", () => {
    expect(AUDIENCE_SEGMENT_IDS.map((segment) => trackForSegment(segment))).toEqual(["lise", "lise", "muhendislik", "hukuk", "tus"]);
  });

  it("seçenek seçilince profil: aynı branşın profili yerinde kalır (eski yks-lgs bağlantısı), değilse seçeneğin profili", () => {
    expect(segmentForTrack("lise", "yks-lgs")).toBe("yks-lgs");
    expect(segmentForTrack("lise", "lise")).toBe("lise");
    expect(segmentForTrack("lise", "tus")).toBe("lise");
    expect(segmentForTrack("muhendislik", "yks-lgs")).toBe("universite");
    expect(segmentForTrack("tus", "akademik")).toBe("tus");
    expect(segmentForTrack("tus", "tus")).toBe("tus");
    expect(segmentForTrack("hukuk", "tus")).toBe("akademik");
    expect(segmentForTrack("hukuk", "universite")).toBe("akademik");
    for (const track of GUEST_TRACK_IDS) {
      for (const segment of AUDIENCE_SEGMENT_IDS) expect(trackForSegment(segmentForTrack(track, segment))).toBe(track);
    }
  });

  it("her profilin turda bir branşı ve sınav sözü var", () => {
    for (const segment of AUDIENCE_SEGMENTS) {
      const track = guestDemoTrack(trackForSegment(segment.id));
      expect(track.file, segment.id).toMatch(/\.pdf$/);
      expect(segment.examWord, segment.id).toMatch(/^(Yazılına|Sınavına|Vizene)$/);
    }
    expect(audienceSegment("universite").examWord).toBe("Vizene");
    expect(audienceSegment("tus").examWord).toBe("Sınavına");
  });
});

describe("kahraman, seçici ve tur aynı durumu paylaşır", () => {
  it("adres replaceState ile güncellenir; tur seçili profili kayıt bağlantısına taşır; sayfa önbellekten gelir", () => {
    const hero = read("src/components/landing/audience-hero.tsx");
    expect(hero).toContain("resolveSegmentParam(window.location.search)");
    expect(hero).toContain("replaceState");
    expect(hero).toContain("<AudiencePicker value={trackId} onChange={pickTrack} controls=\"nasil\" />");
    expect(hero).toContain("<FuturisticGuidedJourney segmentId={segmentId} trackId={trackId} />");
    expect(hero).toContain("const next = segmentForTrack(track, segmentId);");
    expect(hero).toContain("href={segment.signupHref}");
    // Eski iki seçici (sekmeler ve branş şeridi) kalktı.
    expect(hero).not.toContain("AudienceTabs");
    expect(read("src/components/landing/futuristic-guided-journey.tsx")).not.toMatch(/lj-tracks|onTrackChange|JOURNEY_TRACKS_COPY/);
    const page = read("src/components/landing/landing-page.tsx");
    expect(page).toContain("<AudienceHero />");
    // Sayfa önbellekten gelmeye devam eder (O12): sunucu searchParams okumaz.
    expect(read("src/app/page.tsx")).not.toContain("searchParams");
  });
});

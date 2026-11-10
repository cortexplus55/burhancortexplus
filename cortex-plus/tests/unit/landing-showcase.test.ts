import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_SEGMENT_IDS,
  AUDIENCE_SEGMENTS,
  audienceSegment,
  bridgeCtaLabel,
  DEFAULT_SEGMENT,
  isAudienceSegmentId,
  resolveSegmentParam,
  SHOWCASE,
} from "@/lib/marketing/landing-showcase";

/*
  Ana sayfa hedef kitle sekmeleri ve kayıtsız canlı vitrin (7 Kasım 2026). Dört profil, her biri kayıt sayfasına
  kendi `?hedef=` değeriyle gider; vitrin modelsizdir (hiç ağ isteği yok) ve her örnek kendi içinde tutarlıdır:
  cevap şıklardan biri, "iki şık" çifti şıklardan ve cevabı içeriyor, ipucu cevabı söylemiyor.
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
      expect(bridgeCtaLabel(segment)).toContain(segment.campName);
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
    // Plus'ta olan tek vaat (video) etiketli; "gelişmiş model" gibi yasak sözler marketing-claims testinde.
    expect(text).toMatch(/Plus'ta bir dakikalık çizimli video/);
  });
});

describe("canlı vitrin içeriği", () => {
  for (const id of AUDIENCE_SEGMENT_IDS) {
    it(`${id}: soru kendi içinde tutarlı, ipucu cevabı söylemiyor`, () => {
      const item = SHOWCASE[id];
      const { question } = item;
      expect(question.options).toHaveLength(5);
      expect(new Set(question.options).size).toBe(5);
      expect(question.options).toContain(question.answer);
      expect(question.twoOption.pair).toContain(question.answer);
      for (const option of question.twoOption.pair) expect(question.options).toContain(option);
      expect(question.twoOption.pair[0]).not.toBe(question.twoOption.pair[1]);
      // İpucu iki şıkkın farkını hatırlatır; doğru şıkkı adıyla yazmaz.
      const answerWord = new RegExp(`(^|[^\\d%])${question.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\d])`);
      expect(question.twoOption.hint).not.toMatch(answerWord);
      expect(question.steps.length).toBeGreaterThanOrEqual(2);
      expect(item.trap.wrong).not.toBe(item.trap.right);
      expect(item.hook.body.length).toBeGreaterThan(40);
      expect(["analogy", "image", "shortcut"]).toContain(item.hook.kind);
    });
  }

  it("vitrin hiçbir ağ isteği yapmaz; içerik dosyası yalnız veri", () => {
    const component = read("src/components/landing/interactive-showcase.tsx");
    expect(component).not.toMatch(/fetch\(|\/api\/|axios|useSWR|openai/i);
    const data = read("src/lib/marketing/landing-showcase.ts");
    expect(data).not.toMatch(/^import /m);
    // Uydurma istatistik yok ("öğrencilerin %78'i …" gibi): sayılar yalnız örneklerin kendi hesabı.
    expect(data).not.toMatch(/öğrencilerin %\d+/i);
  });

  it("kahraman ve vitrin aynı sekme durumunu paylaşır; adres replaceState ile güncellenir", () => {
    const hero = read("src/components/landing/audience-hero.tsx");
    expect(hero).toContain("resolveSegmentParam(window.location.search)");
    expect(hero).toContain("replaceState");
    expect(hero).toContain("<InteractiveShowcase segmentId={segmentId}");
    expect(hero).toContain("href={segment.signupHref}");
    const page = read("src/components/landing/landing-page.tsx");
    expect(page).toContain("<AudienceHero />");
    // Sayfa önbellekten gelmeye devam eder (O12): sunucu searchParams okumaz.
    expect(read("src/app/page.tsx")).not.toContain("searchParams");
  });
});

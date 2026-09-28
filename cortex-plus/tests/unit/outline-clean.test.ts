import { describe, expect, it } from "vitest";
import {
  cleanOcrPageText,
  cleanOutlineDeterministic,
  detectPageFurniture,
  isHeadingCandidate,
  normalizeOutlineTitle,
  turkishTitleCase,
} from "@/lib/documents/outline-clean";
import { extractHeadings } from "@/lib/documents/page-analysis";
import { normalizeTopicTitle } from "@/lib/documents/topic-title";
import { chapterHeadings } from "@/lib/documents/topic-title";
import live111 from "../fixtures/scanned-outline/cortex-live-111.json";
import {
  ENGLISH_OCR_PAGES,
  NEUTRAL_SERIES_PAGES,
  SYNTHETIC_OCR_PAGES,
} from "../fixtures/scanned-outline/ocr-pages";

describe("cleanOcrPageText", () => {
  it("strips fences and markdown hashes, keeps LaTeX", () => {
    expect(cleanOcrPageText("```plaintext\nMerhaba\n```")).toBe("Merhaba");
    expect(cleanOcrPageText("## Başlık\nMetin")).toBe("Başlık\nMetin");
    expect(cleanOcrPageText("Enerji $E=mc^2$ korunur.")).toContain("$E=mc^2$");
    expect(cleanOcrPageText("[METIN_YOK]")).toBe("");
  });
});

describe("extractHeadings on OCR fixtures", () => {
  it("returns no code fence, question stem, option, or roman statement", () => {
    for (const page of SYNTHETIC_OCR_PAGES) {
      const headings = extractHeadings(page.text);
      for (const h of headings) {
        expect(h).not.toMatch(/```/);
        expect(h).not.toMatch(/aşağıdakilerden|which of the following/i);
        expect(h).not.toMatch(/^[A-E][).]\s/);
        expect(h).not.toMatch(/^(I|II|III)[.)]\s/);
      }
    }
  });
});

describe("detectPageFurniture", () => {
  it("detects KPSS series and YASAMA/YÜRÜTME unit runs", () => {
    const furniture = detectPageFurniture(
      SYNTHETIC_OCR_PAGES.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        pageKind: p.pageKind,
      })),
    );
    expect(furniture.seriesLabels.map((s) => s.toLocaleUpperCase("tr"))).toEqual(
      expect.arrayContaining(["KPSS"]),
    );
    const labels = furniture.unitRuns.map((u) => u.label.toLocaleUpperCase("tr"));
    expect(labels.some((l) => l.includes("YASAMA"))).toBe(true);
    expect(labels.some((l) => l.includes("YÜRÜTME") || l.includes("YURUTME"))).toBe(true);
  });

  it("detects neutral SERİ / ÜNİTE A without KPSS hardcoding", () => {
    const furniture = detectPageFurniture(
      NEUTRAL_SERIES_PAGES.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        pageKind: p.pageKind,
      })),
    );
    expect(
      furniture.seriesLabels.some((s) => /ser/i.test(s)) ||
        furniture.furnitureLines.some((l) => /SERİ|SERI/i.test(l)),
    ).toBe(true);
    expect(
      furniture.unitRuns.some((u) => /ünite|unite/i.test(u.label)) ||
        furniture.furnitureLines.some((l) => /ÜNİTE|UNITE/i.test(l)),
    ).toBe(true);
  });
});

describe("normalizeTopicTitle year rule", () => {
  it("keeps years and still strips chapter numbers", () => {
    expect(normalizeTopicTitle("1982 Anayasası'nın Temel İlkeleri")).toBe(
      "1982 Anayasası'nın Temel İlkeleri",
    );
    expect(normalizeOutlineTitle("1982 Anayasası'nın Temel İlkeleri")).toBe(
      "1982 Anayasası'nın Temel İlkeleri",
    );
    expect(normalizeTopicTitle("3. Dane Boyu")).toBe("Dane Boyu");
  });
});

describe("cleanOutlineDeterministic on cortex-live-111", () => {
  const titles = (live111 as string[]).map((title, index) => ({
    title,
    pageNumbers: [index * 2 + 1, index * 2 + 2],
  }));

  it("drops junk, strips series, keeps real topics, ≤80 before LLM", () => {
    const result = cleanOutlineDeterministic({
      titles,
      seriesLabels: ["KPSS"],
      unitRuns: [
        { label: "Yasama", pageNumbers: Array.from({ length: 20 }, (_, i) => 50 + i) },
        { label: "Yürütme", pageNumbers: Array.from({ length: 12 }, (_, i) => 70 + i) },
      ],
      contentPageCount: 200,
    });

    const dropLog = result.dropped.map((d) => `${d.reason}: ${d.title}`);
    // eslint-disable-next-line no-console
    console.log("outline-clean drops:\n" + dropLog.join("\n"));

    const droppedTitles = new Set(result.dropped.map((d) => d.title));
    const mustDrop = [
      "KPSS",
      "maddeye göre",
      "KPSS Test 1",
      "KPSS YASAMA",
      "```plaintext",
      "KPSS YÜRÜTME",
      "Durum",
      'Aşağıdakilerden hangisi ceza hukukunda "suçta',
      "Aşağıdakilerden hangisi, sosyal devletin özel-",
      "Anayasası'na göre, devletin şekli aşağıda-",
      "Aşağıdakilerden hangisi TBMM üyeliğinin düşme",
      "Aşağıdakilerden hangisinde milletvekilleri etkili",
      "Türkiye Büyük Millet Meclisi aşağıdakilerden",
      "Millî Güvenlik Kurulu ile ilgili aşağıdakilerden",
      "Aşağıdakilerden hangisi olağanüstü hâl ile ilgili",
      "Belediye kurulmasına ilişkin aşağıda verilen",
      "Aşağıdakilerden hangi ikisi arasındaki ilişki",
      "Aşağıdakilerden hangisinin kamu tüzel kişiliği",
      "Bir kimsenin kendi davranışı ile lehine haklar,",
      "Anayasası'nın değiştirilemeyecek hüküm-",
      "Milli Güvenlik Kuruluna Cumhurbaşkanı katıl-",
      '"Türkiye Devleti, ülkesi ve milletiyle bölünmez',
    ];
    for (const title of mustDrop) {
      expect(droppedTitles.has(title), `should drop: ${title}`).toBe(true);
    }

    const keptTitles = result.kept.map((k) => k.title);
    expect(keptTitles).toContain("Hukukun Temel Kavramları");
    expect(keptTitles.some((t) => /anayasa hukukuna giriş/i.test(t))).toBe(true);
    expect(keptTitles.some((t) => /temel hak ve hürriyetler/i.test(t))).toBe(true);
    expect(keptTitles.some((t) => /çalışma ve yargılama usulü/i.test(t))).toBe(true);

    // Sample of real topics kept (by source)
    const keptSources = new Set(result.kept.map((k) => k.sourceTitle));
    for (const sample of [
      "Suçun Unsurları",
      "Kişiler Hukuku",
      "Miras Hukuku",
      "Borçlar Hukuku ve Temel İlkeleri",
      "Devlet ve Hükümet Sistemleri",
      "Parlamenter Sistem",
      "Osmanlı Dönemi Anayasal Gelişmeler",
      "Din ve Vicdan Hürriyeti",
      "Düşünce ve İfade Hürriyeti",
      "TBMM Seçimleri ve Seçim Dönemi",
      "Yasama Sorumsuzluğu",
      "Kanunların Yapılması ve Yürürlüğe Girmesi",
      "Olağan Dönem Cumhurbaşkanlığı Kararnamesi",
      "Yargıtay ve Yüksek Mahkemeler",
      "Somut Norm Denetimi",
      "Adli Yargı Sistemi",
      "İdare Hukuku",
      "İnsan Hakları Kavramı",
      "İnsan Haklarının Sınıflandırılması",
      "Birleşmiş Milletler ve İnsan Hakları",
      "Avrupa Konseyi ve İnsan Hakları",
      "Türkiye'de İnsan Hakları Koruma Mekanizmaları",
    ]) {
      expect(keptSources.has(sample), `should keep: ${sample}`).toBe(true);
    }

    expect(result.kept.length).toBeLessThanOrEqual(80);

    // Coverage: every original page appears on some kept topic
    const allPages = new Set(result.kept.flatMap((k) => k.pageNumbers));
    for (const row of titles) {
      for (const p of row.pageNumbers) {
        expect(allPages.has(p), `page ${p} reattached`).toBe(true);
      }
    }

    // needsModelReview flags
    const reviewSources = result.kept
      .filter((k) => k.needsModelReview)
      .map((k) => k.sourceTitle);
    for (const ambiguous of [
      "Türk Medeni Kanunu’nda belirtilen kısıtlanma",
      "TBMM Başkanlığı için adaylıklar açıklandıktan",
      "TBMM'de grubu bulunan herhangi bir siyasi",
      "Başkomutanlık ve Genelkurmay Başkanlığına",
      "Valilerin belli konularda merkeze danışmadan",
    ]) {
      expect(
        reviewSources.includes(ambiguous) || droppedTitles.has(ambiguous),
        `needs review or drop: ${ambiguous}`,
      ).toBe(true);
    }
  });
});

describe("generality guards", () => {
  it("keeps zemin 8 numbered chapters as headings", () => {
    const chapters = [
      "1. Zeminin Oluşumu ve Üç Fazlı Sistem",
      "2. Faz Bağıntıları ve İndeks Özellikler",
      "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)",
      "4. Zeminde Su Akışı ve Permeabilite",
      "5. Efektif Gerilme İlkesi",
      "6. Yük Altında Gerilme Dağılımı",
      "7. Konsolidasyon ve Oturma",
      "8. Kayma Mukavemeti",
    ];
    const pages = chapters.map((c) => ({ headings: [c] }));
    expect(chapterHeadings(pages)).toEqual(chapters);
  });

  it("cleans English OCR book stems/options/headers", () => {
    for (const page of ENGLISH_OCR_PAGES) {
      const headings = extractHeadings(page.text);
      expect(headings.every((h) => isHeadingCandidate(h))).toBe(true);
      expect(headings.some((h) => /which of the following/i.test(h))).toBe(false);
      expect(headings.some((h) => /^[A-E][).]/.test(h))).toBe(false);
    }
    const furniture = detectPageFurniture(
      ENGLISH_OCR_PAGES.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        pageKind: "content",
      })),
    );
    expect(furniture.furnitureLines.some((l) => l.includes("|"))).toBe(true);
  });

  it("title-cases shouting OCR", () => {
    expect(turkishTitleCase("ÖLÜM KARİNESİ")).toBe("Ölüm Karinesi");
  });
});

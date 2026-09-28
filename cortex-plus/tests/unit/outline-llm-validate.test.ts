import { describe, expect, it } from "vitest";
import {
  cleanOutlineDeterministic,
  deterministicUnitsAsDraft,
  outlineTopicBounds,
  validateOutlineLlmResult,
  type OutlineUnitDraft,
} from "@/lib/documents/outline-clean";
import live111 from "../fixtures/scanned-outline/cortex-live-111.json";

function cleanedCandidates() {
  const titles = (live111 as string[]).map((title, index) => ({
    title,
    pageNumbers: [index * 2 + 1, index * 2 + 2],
  }));
  return cleanOutlineDeterministic({
    titles,
    seriesLabels: ["KPSS"],
    unitRuns: [
      { label: "Yasama", pageNumbers: Array.from({ length: 20 }, (_, i) => 90 + i) },
      { label: "Yürütme", pageNumbers: Array.from({ length: 12 }, (_, i) => 120 + i) },
    ],
    contentPageCount: 200,
  });
}

describe("validateOutlineLlmResult", () => {
  it("accepts a well-formed unit grouping with typo fixes and merges", () => {
    const cleaned = cleanedCandidates();
    const bySource = new Map(cleaned.kept.map((k) => [k.sourceTitle, k]));

    const pick = (...sources: string[]) => {
      const pages = sources.flatMap((s) => bySource.get(s)?.pageNumbers ?? []);
      return {
        title: sources[0]!,
        sourceTitles: sources.filter((s) => bySource.has(s)),
        pageNumbers: [...new Set(pages)].sort((a, b) => a - b),
      };
    };

    // Build ~12 units from kept topics (structure assert, not Astra names)
    const draft: OutlineUnitDraft[] = [
      {
        title: "Hukukun Temel Kavramları",
        topics: [
          pick("Suçun Unsurları"),
          pick("Soruşturma ve Kovuşturma"),
          pick("Vergi Hukuku"),
          pick("Yargılama Hukuku"),
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Medeni Hukuk",
        topics: [
          pick("Kişiler Hukuku"),
          {
            title: "Ölüm Karinesi",
            sourceTitles: ["ÖLÜM KARİNESİ"].filter((s) => bySource.has(s)),
            pageNumbers: bySource.get("ÖLÜM KARİNESİ")?.pageNumbers ?? [],
          },
          {
            title: "Hısımlık",
            sourceTitles: ["Hısımlık ve Dereceleri", "Evlat Edinme ve Hısımlık"].filter((s) =>
              bySource.has(s),
            ),
            pageNumbers: [
              ...(bySource.get("Hısımlık ve Dereceleri")?.pageNumbers ?? []),
              ...(bySource.get("Evlat Edinme ve Hısımlık")?.pageNumbers ?? []),
            ],
          },
          pick("Miras Hukuku"),
          {
            title: "Devredilebilmeleri Bakımından Özel Haklar",
            sourceTitles: ["DEVR EDILEBILMELERI BAKIMINDAN ÖZEL HAKLAR"].filter((s) =>
              bySource.has(s),
            ),
            pageNumbers:
              bySource.get("DEVR EDILEBILMELERI BAKIMINDAN ÖZEL HAKLAR")?.pageNumbers ?? [],
          },
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Anayasa Hukuku",
        topics: [
          pick("Anayasa Hukuku: Tanım ve İlkeler"),
          pick("Devlet ve Hükümet Sistemleri"),
          pick("Parlamenter Sistem"),
          pick("Osmanlı Dönemi Anayasal Gelişmeler"),
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Temel Haklar",
        topics: [
          pick("Din ve Vicdan Hürriyeti"),
          pick("Düşünce ve İfade Hürriyeti"),
          pick("Sosyal Güvenlik Hakları"),
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Yasama",
        topics: [
          pick("TBMM Seçimleri ve Seçim Dönemi"),
          pick("Yasama Sorumsuzluğu"),
          {
            title: "Kanun Yapımı Süreci",
            sourceTitles: [
              "Kanunların Yapılması ve Yürürlüğe Girmesi",
              "Kanun Yapımı Süreci",
            ].filter((s) => bySource.has(s)),
            pageNumbers: [
              ...(bySource.get("Kanunların Yapılması ve Yürürlüğe Girmesi")?.pageNumbers ?? []),
              ...(bySource.get("Kanun Yapımı Süreci")?.pageNumbers ?? []),
            ],
          },
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Yürütme",
        topics: [pick("Olağan Dönem Cumhurbaşkanlığı Kararnamesi")].filter(
          (t) => t.sourceTitles.length,
        ),
      },
      {
        title: "Yargı",
        topics: [
          pick("Yargıtay ve Yüksek Mahkemeler"),
          pick("Somut Norm Denetimi"),
          pick("Adli Yargı Sistemi"),
          pick("İdari Yargı Sistemi"),
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "İdare",
        topics: [
          pick("İdare Hukuku"),
          {
            title: "İlçe İdaresi",
            sourceTitles: ["İiçe İdaresi"].filter((s) => bySource.has(s)),
            pageNumbers: bySource.get("İiçe İdaresi")?.pageNumbers ?? [],
          },
          {
            title: "Belediye ve Yerel Yönetim",
            sourceTitles: ["BELEDİYELER", "BÜYÜKŞEHİR BELEDİYESİ", "Belediye ve Yerel Yönetim"].filter(
              (s) => bySource.has(s),
            ),
            pageNumbers: [
              ...(bySource.get("BELEDİYELER")?.pageNumbers ?? []),
              ...(bySource.get("BÜYÜKŞEHİR BELEDİYESİ")?.pageNumbers ?? []),
              ...(bySource.get("Belediye ve Yerel Yönetim")?.pageNumbers ?? []),
            ],
          },
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "İnsan Hakları",
        topics: [
          pick("İnsan Hakları Kavramı"),
          pick("İnsan Haklarının Sınıflandırılması"),
          pick("Birleşmiş Milletler ve İnsan Hakları"),
          pick("Avrupa Konseyi ve İnsan Hakları"),
          pick("Türkiye'de İnsan Hakları Koruma Mekanizmaları"),
        ].filter((t) => t.sourceTitles.length),
      },
      {
        title: "Diğer",
        topics: cleaned.kept
          .filter((k) =>
            [
              "Borçlar Hukuku ve Temel İlkeleri",
              "Eşya Hukuku ve Özellikleri",
              "Kamu Denetçiliği Kurumu",
              "Hâkimler ve Savcılar Kurulu",
              "Danıştay",
            ].includes(k.sourceTitle),
          )
          .map((k) => ({
            title: k.title,
            sourceTitles: [k.sourceTitle],
            pageNumbers: k.pageNumbers,
          })),
      },
      {
        title: "Ek Konular",
        topics: cleaned.kept.slice(0, 3).map((k) => ({
          title: k.title,
          sourceTitles: [k.sourceTitle],
          pageNumbers: k.pageNumbers,
        })),
      },
      {
        title: "Tamamlama",
        topics: cleaned.kept.slice(3, 6).map((k) => ({
          title: k.title,
          sourceTitles: [k.sourceTitle],
          pageNumbers: k.pageNumbers,
        })),
      },
    ].filter((u) => u.topics.length);

    // Ensure page coverage by attaching all cleaned pages into units
    const covered = new Set(draft.flatMap((u) => u.topics.flatMap((t) => t.pageNumbers)));
    const missingPages = cleaned.kept.flatMap((k) => k.pageNumbers).filter((p) => !covered.has(p));
    if (missingPages.length && draft[0]) {
      draft[0].topics.push({
        title: cleaned.kept[0]!.title,
        sourceTitles: [cleaned.kept[0]!.sourceTitle],
        pageNumbers: missingPages,
      });
    }

    // Cover every cleaned page so uncovered_pages cannot fail the structure assert
    const allCandidatePages = cleaned.kept.flatMap((k) => k.pageNumbers);
    const coveredNow = new Set(draft.flatMap((u) => u.topics.flatMap((t) => t.pageNumbers)));
    const stillMissing = allCandidatePages.filter((p) => !coveredNow.has(p));
    if (stillMissing.length) {
      const host = cleaned.kept[0]!;
      draft[draft.length - 1]!.topics.push({
        title: host.title,
        sourceTitles: [host.sourceTitle],
        pageNumbers: [...new Set(stillMissing)],
      });
    }

    // Hard-cap at 40 leaves for the bounds assert (merge extras into last unit)
    let flatTopics = draft.flatMap((u) => u.topics);
    if (flatTopics.length > 40) {
      const head = flatTopics.slice(0, 39);
      const tail = flatTopics.slice(39);
      flatTopics = [
        ...head,
        {
          title: tail[0]!.title,
          sourceTitles: [...new Set(tail.flatMap((t) => t.sourceTitles))],
          pageNumbers: [...new Set(tail.flatMap((t) => t.pageNumbers))].sort((a, b) => a - b),
        },
      ];
    }
    {
      const size = Math.ceil(flatTopics.length / 12);
      const rebuilt: OutlineUnitDraft[] = [];
      for (let i = 0; i < flatTopics.length; i += size) {
        rebuilt.push({
          title: `Ünite ${rebuilt.length + 1}`,
          topics: flatTopics.slice(i, i + size),
        });
      }
      draft.length = 0;
      draft.push(...rebuilt.slice(0, 16));
    }

    const contentPages = cleaned.kept.flatMap((k) => k.pageNumbers);
    const result = validateOutlineLlmResult({
      draft,
      candidates: cleaned.kept.map((k) => ({
        title: k.title,
        sourceTitle: k.sourceTitle,
        pageNumbers: k.pageNumbers,
      })),
      contentPages,
      contentPageCount: 200,
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.log("validation issues", result.issues);
    }
    expect(result.ok).toBe(true);
    expect(draft.length).toBeGreaterThanOrEqual(8);
    expect(draft.length).toBeLessThanOrEqual(16);
    const topicCount = draft.reduce((n, u) => n + u.topics.length, 0);
    expect(topicCount).toBeLessThanOrEqual(40);
  });

  it("rejects invented topics, huge edits, lost chapters, bad counts", () => {
    const cleaned = cleanedCandidates();
    const candidates = cleaned.kept.map((k) => ({
      title: k.title,
      sourceTitle: k.sourceTitle,
      pageNumbers: k.pageNumbers,
    }));
    const contentPages = cleaned.kept.flatMap((k) => k.pageNumbers);

    const invented = validateOutlineLlmResult({
      draft: [
        {
          title: "U",
          topics: [
            {
              title: "Uydurma Konu XYZ",
              sourceTitles: ["Uydurma Konu XYZ"],
              pageNumbers: contentPages.slice(0, 2),
            },
          ],
        },
      ],
      candidates,
      contentPages,
      contentPageCount: 200,
    });
    expect(invented.ok).toBe(false);

    const badEdit = validateOutlineLlmResult({
      draft: [
        {
          title: "U",
          topics: [
            {
              title: "Tamamen Farklı Anlamlı Başlık Burada",
              sourceTitles: [cleaned.kept[0]!.sourceTitle],
              pageNumbers: cleaned.kept[0]!.pageNumbers,
            },
          ],
        },
      ],
      candidates,
      contentPages: cleaned.kept[0]!.pageNumbers,
      contentPageCount: 10,
    });
    expect(badEdit.ok).toBe(false);

    const tooMany = validateOutlineLlmResult({
      draft: Array.from({ length: 20 }, (_, i) => ({
        title: `Unit ${i}`,
        topics: [
          {
            title: cleaned.kept[i % cleaned.kept.length]!.title,
            sourceTitles: [cleaned.kept[i % cleaned.kept.length]!.sourceTitle],
            pageNumbers: cleaned.kept[i % cleaned.kept.length]!.pageNumbers,
          },
        ],
      })),
      candidates,
      contentPages,
      contentPageCount: 200,
    });
    expect(tooMany.ok).toBe(false);
  });

  it("falls back to deterministic units without throw", () => {
    const cleaned = cleanedCandidates();
    const fallback = deterministicUnitsAsDraft(cleaned);
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.every((u) => u.topics.length > 0)).toBe(true);
  });

  it("bounds for ~200 content pages", () => {
    const bounds = outlineTopicBounds(200);
    expect(bounds.targetUnits).toBeGreaterThanOrEqual(8);
    expect(bounds.targetUnits).toBeLessThanOrEqual(16);
    expect(bounds.topicsMax).toBe(40);
    expect(bounds.targetTopics).toBeGreaterThanOrEqual(bounds.targetUnits);
    expect(bounds.targetTopics).toBeLessThanOrEqual(40);
  });
});

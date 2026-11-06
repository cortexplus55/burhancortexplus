import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Paket 3 (6 Kasım 2026, 360° denetim):
  - Müfredat kazanım sayfaları ~68 kelimeydi; artık havuzdaki doğrulanmış ünite dersinin bu kazanıma ait bölümünü,
    kilit noktaları, kavramları ve bir örnek soruyu gösterir (model çağrısı yok). Örnek sorunun doğru cevabı ve
    açıklaması sayfaya GİRMEZ (soru bankası anahtarıyla herkese kapalı). Havuz bölümü yoksa sayfa noindex.
  - Reklam ifadeleri: "%100 Uyum", "ÖSYM Formatı", "Kanıtlanmış Öğrenme Kazanımı", "Anında İntikam" kalktı.
*/

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

type Row = Record<string, unknown>;

function fakeService(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => Object.assign(Promise.resolve({ data: rows, error: null }), { maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return chain;
    },
  } as never;
}

describe("kazanım sayfası havuz ön izlemesi", async () => {
  const { loadOutcomePreview, previewWordCount } = await import("@/lib/curriculum/outcome-preview");
  const { poolUnit } = await import("@/lib/content-pool/keys");
  const { CONTENT_VERSION } = await import("@/lib/content-pool/keys");
  const { CURRICULUM } = await import("@/lib/curriculum/registry");

  const program = CURRICULUM.programs.find((p) => p.units.some((u) => u.outcomes.length >= 2))!;
  const unitIndex = program.units.findIndex((u) => u.outcomes.length >= 2);
  const unit = poolUnit(`${program.id}#${unitIndex + 1}`)!;
  const code = unit.outcomes[1]!.code;

  const lesson = {
    title: "Ünite",
    overview: "Bu ünite temel kavramları ve aralarındaki ilişkileri anlatır.",
    summary: "Özet metni burada.",
    sections: [
      { outcome_code: unit.outcomes[0]!.code, heading: "Birinci", explanation: "Birinci kazanımın anlatımı yeterince uzun bir metin.", key_points: ["a"] },
      {
        outcome_code: code,
        heading: "İkinci kazanım başlığı",
        explanation: "**Hücre zarı** seçici geçirgendir ve maddelerin geçişini düzenler. Bu bölüm kazanımı anlatır.",
        key_points: ["Seçici geçirgenlik", "Difüzyon yüksekten düşüğe"],
        worked_example: "Örnek: tuzlu suya konan hücre su kaybeder.",
        common_mistakes: ["Osmozu difüzyonla karıştırmak"],
        steps: ["Ortamı belirle", "Yoğunluğu karşılaştır"],
        ladder: { temel: "Zar seçicidir.", orta: "Taşıma türleri ayrılır.", ileri: "Aktif taşıma enerji ister." },
      },
    ],
    key_terms: [
      { term: "Hücre zarı", definition: "Hücreyi çevreleyen seçici geçirgen yapı." },
      { term: "Ribozom", definition: "Protein sentezi yapan organel." },
    ],
    cards: [{ front: "a", back: "b" }],
  };

  it("bu kazanımın bölümünü, kilit noktaları, hataları ve geçen kavramları okur", async () => {
    const service = fakeService({
      topic_content: [{ body: lesson, unit_sha256: unit.sha256, version: CONTENT_VERSION }],
      item_bank: [{ stem: "Hücre zarı için hangisi doğrudur?", choices: ["A", "B", "C", "D", "E"], difficulty: "easy", answer: 2, explanation: "GİZLİ AÇIKLAMA" }],
    });
    const preview = await loadOutcomePreview(service, { programId: program.id, unitIndex, outcomeCode: code, outcomeIndex: 1 });
    expect(preview).not.toBeNull();
    expect(preview!.heading).toBe("İkinci kazanım başlığı");
    expect(preview!.keyPoints).toHaveLength(2);
    expect(preview!.commonMistakes).toEqual(["Osmozu difüzyonla karıştırmak"]);
    expect(preview!.steps).toEqual(["Ortamı belirle", "Yoğunluğu karşılaştır"]);
    expect(preview!.ladder?.ileri).toBe("Aktif taşıma enerji ister.");
    expect(preview!.unitSummary).toBe("Özet metni burada.");
    // Tekrar kartları (kısa dersli sayfalar 300 kelimenin altında kalmasın diye): ders içeriği, en çok 6.
    expect(preview!.cards).toEqual([{ front: "a", back: "b" }]);
    // Yalnız bölümde geçen kavram (Ribozom geçmiyor).
    expect(preview!.keyTerms.map((t) => t.term)).toEqual(["Hücre zarı"]);
    expect(preview!.sampleQuestion).toEqual({ stem: "Hücre zarı için hangisi doğrudur?", choices: ["A", "B", "C", "D", "E"] });
    // Cevap anahtarı ve açıklama ön izlemeye hiç girmez.
    expect(JSON.stringify(preview)).not.toContain("GİZLİ AÇIKLAMA");
    expect(preview!.sampleQuestion).not.toHaveProperty("answer");
    expect(previewWordCount(preview!, unit.outcomes[1]!.text)).toBeGreaterThan(40);
  });

  it("ders bayatsa (ünite özeti değişmiş) ya da havuzda yoksa null", async () => {
    const stale = fakeService({ topic_content: [{ body: lesson, unit_sha256: "eski" }], item_bank: [] });
    expect(await loadOutcomePreview(stale, { programId: program.id, unitIndex, outcomeCode: code, outcomeIndex: 1 })).toBeNull();
    const empty = fakeService({ topic_content: [], item_bank: [] });
    expect(await loadOutcomePreview(empty, { programId: program.id, unitIndex, outcomeCode: code, outcomeIndex: 1 })).toBeNull();
  });

  it("sayfa: soru bankasından cevap ve açıklama okunmaz, havuz yoksa noindex, yapılandırılmış veri var", () => {
    const helper = read("src/lib/curriculum/outcome-preview.ts");
    expect(helper).toMatch(/\.select\("stem, choices, difficulty"\)/);
    expect(helper).not.toMatch(/select\([^)]*answer/);
    expect(helper).not.toMatch(/select\([^)]*explanation/);
    const page = read("src/app/mufredat/[programId]/[unitId]/[outcomeId]/page.tsx");
    expect(page).toMatch(/robots: \{ index: false, follow: true \}/);
    expect(page).toContain('"@type": "LearningResource"');
    expect(page).toContain('.replace(/</g, "\\\\u003c")');
    expect(page).toContain('data-testid="sample-question"');
    expect(page).toContain('data-testid="sibling-outcomes"');
    expect(page).toContain('data-testid="review-cards"');
  });
});

describe("reklam ifadeleri", () => {
  it("mutlak ve kanıtlanamayan iddialar yok; yeni ifadeler yerinde", async () => {
    const { allAdvantageCopy, BLIND_EXPERIMENT_PROOF } = await import("@/lib/marketing/advantage-content");
    const copy = allAdvantageCopy();
    for (const banned of ["%100", "ÖSYM Formatı", "Kanıtlanmış", "İntikam", "Tam Uyumlu"]) expect(copy).not.toContain(banned);
    expect(copy).toContain("MEB Kazanımları ve ÖSYM Kılavuzlarına Dayalı");
    expect(copy).toContain("5 Şıklı (A–E) Türkiye Sınav Standardı");
    expect(BLIND_EXPERIMENT_PROOF.kicker).toContain("Örnek Senaryo Deneyinde 35 → 100 Puan Gelişimi");
    expect(BLIND_EXPERIMENT_PROOF.body).toContain("Yapay zekâyla canlandırılan");
  });
});

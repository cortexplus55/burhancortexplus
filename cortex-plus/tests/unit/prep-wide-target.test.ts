import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { fakeSupabase, has, type FakeCall } from "./helpers/query-recorder";
import { findTopicRow, prepWideTargetTopic } from "@/lib/learning/prep-wide-target";
import { retargetNodeTopic } from "@/lib/learning/prep-wide-target-server";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";

/*
  Hazırlık geneli düğümler (20 Ekim 2026): "Bilgi boşlukları", "Kartlarla son tekrar", odaklı
  pratik ve son kontrol yazılı denemenin metasını, yani 1. konuyu devralıyordu. Öğrenci Basınç'ta
  zorlanırken boşluk testi 1. konunun sayfalarından yazılıyordu.
*/

const planned = ["Isı ve sıcaklık", "Basınç", "Kaldırma kuvveti"];
const mastery = (topicKey: string, over: Partial<TopicMasterySnapshot> = {}): TopicMasterySnapshot => ({
  topicKey,
  measured: true,
  level: "emerging",
  confidence: 60,
  evidenceCount: 4,
  firstAttemptCorrect: 3,
  firstAttemptTotal: 4,
  independentCorrect: 3,
  independentTotal: 4,
  lastPracticedAt: "2026-10-15T09:00:00.000Z",
  ...over,
});
const base = { requestedTopic: "", adaptiveFocus: null, practiceTopics: [] as string[], mastery: [] as TopicMasterySnapshot[], plannedTopics: planned };

describe("prepWideTargetTopic", () => {
  it("boşluk, odaklı pratik: en zayıf planlı konu; son kontrol bütün konulardır (yeniden hedeflenmez)", () => {
    for (const kind of ["gaps", "focused"] as const) {
      expect(prepWideTargetTopic({ ...base, kind, practiceTopics: ["basınç", "Isı ve sıcaklık"] })).toBe("Basınç");
      expect(prepWideTargetTopic({ ...base, kind })).toBeNull();
    }
    // Paket I #8 (30 Ekim 2026): son kontrol konu başına bir soru sorar (P1-4); tek konuya daraltılmaz, adı
    // "Tüm konular". Önceden tek zayıf konuya yöneliyor ama etiket 1. konu kalıyordu.
    expect(prepWideTargetTopic({ ...base, kind: "final_check", practiceTopics: ["Basınç"] })).toBeNull();
  });

  it("planda olmayan zayıf konu atlanır", () => {
    expect(prepWideTargetTopic({ ...base, kind: "gaps", practiceTopics: ["Sohbette serbest konu", "Kaldırma kuvveti"] })).toBe(
      "Kaldırma kuvveti",
    );
  });

  it("son kartlar: zayıf konu yoksa en düşük ölçülen başarı, eşitlikte en uzun süredir çalışılmayan", () => {
    expect(
      prepWideTargetTopic({
        ...base,
        kind: "flashcards",
        mastery: [
          mastery("ısı ve sıcaklık", { lastPracticedAt: "2026-10-18T09:00:00.000Z" }),
          mastery("kaldırma kuvveti", { lastPracticedAt: "2026-10-12T09:00:00.000Z" }),
        ],
      }),
    ).toBe("Kaldırma kuvveti");
    // Paket I #8: yüzde ham sayılardan (kayıtlı confidence okunmaz, Paket C kuralı); zor konu önce gelir,
    // eski çalışılan konu değil. Önceden kartlar hedefin üstündeki 2. haftanın konusundan çıkıyordu.
    expect(
      prepWideTargetTopic({
        ...base,
        kind: "flashcards",
        mastery: [
          mastery("ısı ve sıcaklık", { lastPracticedAt: "2026-10-01T09:00:00.000Z", independentCorrect: 4, firstAttemptCorrect: 4 }),
          mastery("basınç", { lastPracticedAt: "2026-10-18T09:00:00.000Z", independentCorrect: 1, firstAttemptCorrect: 1 }),
        ],
      }),
    ).toBe("Basınç");
    expect(prepWideTargetTopic({ ...base, kind: "flashcards", practiceTopics: ["Basınç"] })).toBe("Basınç");
  });

  it("seçilen konu (?konu=) ve uyarlamalı odaklı pratiğin kendi konusu kazanır; konuya bağlı türler dokunulmaz", () => {
    expect(prepWideTargetTopic({ ...base, kind: "gaps", requestedTopic: "Isı ve sıcaklık", practiceTopics: ["Basınç"] })).toBeNull();
    expect(prepWideTargetTopic({ ...base, kind: "focused", adaptiveFocus: "Isı ve sıcaklık", practiceTopics: ["Basınç"] })).toBeNull();
    for (const kind of ["quiz", "lesson", "podcast", "oral", "spaced"] as const) {
      expect(prepWideTargetTopic({ ...base, kind, practiceTopics: ["Basınç"] })).toBeNull();
    }
  });

  it("konu kaydı: birebir ya da istenenin uzantısı; çok konulu istek tek konuya daralmaz", () => {
    const rows = [{ label: "Stokiyometri: sınırlayıcı bileşen" }, { label: "Gazlar" }, { label: "A" }];
    expect(findTopicRow(rows, "gazlar")?.label).toBe("Gazlar");
    expect(findTopicRow(rows, "Stokiyometri")?.label).toBe("Stokiyometri: sınırlayıcı bileşen");
    expect(findTopicRow(rows, "A, B")).toBeNull();
    expect(findTopicRow(rows, "")).toBeNull();
  });
});

const topicRows = [
  { id: "t1", label: "Isı ve sıcaklık", document_topic_node_id: "dn1", source_refs: [{ page: 1 }], measured_level: null },
  { id: "t2", label: "Basınç", document_topic_node_id: "dn2", source_refs: [{ page: 7 }], measured_level: "weak" },
];

function prepHandler(options: { weakMastery?: boolean } = {}) {
  return (call: FakeCall) => {
    if (call.table === "exam_prep_topics") return { data: topicRows };
    if (call.table === "exam_prep_topic_mastery") {
      return {
        data: options.weakMastery
          ? [{ topic_key: "basınç", measured_level: "weak", confidence: 20, evidence_count: 4, independent_correct: 1, independent_total: 4 }]
          : [],
      };
    }
    if (call.table === "exam_prep_misconceptions") return { data: [] };
    if (call.table === "exam_prep_nodes") {
      return {
        data: [
          { session_meta: { topicId: "dn1", topicTitle: "Isı ve sıcaklık", sourcePages: [1, 2] } },
          { session_meta: { topicId: "dn2", topicTitle: "Basınç", sourcePages: [7, 8] } },
          { session_meta: { topicId: "dn2", topicTitle: "Basınç", sourcePages: [9] } },
        ],
      };
    }
    if (call.table === "document_topic_nodes") return { data: { document_id: "doc-1" } };
    return {};
  };
}

describe("retargetNodeTopic", () => {
  const input = {
    userId: "u1",
    prepId: "p1",
    requestedTopic: "",
    adaptiveFocus: null,
    practiceTopics: undefined as string[] | undefined,
    inheritedTopicTitle: "Isı ve sıcaklık",
    currentTopicId: "t1",
  };

  it("Bilgi boşlukları zayıf konuya yönelir: o konunun kaydı, belgesi ve ders sayfaları", async () => {
    const fake = fakeSupabase(prepHandler());
    const result = await retargetNodeTopic(fake.service as never, { ...input, kind: "gaps", practiceTopics: ["Basınç"] });
    expect(result).toMatchObject({
      topic: { id: "t2", label: "Basınç", source_refs: [{ page: 7 }] },
      metaTopicId: "dn2",
      topicDocumentId: "doc-1",
      topicNodeId: "dn2",
      sourcePages: [7, 8, 9],
      reason: "weakest",
    });
    const lessons = fake.calls.find((call) => call.table === "exam_prep_nodes")!;
    expect(has(lessons, "eq", "kind", "lesson")).toBe(true);
  });

  it("son kartlar hafif okumanın zayıf konusuna yönelir", async () => {
    const fake = fakeSupabase(prepHandler({ weakMastery: true }));
    const result = await retargetNodeTopic(fake.service as never, { ...input, kind: "flashcards" });
    expect(result?.topic.label).toBe("Basınç");
  });

  it("?konu= düğümün konusu değilse istenen konunun kaydı okunur", async () => {
    const fake = fakeSupabase(prepHandler());
    const result = await retargetNodeTopic(fake.service as never, { ...input, kind: "flashcards", requestedTopic: "Basınç" });
    expect(result).toMatchObject({ topic: { id: "t2" }, reason: "requested" });
    // Sözlü de (30 Ekim 2026): tek konu seçildiyse o konunun kaydı; birleşik "A, B" adı hiçbir konuya eşleşmez.
    expect(await retargetNodeTopic(fake.service as never, { ...input, kind: "oral", requestedTopic: "Basınç" })).toMatchObject({
      topic: { id: "t2" },
      reason: "requested",
    });
    expect(
      await retargetNodeTopic(fake.service as never, { ...input, kind: "oral", requestedTopic: "Isı ve sıcaklık, Basınç" }),
    ).toBeNull();
    // Kimlikle (konu seçicinin kimliği): ad yerine kimlik çözülür; belge konu düğümü kimliği de tanınır.
    expect(
      await retargetNodeTopic(fake.service as never, { ...input, kind: "oral", requestedTopic: "Başka ad", requestedTopicId: "t2" }),
    ).toMatchObject({ topic: { id: "t2" }, metaTopicId: "dn2", reason: "requested" });
  });

  it("hedef zaten düğümün konusuysa, kayıt yoksa ya da zayıf konu yoksa değişiklik yok", async () => {
    const fake = fakeSupabase(prepHandler());
    expect(await retargetNodeTopic(fake.service as never, { ...input, kind: "gaps", practiceTopics: ["Isı ve sıcaklık"] })).toBeNull();
    expect(await retargetNodeTopic(fake.service as never, { ...input, kind: "gaps", practiceTopics: ["Olmayan konu"] })).toBeNull();
    expect(await retargetNodeTopic(fake.service as never, { ...input, kind: "gaps", practiceTopics: [] })).toBeNull();
    expect(
      await retargetNodeTopic(fake.service as never, { ...input, kind: "focused", adaptiveFocus: "Isı ve sıcaklık", practiceTopics: ["Basınç"] }),
    ).toBeNull();
  });

  it("rota: yeniden hedef yerel oturumdan sonra, önceden yazım anahtarından ve kaynak çözümünden önce", () => {
    const route = readSource("src/app/api/learning/exam-prep/node/route.ts").replace(/\r\n/g, "\n");
    const at = route.indexOf("const retarget = await retargetNodeTopic(service, {");
    expect(at).toBeGreaterThan(route.indexOf("practiceTopics = local.topics;"));
    expect(at).toBeLessThan(route.indexOf("const variant = prefetchVariant(kind, {"));
    expect(at).toBeLessThan(route.indexOf("const mappedPages = topicWiden ? undefined : sessionMeta?.sourcePages;"));
    // İçerik sorulan konunun adını taşır: bitişte kanıt ve yanılgı o konuya.
    expect(route).toContain("payload = { ...payload, testedTopic: retargetedTopic }");
    expect(route.indexOf("testedTopic: retargetedTopic")).toBeLessThan(route.indexOf("const total = countTotal(kind, payload);"));
  });
});

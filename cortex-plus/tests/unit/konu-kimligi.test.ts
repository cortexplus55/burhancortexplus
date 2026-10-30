import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepTopicMatch, resolvePrepTopicRow } from "@/lib/learning/prep-topic-lookup";

/*
  Tek konu kimliği (30 Ekim 2026). Canlı tur: ders sonu "Şimdi dinle" 404 döndü. Ders düğümünün
  `session_meta.topicId` alanı belgeden gelen konu düğümünü (`document_topic_node_id`) tutuyordu; uç ise konuyu
  yalnız `exam_prep_topics.id` ile arıyordu. Canlıda konu kimliği taşıyan 1.851 yol adımının 1.830'u böyleydi.
  Kural: konu kimliği alan her yer `resolvePrepTopicRow` ile arar (iki kimliği de tanır); istemciye konunun gerçek
  kimliği verilir.
*/

function fakeClient(rows: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select(columns: string) {
          calls.push(`select:${columns}`);
          return {
            eq(column: string, value: string) {
              calls.push(`eq:${column}=${value}`);
              return {
                or(filter: string) {
                  calls.push(`or:${filter}`);
                  return {
                    limit: () => ({
                      maybeSingle: async () => {
                        const ids = filter.split(",").map((part) => part.split(".eq.")[1]);
                        const row = rows.find(
                          (r) => r.exam_prep_id === value && (ids.includes(String(r.id)) || ids.includes(String(r.document_topic_node_id))),
                        );
                        return { data: row ?? null, error: null };
                      },
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const rows = [
  { id: "prep-topic-1", document_topic_node_id: "doc-node-1", exam_prep_id: "prep-A", label: "Enflasyon" },
  { id: "prep-topic-2", document_topic_node_id: null, exam_prep_id: "prep-A", label: "Fotosentez" },
  { id: "prep-topic-3", document_topic_node_id: "doc-node-3", exam_prep_id: "prep-B", label: "Sözleşme" },
];

describe("konu iki kimliğinden biriyle bulunur", () => {
  it("belge konu düğümü kimliğiyle de, konu satırı kimliğiyle de aynı satır gelir", async () => {
    const { client } = fakeClient(rows);
    expect((await resolvePrepTopicRow(client, "prep-A", "doc-node-1", "id, label"))?.id).toBe("prep-topic-1");
    expect((await resolvePrepTopicRow(client, "prep-A", "prep-topic-1", "id, label"))?.id).toBe("prep-topic-1");
    expect((await resolvePrepTopicRow(client, "prep-A", "prep-topic-2"))?.id).toBe("prep-topic-2");
  });

  it("başka hazırlığın konusu, boş ve güvensiz kimlik bulunmaz", async () => {
    const { client, calls } = fakeClient(rows);
    expect(await resolvePrepTopicRow(client, "prep-A", "doc-node-3")).toBeNull();
    expect(await resolvePrepTopicRow(client, "prep-A", "")).toBeNull();
    expect(await resolvePrepTopicRow(client, "prep-A", "x,id.neq.0")).toBeNull();
    expect(prepTopicMatch("x,id.neq.0")).toBeNull();
    expect(calls.filter((call) => call.startsWith("or:"))).toEqual(["or:id.eq.doc-node-3,document_topic_node_id.eq.doc-node-3"]);
  });

  it("istenen sütunlara id her zaman eklenir", async () => {
    const { client, calls } = fakeClient(rows);
    await resolvePrepTopicRow(client, "prep-A", "doc-node-1", "label, lesson_id");
    expect(calls).toContain("select:id, label, lesson_id");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("bekçi: konu yalnız konu satırı kimliğiyle aranmaz", () => {
  it("dışarıdan gelen konu kimliğiyle exam_prep_topics'i yalnız id üzerinden arayan sorgu yok", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.includes('from("exam_prep_topics")')) return;
        const window = lines.slice(index, index + 5).join("\n");
        if (/\.select\(/.test(window) && /\.eq\("id",\s*(topicId|input\.topicId|parsed\.data\.topicId|body\.topicId)\)/.test(window)) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("ders ekranı istemciye konunun gerçek kimliğini verir", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain("topicId={topicRowId ?? topicId ?? null}");
  });
});

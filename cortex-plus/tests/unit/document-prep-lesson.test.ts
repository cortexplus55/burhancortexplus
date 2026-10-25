import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lessonScreenSchema } from "@/lib/learning/lesson-v3";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";

// 18 Ekim 2026, Pediatri belgesi (10 sayfa) öğrenci gözüyle incelendi.
describe("document prep lesson keeps the source table", () => {
  it("accepts the 7-row growth milestones table (2 ay … 3 yaş, 4 columns)", () => {
    const rows = [
      ["2 ay", "Başını kısa süre kaldırır", "Sosyal gülümseme", "Sese yönelme / vokalizasyon"],
      ["6 ay", "Destekli oturur, döner", "Nesneyi elden ele geçirir", "Hece benzeri sesler"],
      ["9 ay", "Desteksiz oturur, emekleyebilir", "Yabancı kaygısı, pincer başlangıcı", "“Ba-ba/ma-ma” benzeri heceler"],
      ["12 ay", "Tutunarak/yürüyerek ilerler", "İşaret eder, ince pincer", "1-3 anlamlı kelime"],
      ["18 ay", "İyi yürür, koşmaya başlar", "Kaşık kullanmayı dener", "Yaklaşık 10-20 kelime"],
      ["2 yaş", "Merdiven çıkar, topa vurur", "Basit taklit oyunu", "2 kelimeli cümleler"],
      ["3 yaş", "Üç tekerlekli bisiklet", "Daire kopyalar", "Konuşmanın çoğu anlaşılır"],
    ];
    const screen = lessonScreenSchema.parse({
      heading: "Gelişim basamakları",
      concept: "Gelişim basamakları ve alarm bulguları",
      blocks: [
        { type: "text", text: "Tabloda her yaş satırını soldan sağa oku: kaba motor, ince motor/sosyal, dil." },
        { type: "table", table: { columns: ["Yaş", "Kaba motor", "İnce motor / sosyal", "Dil"], rows } },
      ],
    });
    const table = screen.blocks.find((block) => block.type === "table");
    expect(table?.type === "table" ? table.table.rows.length : 0).toBe(7);
  });
});

describe("document prep topic lookup", () => {
  it("matches the prep topic by its own id or by the document topic node id", () => {
    const id = "c5a5eaff-f4a8-40c6-bd6a-d5cd5715dc63";
    expect(prepTopicMatch(id)).toBe(`id.eq.${id},document_topic_node_id.eq.${id}`);
    expect(prepTopicMatch("x,id.neq.0")).toBeNull();
  });

  it("is used where the node's topic is read", () => {
    for (const file of [
      "src/app/api/learning/exam-prep/node/route.ts",
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx",
      "src/lib/learning/lesson-prefetch.ts",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("prepTopicMatch(");
    }
  });
});

describe("a concept that could not be written is not hidden", () => {
  it("stores the missing concepts and names them on the lesson's end screen", () => {
    expect(readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8")).toContain("missingConcepts: outcome.dropped");
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).not.toContain("Bu derste yer almayan bölüm");
    expect(session).toContain("Bu bölüm bu sefer yetişmedi");
    expect(session).toContain("Konu testi bu bölümden soru");
    expect(session).toContain("Dersin hazır olan kısmı bu kadar");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/*
  Test içi eğitmen notu bilir (6 Kasım 2026, canlı telefon denetiminde bulundu). Ders notun "bir sabit şu değerle
  alınacak" kuralını uyguladı; aynı konunun testindeki eğitmen genel bilgideki yaklaşık değeri söyledi. Eğitmen
  hazırlığın belgelerini hiç görmüyordu. Artık ana hazırlık sohbetiyle aynı okuyucudan pasajlar, notun özel kuralları
  ve kaynak sayı önceliği istemde. Örnekler başka derslerden; kodda ders terimi ya da sayı yok.
*/

vi.mock("server-only", () => ({}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("notun özel kuralları (modelsiz)", async () => {
  const { extractSourceRules, sourceRulesBlock, loadSourceRules, SOURCE_RULE_PAGE_REGEX } = await import(
    "@/lib/learning/source-rules"
  );

  it("sayı ve belirleme sözü birlikte geçen satırlar alınır", () => {
    const text = [
      "Geometri özeti",
      "Bu sınavda π sayısı 3 alınacaktır.",
      "- Kur hesaplarında 1 USD = 30 TL kabul edilir",
      "log 2 = 0,3 alınız.",
      "SONUÇLAR VİRGÜLDEN SONRA 2 BASAMAĞA YUVARLANIR",
      "Satın alınacak 3 paket için bütçe yazılır.",
      "Bu konu sınavda önemlidir ve dikkat ister.",
      "Değerler tablodan alınır.",
    ].join("\n");
    expect(extractSourceRules(text)).toEqual([
      "Bu sınavda π sayısı 3 alınacaktır.",
      "Kur hesaplarında 1 USD = 30 TL kabul edilir",
      "log 2 = 0,3 alınız.",
      "SONUÇLAR VİRGÜLDEN SONRA 2 BASAMAĞA YUVARLANIR",
    ]);
  });

  it("aynı kural iki kez yazılmaz, sayı sınırı tutulur, uzun satırdan kuralın cümlesi alınır", () => {
    const long = `${"Bu bölümde birçok kavram anlatılır ve örneklerle açıklanır. ".repeat(5)}Hesaplarda e sayısı 2,7 alınır. Son cümle.`;
    const rules = extractSourceRules(["π sayısı 3 alınacak", "π sayısı 3 alınacak.", long].join("\n"));
    expect(rules).toEqual(["π sayısı 3 alınacak", "Hesaplarda e sayısı 2,7 alınır."]);
    const many = Array.from({ length: 12 }, (_, i) => `Katsayı k${i} = ${i + 1} alınır.`).join("\n");
    expect(extractSourceRules(many)).toHaveLength(6);
  });

  it("istem bloğu notun değerini genel bilgiye üstün tutar; kural yoksa blok yok", () => {
    expect(sourceRulesBlock([])).toBe("");
    const block = sourceRulesBlock(["π sayısı 3 alınacak"]);
    expect(block).toContain("NOTUN ÖZEL KURALLARI");
    expect(block).toContain("- π sayısı 3 alınacak");
    expect(block).toMatch(/genel bilgideki farklı değeri kullanma/);
  });

  it("veritabanı süzgeci rakam ile belirleme sözünü birlikte ister; düşerse kaba süzgece geçer, o da düşerse boş", async () => {
    expect(SOURCE_RULE_PAGE_REGEX).toMatch(/\[0-9\]/);
    const calls: string[] = [];
    const service = (failRegex: boolean, failAll = false) => ({
      from: () => {
        const builder = {
          select: () => builder,
          in: () => builder,
          filter: (_col: string, op: string) => {
            calls.push(op);
            return {
              limit: async () =>
                failRegex
                  ? { data: null, error: { message: "regex" } }
                  : { data: [{ document_id: "a", page_number: 2, text_content: "e sayısı 2,7 alınır." }], error: null },
            };
          },
          or: () => {
            calls.push("or");
            return {
              limit: async () =>
                failAll
                  ? { data: null, error: { message: "x" } }
                  : { data: [{ document_id: "a", page_number: 1, text_content: "π sayısı 3 alınacak" }], error: null },
            };
          },
        };
        return builder;
      },
    });
    expect(await loadSourceRules(service(false) as never, ["a"])).toEqual(["e sayısı 2,7 alınır."]);
    expect(await loadSourceRules(service(true) as never, ["a"])).toEqual(["π sayısı 3 alınacak"]);
    expect(await loadSourceRules(service(true, true) as never, ["a"])).toEqual([]);
    expect(await loadSourceRules(service(false) as never, [])).toEqual([]);
    expect(calls).toEqual(["imatch", "imatch", "or", "imatch", "or"]);
  });
});

describe("ana hazırlık sohbeti: kural ve sayı önceliği istemde", async () => {
  const { tutorSystemPrompt, tutorVerifyPassages } = await import("@/lib/ai/teacher-tutor");
  const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");

  it("belgeli modlarda sayı önceliği ve notun kuralları var; müfredat modunda yok", () => {
    for (const mode of ["document", "mixed", "general"] as const) {
      const prompt = tutorSystemPrompt({ passages: [], mode, sourceRules: ["π sayısı 3 alınacak"] });
      expect(prompt).toContain(SOURCE_NUMBER_PRIORITY);
      expect(prompt).toContain("- π sayısı 3 alınacak");
    }
    const pool = tutorSystemPrompt({ passages: [], mode: "curriculum", sourceRules: ["π sayısı 3 alınacak"] });
    expect(pool).not.toContain(SOURCE_NUMBER_PRIORITY);
    expect(pool).not.toContain("NOTUN ÖZEL KURALLARI");
  });

  it("denetçi notun kuralını kaynak sayar", () => {
    const passages = [{ label: "not s.1", text: "Daire alanı π r²." }];
    expect(tutorVerifyPassages({ passages, sourceRules: ["π sayısı 3 alınacak"], mode: "mixed" })).toEqual([
      ...passages,
      { label: "Notundaki özel kurallar", text: "π sayısı 3 alınacak" },
    ]);
    expect(tutorVerifyPassages({ passages, sourceRules: [], mode: "mixed" })).toEqual(passages);
  });

  it("hazırlık okuyucusu kuralları döndürür, sohbet rotası öğretmene verir", () => {
    expect(read("src/lib/learning/prep-chat-grounding.ts")).toMatch(/loadSourceRules\(service, documentIds\)/);
    expect(read("src/lib/learning/prep-chat-grounding.ts")).toMatch(/return \{ decision, scope, excerpts, passages, corpus, sourceRules \}/);
    expect(read("src/app/api/ai/chat/route.ts")).toContain("sourceRules: grounding.sourceRules ?? []");
    expect(read("src/lib/ai/teacher-tutor-run.ts")).toContain("passages: tutorVerifyPassages(input.context)");
  });
});

describe("test içi eğitmen", async () => {
  const { coachSourceBlock, COACH_SOURCE_RULE, COACH_PASSAGE_CHARS } = await import("@/lib/learning/coach-sources");
  const { SOURCE_NUMBER_PRIORITY } = await import("@/lib/learning/teaching-rubric");

  it("kaynak bloğu kuralları ve pasajları taşır; pasajlar bütçeyle kesilir", () => {
    const block = coachSourceBlock({
      rules: ["π sayısı 3 alınacak"],
      passages: [
        { label: "Geometri.pdf s.2", text: "Dairenin alanı π r² ile bulunur." },
        { label: "Uzun.pdf s.3", text: "x".repeat(COACH_PASSAGE_CHARS * 2) },
      ],
    });
    expect(block).toContain("NOTUN ÖZEL KURALLARI");
    expect(block).toContain("ÖĞRENCİNİN NOTLARINDAN PASAJLAR");
    expect(block).toContain("[Geometri.pdf s.2]");
    expect(block.length).toBeLessThan(COACH_PASSAGE_CHARS + 600);
    const pool = coachSourceBlock({ rules: ["π sayısı 3 alınacak"], passages: [{ label: "Ders", text: "Metin." }], curriculum: true });
    expect(pool).not.toContain("NOTUN ÖZEL KURALLARI");
    expect(pool).toContain("MÜFREDAT DERSİ PASAJLARI");
    expect(coachSourceBlock({ rules: [], passages: [] })).toBe("");
    expect(COACH_SOURCE_RULE.startsWith(SOURCE_NUMBER_PRIORITY)).toBe(true);
  });

  it("eğitmen ucu hazırlığın kaynağını okur, sayı önceliğini sistem iletisine ve denetçiye koyar", () => {
    const route = read("src/app/api/learning/exam-prep/coach/route.ts");
    const owner = route.indexOf('.eq("user_id", userId)');
    const grounding = route.indexOf("loadPrepChatGrounding(");
    expect(owner).toBeGreaterThan(0);
    expect(grounding).toBeGreaterThan(owner);
    expect(route).toContain("systemAddendum: curriculum ? undefined : COACH_SOURCE_RULE");
    expect(route).toContain("reviewerAddendum: curriculum ? undefined : SOURCE_NUMBER_PRIORITY");
    expect(route).toMatch(/\$\{sources \?/);
    // Next.js rota dosyası yalnız POST dışa aktarır.
    expect(route.match(/^export /gm)).toHaveLength(1);
    const generate = read("src/lib/ai/generate.ts");
    expect(generate).toContain("${params.schemaHint}${params.systemAddendum ? `\\n${params.systemAddendum}` : \"\"}");
  });

  it("yeni modüller senaryo sabiti taşımaz", () => {
    for (const file of ["src/lib/learning/source-rules.ts", "src/lib/learning/coach-sources.ts", "src/app/api/learning/exam-prep/coach/route.ts"]) {
      expect(read(file)).not.toMatch(/yerçekimi|9,8|9\.8|g = 10|Mitokondri|Ribozom|Golgi/i);
    }
  });
});

/**
 * Sohbetin ilk metin hızı ve "Genel" modda kaynak etiketi (15 Kasım 2026, Burhan: TTFT ≤5 sn, Bulgu 1 ≤12 sn; "Genel
 * modda veya kaynak belge bağlanmamış sohbette asla 'Materyal dışı · yüklediğin kaynakta yok' gösterilmesin").
 *
 * 1. `dropSourceLabels`: etiket ve yokluk satırı kalkar, altındaki metin, "Belgeden" ve atıflar aynen kalır.
 * 2. Rota: işlem kaydından bağımsız okumalar onu beklemeden başlar; belge araması işlem kaydı denetlenince, kredi
 *    ayırmadan ÖNCE başlar; süre işaretleri kayda geçer; etiket süzgeci yalnız Genel modda ve belgesiz sohbette.
 * 3. Hazırlık bağlamı: belge listesinden sonraki bağımsız okumalar aynı anda başlar (sırayla beklenmez).
 * 4. Ekran: Genel modda akış sırasında da etiket görünmez.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dropSourceLabels } from "@/lib/ai/chat-answer-settle";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

describe("dropSourceLabels", () => {
  it("yokluk satırını ve yalnız etiketten ibaret satırı siler, metni bırakır", () => {
    const text = [
      "**Materyal dışı**",
      "Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum:",
      "Kuvvet, kütle ile ivmenin çarpımıdır.",
    ].join("\n");
    expect(dropSourceLabels(text)).toBe("Kuvvet, kütle ile ivmenin çarpımıdır.");
  });

  it("satır başındaki etiketi kırpar, ardındaki cümle kalır", () => {
    expect(dropSourceLabels("Genel bilgiden: Su 100 °C'de kaynar.")).toBe("Su 100 °C'de kaynar.");
    expect(dropSourceLabels("#### Genel bilgiden — kaynak gösterilmez\nOranlar sadeleşir.")).toBe("Oranlar sadeleşir.");
  });

  it("aynı satırdaki yokluk ön ekini kırpar", () => {
    expect(dropSourceLabels("Bu, yüklediğin kaynakta yok — genel bilgiyle anlatıyorum: Kesirler bölmedir.")).toBe(
      "Kesirler bölmedir.",
    );
    expect(dropSourceLabels("Bu, belgede yok. Ama şöyle düşünebilirsin.")).toBe("Ama şöyle düşünebilirsin.");
  });

  it("cümle içindeki kelimeye, 'Belgeden' etiketine ve atıflara dokunmaz", () => {
    const text = "Belgeden: Oran 3/4'tür [1].\nMateryal dışı bir soru sorman sorun değil.";
    expect(dropSourceLabels(text)).toBe(text);
  });

  it("etiket yoksa metni olduğu gibi döndürür", () => {
    const text = "Önce paydaları eşitleyelim.\n\nSıra sende: 1/2 + 1/3 kaç eder?";
    expect(dropSourceLabels(text)).toBe(text);
  });
});

describe("sohbet rotası: erken okumalar ve süre işaretleri", () => {
  const route = read("src/app/api/ai/chat/route.ts");
  const at = (needle: string) => {
    const index = route.indexOf(needle);
    expect(index, needle).toBeGreaterThan(0);
    return index;
  };

  it("işlem kaydından bağımsız okumalar işlem kaydını beklemeden başlar", () => {
    const prepare = at("const operation = await prepareChatOperation(");
    for (const early of [
      "const entitlementsEarly =",
      "const teacherV2Early =",
      "const priorTurnsEarly =",
      "const historyEarly =",
      "const profileEarly =",
      "const instructionEarly =",
      "const materialEarly",
      "const optionCountEarly =",
      "const moodEarly =",
      "const ownedPrepEarly =",
    ]) {
      expect(at(early), early).toBeLessThan(prepare);
    }
  });

  it("belge araması işlem kaydı denetlendikten sonra, kredi ayırmadan önce başlar", () => {
    const prepared = at('stage("prepared")');
    const search = at("const searchEarly");
    const reserve = at("const reserved = await reserveCredits(");
    expect(search).toBeGreaterThan(prepared);
    expect(search).toBeLessThan(reserve);
    // Eski sıralı arama yok: arama erken sözden okunur.
    expect(route).toContain("const matches = await searchEarly;");
    expect(route).not.toMatch(/const matches = await searchDocumentChunks\(/);
  });

  it("hazırlığa özel okumalar sahiplik denetiminden sonra başlar", () => {
    const owned = at("await ownedPrepEarly");
    expect(at("const groundingEarly =")).toBeGreaterThan(owned);
    expect(at("const examContextEarly =")).toBeGreaterThan(owned);
    expect(at("const studentMemoryEarly =")).toBeGreaterThan(owned);
  });

  it("ruh hali modelden önce sırayla değil, erken sözden okunur", () => {
    expect(route).toContain("(await moodEarly) ?? \"neutral\"");
    expect(route).not.toContain("await loadTodayMood(service, userId).catch(() => null)) ?? \"neutral\"");
  });

  it("süre işaretleri: hazır, ayrıldı, arama, model öncesi, ilk metin, kayıt", () => {
    for (const name of ["prepared", "reserved", "evidence", "ready", "first_text", "saved"]) {
      expect(route, name).toContain(`stage("${name}")`);
    }
    // İlk metin, iki akış yolunda da (ana sohbet ve hazırlık sohbeti) ilk parça gelince işaretlenir.
    expect(route.match(/stage\("first_text"\)/g)).toHaveLength(2);
  });

  it("etiket süzgeci yalnız Genel modda ve belge bağlanmamış sohbette, denetimden sonra", () => {
    const settle = at("content = settlePedagogicalLabels(content");
    const drop = at("if (!useDocuments && !documentAttached) content = dropSourceLabels(content);");
    expect(drop).toBeGreaterThan(settle);
  });
});

describe("sohbet ekranı: akış maskesi", () => {
  it("Genel modda ve belgesiz sohbette taslak akarken de etiket görünmez", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain("const maskSourceLabels = !useDocuments && !activeDocumentId.current;");
    expect(panel).toContain("if (maskSourceLabels) assistant = dropSourceLabels(assistant);");
    // chat-answer-settle istemci için güvenli (sunucu modülü içe aktarmaz).
    expect(read("src/lib/ai/chat-answer-settle.ts")).not.toMatch(/^import /m);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Hazırlık bağlamı: bağımsız okumalar aynı anda başlar                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const events: { table: string; startedWithResolved: number }[] = [];
let resolved = 0;

vi.mock("@/lib/documents/teacher-analysis-run", () => ({
  loadPrepDocumentIds: vi.fn(async () => ["doc-1"]),
}));
vi.mock("@/lib/rag/pipeline", () => ({
  searchDocumentChunksAcross: vi.fn(() => {
    events.push({ table: "search", startedWithResolved: resolved });
    return new Promise((done) => setTimeout(() => {
      resolved += 1;
      done([]);
    }, 15));
  }),
}));
vi.mock("@/lib/learning/source-rules", () => ({ loadSourceRules: vi.fn(async () => []) }));

function fakeService() {
  const make = (table: string): unknown => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const name of ["select", "in", "eq", "or", "ilike", "limit", "order", "maybeSingle", "not", "is", "gte", "lte"]) {
      builder[name] = chain;
    }
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      events.push({ table, startedWithResolved: resolved });
      return new Promise((done) => setTimeout(() => {
        resolved += 1;
        done({ data: table === "documents" ? [{ id: "doc-1", file_name: "not.pdf", mime_type: "application/pdf" }] : [], error: null });
      }, 15)).then(onFulfilled, onRejected);
    };
    return builder;
  };
  return { from: (table: string) => make(table) } as never;
}

describe("hazırlık bağlamı: bağımsız okumalar aynı anda", () => {
  beforeEach(() => {
    events.length = 0;
    resolved = 0;
  });

  it("belge bilgisi, analiz, kapsam, anlam ve kelime araması hiçbiri bitmeden başlar", async () => {
    const { loadPrepChatGrounding } = await import("@/lib/learning/prep-chat-grounding");
    await loadPrepChatGrounding(fakeService(), "user-1", "prep-hiz-1", "fotosentez hızı ışıkla nasıl değişir");
    const first = (table: string) => events.find((event) => event.table === table);
    // Belge listesinden sonraki beş bağımsız okuma: hiçbiri öbürünün bitmesini beklemedi.
    expect(first("documents")?.startedWithResolved).toBe(first("search")?.startedWithResolved);
    expect(first("document_teacher_analyses")?.startedWithResolved).toBe(first("documents")?.startedWithResolved);
    const pages = events.filter((event) => event.table === "document_pages");
    // Kapsam sayfaları + kelime kalıpları (en az iki kalıp) aynı anda.
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const base = first("documents")!.startedWithResolved;
    expect(pages.slice(0, 3).every((event) => event.startedWithResolved === base)).toBe(true);
  });
});

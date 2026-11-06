import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
  İkiz Sınav bütün belgeleri okur (6 Kasım 2026, canlı kalite sınavında bulundu).

  Çok belgeli bir hazırlıkta çıkmış sorular ayrı bir dosyadaydı; deneme kurulumunda
  "Çıkmış Sorulara Göre İkiz Sınav" seçeneği hiç çıkmadı. Okuma canlıda olmayan
  `exam_prep_source_documents` tablosuna bakıyor, hata sessizce boş liste dönüyor ve yalnız
  hazırlığın ana belgesi okunuyordu. Şimdi belge listesi hazırlığın tek okuyucusundan
  (`loadPrepDocumentIds`: ana belge + ek belgeler + konu düğümleri, yalnız sahibinin).
*/

const docs = vi.hoisted(() => ({ ids: ["ana-belge", "cikmis-sorular"] }));
vi.mock("@/lib/documents/teacher-analysis-run", async (orig) => ({
  ...(await orig<typeof import("@/lib/documents/teacher-analysis-run")>()),
  loadPrepDocumentIds: vi.fn(async () => docs.ids),
}));

import { loadPastQuestions } from "@/lib/learning/mock-exam/create";

const PAGES: Record<string, string> = {
  "ana-belge": "Ünite 1. Asitler ve bazlar\nAsitler suda H+ iyonu verir.",
  "cikmis-sorular": [
    "1. 0,1 M HCl çözeltisinin pH değeri kaçtır?",
    "   A) 1   B) 2   C) 7   D) 12   E) 13",
    "2. Nötrleşme tepkimesinde hangi ürünler oluşur?",
    "3. Tampon çözeltinin işlevini açıklayınız.",
    "4. Kuvvetli asit ile zayıf asit arasındaki farkı yazınız.",
  ].join("\n"),
};

function fakeService() {
  const query = { ids: [] as string[] };
  const builder = {
    select: () => builder,
    in: (_col: string, ids: string[]) => {
      query.ids = ids;
      return builder;
    },
    order: () => builder,
    limit: async () => ({ data: query.ids.map((id) => ({ text_content: PAGES[id] ?? "" })), error: null }),
  };
  return { from: (table: string) => (table === "document_pages" ? builder : null) } as never;
}

describe("İkiz Sınav: çıkmış sorular ayrı belgede", () => {
  it("ana belge dışındaki dosyadaki soruları da bulur", async () => {
    const past = await loadPastQuestions(fakeService(), "hazirlik");
    expect(past.length).toBeGreaterThanOrEqual(4);
  });

  it("belge listesi yalnız ana belgeyse seçenek açılmaz", async () => {
    docs.ids = ["ana-belge"];
    expect(await loadPastQuestions(fakeService(), "hazirlik")).toEqual([]);
    docs.ids = ["ana-belge", "cikmis-sorular"];
  });
});

describe("olmayan tablo", () => {
  it("`exam_prep_source_documents` kaynakta okunmaz (canlıda yok)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
      });
    const offenders = walk("src").filter((file) => /from\(\s*["']exam_prep_source_documents/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Bekçi (5 Kasım 2026): üretim kodu ve istemler canlı denemelerin konu, kişi ya da sayı örneklerini taşımaz. Kurallar
  bütün derslerde aynı çalışır; örnekler yalnız testlerde durur. Liste, 4-5 Kasım temizliğinde kaldırılan sabitlerdir;
  biri geri gelirse bu test düşer. e2e fikstürleri (`src/app/e2e`) senaryo taşıyabilir, taranmaz.
*/

const SCENARIO_TOKENS = [
  "ventrikül",
  "1,5 mol",
  "Gazneliler",
  "Karahanlılar",
  "140 TL",
  "160 TL",
  "g(4)",
  "Alıştırma 11.5",
  "Vbatan",
  "dcisim",
  "Makroekonomi",
  "Cagan",
  "hiperenflasyon",
  "SMMM",
  "Homeostazi",
  "Gastroenterit",
  "Nefroloji",
  "Parçalı Fonksiyon",
  "Düşey Atış",
  "Taban Fiyat",
  "Miktar Teorisi",
  "Phillips",
  "TÜFE",
  "Yİ-ÜFE",
  "Taksi:",
  "8-12 mm",
  "Selin'in",
  "Uat 99",
  "Ece:",
  "Deniz:",
  "Zeynep",
  "Mert'in",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "e2e" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("src içinde senaryo sabiti yok", () => {
  it("üretim kodu, istem ve yorumlar canlı deneme örneği taşımaz", () => {
    const root = join(process.cwd(), "src");
    const hits: string[] = [];
    for (const file of walk(root)) {
      // TTS ses adları (sağlayıcı sesleri) kişi adı listesi değildir; o dosya kadın sesi ipucu tablosu taşır.
      if (file.endsWith("studio-speech.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const token of SCENARIO_TOKENS) {
        if (text.includes(token)) hits.push(`${relative(root, file)}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("src içinde test dosyası durmaz (vitest yalnız tests/unit'i koşar)", () => {
    const tests = walk(join(process.cwd(), "src")).filter((file) => /\.test\.tsx?$/.test(file));
    expect(tests).toEqual([]);
  });
});

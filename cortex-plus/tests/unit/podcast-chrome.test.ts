import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Sınav hazırlığı podcast kabuğu Astra envanterindeki etiketleri taşır.
  Görsel ölçü tarayıcıda bakılır; bu dosya etiketlerin ve 15 sn atlamasının
  kaybolmamasını tutar. Özellik kilidi eklenmez — kapı kredi/oturumdur.
*/

const player = readFileSync("src/components/parity/exam-podcast-player.tsx", "utf8");
const generating = readFileSync("src/components/parity/node-generation-progress.tsx", "utf8");
const topics = readFileSync("src/components/parity/exam-topic-pick.tsx", "utf8");
const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");

describe("podcast oynatıcı kabuğu", () => {
  it("üst başlık, transkript ve 15 saniyelik atlama duruyor", () => {
    expect(player).toContain(">Podcast<");
    expect(player).toContain("Tam transkript");
    expect(player).toContain('aria-label="15 saniye geri"');
    expect(player).toContain('aria-label="15 saniye ileri"');
    expect(player).toContain("const SKIP_MS = 15_000");
    expect(player).toContain("const SPEEDS = [1, 1.25, 1.5, 2]");
    expect(player).toContain("cycleSpeed");
  });

  it("oynatma bitmeden de devam edilebiliyor", () => {
    expect(player).toContain("Devam et");
    expect(player).toContain("Dinledim, devam");
  });
});

describe("üretim ekranı", () => {
  it("bekleme başlığı ve dakika uyarısı duruyor", () => {
    expect(generating).toContain("Dersin hazırlanıyor…");
    expect(generating).toContain("Bu işlem birkaç dakika sürebilir.");
    expect(generating).toContain("LESSON_PREP_STEPS");
  });
});

describe("konu seç ve yol", () => {
  it("konu satırı numaralı ve kapatılabilir", () => {
    expect(topics).toContain("Konu seç");
    expect(topics).toContain('aria-label="Kapat"');
    expect(topics).toContain("is-hot");
  });

  it("sıradaki podcast düğümü öneri kartı ve mikrofon", () => {
    expect(home).toContain("ÖNERİLEN DERS");
    expect(home).toContain('ready?.kind === "podcast"');
    expect(home).toContain("cp-exam-trail-node--podcast");
    expect(home).not.toContain("Materyaller");
  });
});

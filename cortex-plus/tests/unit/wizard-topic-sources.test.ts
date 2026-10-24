import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { redundantUnitHeader, topicSourcesChip } from "@/lib/learning/exam-wizard-copy";

/*
  20 Ekim 2026, sınav seti karşılaştırması: Astra konu listesinde her konunun kaç kaynaktan geldiğini
  yazıyor. Bizde nefron defteri, işaretli test ve hormon kartı #378'den beri ilgili konunun dersine
  giriyor ama kurulumda görünmüyordu. Ayrıca tek konulu ünite, konunun adıyla aynı başlığı tekrar
  ediyordu ("SİSTEMLER ARASI HOMEOSTAZİ BAĞLANTILARI" › "Sistemler Arası Homeostazi Bağlantıları").
*/

describe("konu satırındaki kaynak etiketi", () => {
  it("yalnız birden çok dosyadan beslenen konuda; dosya adları üzerine gelince", () => {
    expect(topicSourcesChip(["AYT.pdf"])).toBeNull();
    expect(topicSourcesChip(undefined)).toBeNull();
    expect(topicSourcesChip(["AYT.pdf", "AYT.pdf"])).toBeNull();
    expect(topicSourcesChip(["AYT.pdf", "Defter-Nefron.jpg", "Test-14.jpg"])).toEqual({
      label: "3 kaynak",
      title: "AYT.pdf · Defter-Nefron.jpg · Test-14.jpg",
    });
  });

  it("kurulum isteği konunun kendi dosyasına yardımcı dosyaları ekler", () => {
    const intake = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");
    expect(intake).toContain("supportFilesForTopics(");
    expect(intake).toContain("topicSourceCounts: topicFiles.map((files) => files.length)");
  });
});

describe("tek konulu ünitenin başlığı", () => {
  it("konunun adıyla aynıysa yazılmaz", () => {
    expect(
      redundantUnitHeader("SİSTEMLER ARASI HOMEOSTAZİ BAĞLANTILARI", ["Sistemler Arası Homeostazi Bağlantıları"]),
    ).toBe(true);
    expect(redundantUnitHeader("DOLAŞIM SİSTEMİ", ["Kalp", "Damarlar"])).toBe(false);
    expect(redundantUnitHeader("SOLUNUM SİSTEMİ", ["Solunum Yolları"])).toBe(false);
  });
});

// 24 Ekim 2026 lansman testi: ünitesiz ilk konu "Diğer" başlığıyla listenin sonuna düşüyordu.
describe("kurulumun konu listesi yolun sırasıyla", () => {
  it("ünitesiz konu kendi yerinde, ünite ilk konusunun yerinde", async () => {
    const { listSegments } = await import("@/lib/learning/exam-wizard-copy");
    const units = [
      { title: "Sinir Sistemi", topicIndexes: [1, 2] },
      { title: "Endokrin Sistem", topicIndexes: [4, 5] },
    ];
    expect(listSegments(units, [0, 3])).toEqual([
      { kind: "topic", index: 0 },
      { kind: "unit", unit: units[0] },
      { kind: "topic", index: 3 },
      { kind: "unit", unit: units[1] },
    ]);
  });
});

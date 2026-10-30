// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { PARALLEL_UPLOADS, inSelectionOrder, runPool } from "@/lib/documents/upload-batch";
import {
  PENDING_DOC_PROCESS_KEY,
  clearPendingDocProcess,
  readPendingDocProcesses,
  writePendingDocProcess,
} from "@/lib/documents/pending-doc-process";

/*
  20 Ekim 2026: 7 dosyalık sınav seti sırayla işlenince ~76 sn sürdü (Astra ~30 sn). Ücretli hesapta
  birden çok dosya aynı anda işlenir; sekme kapanınca yarım kalan her dosya sürer; seçim sırası korunur.
  31 Ekim 2026: şerit 3 → 6, kurucu da ücretli sayılır; bir dosyanın düşmesi topluluğu durdurmaz (100 fotoğrafta
  tek bulanık fotoğraf arkadakileri kesiyordu), yalnız hak dolunca ("stop") yenisi başlamaz.
*/

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("toplu yükleme havuzu", () => {
  it("aynı anda en çok altı dosya; hepsi biter", async () => {
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const result = await runPool([0, 1, 2, 3, 4, 5, 6, 7, 8], PARALLEL_UPLOADS, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      await tick();
      running -= 1;
      order.push(item);
      return true;
    });
    expect(PARALLEL_UPLOADS).toBe(6);
    expect(peak).toBe(6);
    expect(result).toEqual({ succeeded: 9, failed: 0, stopped: false });
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("sırayla modda (ücretsiz) aynı anda tek dosya", async () => {
    let running = 0;
    let peak = 0;
    await runPool([1, 2, 3], 1, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
      return true;
    });
    expect(peak).toBe(1);
  });

  it("bir dosya düşünce öbürleri sürer; hak dolunca (stop) yenisi başlamaz, sürenler biter", async () => {
    const started: number[] = [];
    const failed = await runPool([0, 1, 2, 3, 4, 5], 2, async (item) => {
      started.push(item);
      await tick();
      return item !== 1;
    });
    expect(failed).toEqual({ succeeded: 5, failed: 1, stopped: false });
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);

    const begun: number[] = [];
    const stopped = await runPool([0, 1, 2, 3, 4, 5], 2, async (item) => {
      begun.push(item);
      await tick();
      return item === 1 ? "stop" : true;
    });
    expect(stopped.stopped).toBe(true);
    expect(begun).toEqual([0, 1, 2]);
  });

  it("bitiş sırasından seçim sırasına döner; öncekiler yerinde kalır", () => {
    const materials = [
      { id: "old", fileName: "eski.pdf" },
      { id: "c", fileName: "Tahta.jpg" },
      { id: "a", fileName: "AYT.pdf" },
      { id: "b", fileName: "Not.docx" },
    ];
    const ordered = inSelectionOrder(materials, new Set(["old"]), ["AYT.pdf", "Not.docx", "Tahta.jpg"]);
    expect(ordered.map((material) => material.id)).toEqual(["old", "a", "b", "c"]);
  });
});

describe("bekleyen belgeler: belge başına kayıt", () => {
  beforeEach(() => window.localStorage.clear());

  const entry = (documentId: string, surface: "exam-wizard" | "prep-add" = "exam-wizard") => ({
    documentId,
    fileName: `${documentId}.jpg`,
    sizeBytes: 1,
    startedAt: "2026-10-20T00:00:00Z",
    surface,
  });

  it("birden çok dosya aynı anda bekleyebilir; temizleme yalnız o belgeyi siler", () => {
    writePendingDocProcess(entry("a"));
    writePendingDocProcess(entry("b"));
    writePendingDocProcess(entry("c", "prep-add"));
    expect(readPendingDocProcesses("exam-wizard").map((item) => item.documentId)).toEqual(["a", "b"]);
    clearPendingDocProcess({ documentId: "a" });
    expect(readPendingDocProcesses().map((item) => item.documentId)).toEqual(["b", "c"]);
    // Bir yüzeyi temizlemek öbür sekmenin kaydına dokunmaz (eskiden tek kayıt hepsini siliyordu).
    clearPendingDocProcess({ surface: "exam-wizard" });
    expect(readPendingDocProcesses().map((item) => item.documentId)).toEqual(["c"]);
  });

  it("aynı belge yeniden yazılınca çoğalmaz; eski tek kayıt da okunur", () => {
    writePendingDocProcess(entry("a"));
    writePendingDocProcess({ ...entry("a"), fileName: "yeni.jpg" });
    expect(readPendingDocProcesses()).toHaveLength(1);
    window.localStorage.setItem(PENDING_DOC_PROCESS_KEY, JSON.stringify(entry("legacy")));
    expect(readPendingDocProcesses().map((item) => item.documentId)).toEqual(["legacy"]);
  });
});

describe("sihirbaz bağlantısı", () => {
  const wizard = readFileSync("src/components/parity/exam-create-wizard.tsx", "utf8");

  it("paralel ücretli hesapta ve kurucuda (önizlemede değil); yarım kalanların hepsi sürer", () => {
    expect(wizard).toContain('const paidUploads = account?.audience === "plus" || account?.audience === "sigma" || isAdmin;');
    expect(wizard).toContain("const lanes = paidUploads ? PARALLEL_UPLOADS : 1;");
    expect(wizard).toContain('readPendingDocProcesses("exam-wizard")');
    expect(wizard).toContain("inSelectionOrder(current, existing");
    expect(wizard).not.toContain("readPendingDocProcess(");
    expect(wizard).not.toContain("clearPendingDocProcess();");
  });

  it("hazırlığa materyal ekleme de belge başına temizler", () => {
    const add = readFileSync("src/components/parity/prep-add-material.tsx", "utf8");
    expect(add).toContain('readPendingDocProcesses("prep-add")');
    expect(add).not.toContain("clearPendingDocProcess();");
  });
});

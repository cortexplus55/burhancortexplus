import { describe, expect, it } from "vitest";
import { flatMapNeedsOneshotRegen } from "@/lib/documents/pdf-learning-v2";

describe("flatMapNeedsOneshotRegen", () => {
  it("flags unused flat maps with many nodes (founder 111 junk)", () => {
    const nodes = Array.from({ length: 50 }, () => ({ parent_id: null as string | null }));
    expect(
      flatMapNeedsOneshotRegen({ status: "ready", inUse: false, nodes }),
    ).toBe(true);
  });

  it("keeps hierarchical maps", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "ready",
        inUse: false,
        nodes: [
          { parent_id: null },
          { parent_id: "u1" },
          { parent_id: "u1" },
        ],
      }),
    ).toBe(false);
  });

  it("never regenerates maps already used by an exam", () => {
    const nodes = Array.from({ length: 50 }, () => ({ parent_id: null as string | null }));
    expect(
      flatMapNeedsOneshotRegen({ status: "ready", inUse: true, nodes }),
    ).toBe(false);
  });

  it("leaves short flat maps alone", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "ready",
        inUse: false,
        nodes: Array.from({ length: 8 }, () => ({ parent_id: null as string | null })),
      }),
    ).toBe(false);
  });

  it("skips pending / failed statuses", () => {
    expect(
      flatMapNeedsOneshotRegen({
        status: "pending",
        inUse: false,
        nodes: Array.from({ length: 50 }, () => ({ parent_id: null as string | null })),
      }),
    ).toBe(false);
  });

  it("never regenerates student-edited maps", () => {
    const nodes = Array.from({ length: 50 }, () => ({
      parent_id: null as string | null,
      is_student_edited: false,
    }));
    nodes[0]!.is_student_edited = true;
    expect(
      flatMapNeedsOneshotRegen({ status: "ready", inUse: false, nodes }),
    ).toBe(false);
  });
});

/*
  19 Ekim 2026, 65 sayfalık PDF + 6 sayfalık Word + 5 fotoğraf: ortak haritada konular PDF'e
  bağlandı, fotoğraflara düğüm düşmedi. Kurulum ucu düğümsüz fotoğrafları "bozuk harita" sayıp
  "pending"e çekti; sihirbaz bütün haritayı dört kez baştan yazdırdı (her biri ~1,5 dk, bir model çağrısı).
*/
describe("çok dosyalı kurulumda düğümsüz dosya", () => {
  it("bozuk sayılmaz; tek başına yüklenen düğümsüz belge yine yeniden üretilir", () => {
    expect(flatMapNeedsOneshotRegen({ status: "ready", inUse: false, nodes: [], courseMember: true })).toBe(false);
    expect(flatMapNeedsOneshotRegen({ status: "ready", inUse: false, nodes: [] })).toBe(true);
  });

  it("kurulum ucu çok dosyada belgeyi kurs üyesi olarak sorar", async () => {
    const { readFileSync } = await import("node:fs");
    const intake = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");
    expect(intake).toContain("regenerateUnusedFlatTopicMap(service, documentId, { courseMember: documentIds.length > 1 })");
  });
});

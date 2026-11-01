import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import registry from "@/lib/curriculum/registry.json";
import { buildSetupTree } from "@/lib/curriculum/official-setup";
import { MED_TREE_LABEL, MEB_TREE_LABEL, TREE_EXAM_IDS, TREE_EXAMS, YDS_TREE_LABEL } from "@/lib/curriculum/exam-trees";
import { OFFICIAL_LINKS, officialLinksFor } from "@/lib/curriculum/official-links";
import { TOPIC_LABEL_MAX } from "@/lib/curriculum/topic-map";

type Prog = {
  id: string;
  kind: string;
  scope: string;
  sourceIds: string[];
  units: { title: string; outcomes: { code: string; text: string; limitations: string | null; sourceId: string }[] }[];
};
const programs = (registry as unknown as { programs: Prog[]; sources: { id: string; url: string }[] }).programs;
const sources = (registry as unknown as { sources: Record<string, { url: string }> }).sources;

describe("KPSS / ALES / DGS / YDS / TUS / DUS konu ağaçları", () => {
  for (const exam of TREE_EXAM_IDS) {
    const def = TREE_EXAMS[exam];
    it(`${def.name}: her ders kayıtta, 5–6 konu (tıpta 4–6), konu başına ≥2 alt başlık, etiket ve kaynak`, () => {
      for (const s of def.subjects) {
        const p = programs.find((x) => x.id === s.programId);
        expect(p, s.programId).toBeTruthy();
        expect(p!.kind).toBe(exam);
        const min = exam === "tus" || exam === "dus" ? 4 : 5;
        expect(p!.units.length).toBeGreaterThanOrEqual(min);
        expect(p!.units.length).toBeLessThanOrEqual(6);
        expect(p!.scope).toContain(def.label);
        for (const u of p!.units) {
          expect(u.outcomes.length, u.title).toBeGreaterThanOrEqual(2);
          expect(u.title.length).toBeLessThanOrEqual(TOPIC_LABEL_MAX);
          for (const o of u.outcomes) {
            expect(o.limitations).toContain(def.label);
            const src = sources[o.sourceId];
            expect(src?.url).toMatch(/^https:\/\//);
          }
        }
      }
    });
    it(`${def.name}: kurulum ağacı yüklenir`, () => {
      const tree = buildSetupTree(exam);
      expect(tree.subjects.map((s) => s.key)).toEqual(def.subjects.map((s) => s.programId));
      for (const s of tree.subjects) expect(s.units.length).toBeGreaterThan(0);
    });
  }

  it("etiketler birebir", () => {
    expect(MED_TREE_LABEL).toBe("Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir");
    expect(MEB_TREE_LABEL).toBe("Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir");
    expect(TREE_EXAMS.tus.label).toBe(MED_TREE_LABEL);
    expect(TREE_EXAMS.dus.label).toBe(MED_TREE_LABEL);
    expect(TREE_EXAMS.kpss.label).toBe(MEB_TREE_LABEL);
    expect(TREE_EXAMS.yds.label).toBe(YDS_TREE_LABEL);
  });

  it("soru sayıları ÖSYM yapısından; KPSS'de ders başına uydurma sayı yok", () => {
    expect(buildSetupTree("kpss").subjects.every((s) => s.questionCount === null)).toBe(true);
    expect(buildSetupTree("ales").subjects.map((s) => s.questionCount)).toEqual([50, 50]);
    expect(buildSetupTree("yds").subjects[0]!.questionCount).toBe(80);
    expect(buildSetupTree("tus").subjects.every((s) => (s.questionCount ?? 0) > 0)).toBe(true);
  });

  it("TUS/DUS kaynakları UÇEP / DUÇEP", () => {
    const tus = programs.find((p) => p.id === "tus-2026-tree-anatomi")!;
    expect(tus.sourceIds).toContain("yok_ucep_2020");
    const dus = programs.find((p) => p.id === "dus-2026-tree-restoratif")!;
    expect(dus.sourceIds).toContain("yok_ducep_2024");
  });
});

describe("Resmî bağlantılar", () => {
  it("yalnız https, tekil, her sınav için en az bir bağlantı", () => {
    const keys = OFFICIAL_LINKS.map((l) => `${l.exam}|${l.url}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of OFFICIAL_LINKS) expect(l.url).toMatch(/^https:\/\/[a-z.]+\.gov\.tr\//);
    for (const exam of ["yks", "lgs", ...TREE_EXAM_IDS]) expect(officialLinksFor(exam).length, exam).toBeGreaterThan(0);
  });
  it("göç dosyası JSON ile aynı bağlantıları yazar", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20261101210000_official_links.sql"), "utf8");
    for (const l of OFFICIAL_LINKS) expect(sql).toContain(l.url.replace(/'/g, "''"));
  });
});

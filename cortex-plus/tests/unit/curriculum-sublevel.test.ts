import { describe, expect, it } from "vitest";
import raw from "@/lib/curriculum/registry.json";
import {
  buildTopicMap,
  DEFAULT_GRADE_SCOPES,
  inPartScope,
  officialPrepTitle,
  cutAtWord,
  logTopic,
  OPEN_MAX_AVG_KEEP,
  OPEN_MIN_UNITS_KEEP,
  OPEN_TOPIC_MAX,
  OPEN_UNIT_LIMIT,
  outcomeGrade,
  TOPIC_LABEL_MAX,
  TOPIC_TARGET_MAX,
} from "@/lib/curriculum/topic-map";
import { redundantUnitHeader } from "@/lib/learning/exam-wizard-copy";
import type { CurriculumProgram, CurriculumRegistry } from "@/lib/curriculum/types";

const REG = raw as unknown as CurriculumRegistry;
const scopes = REG.examGradeScopes;
const parts = (p: CurriculumProgram) => (p.kind === "yks" ? (["TYT", "AYT", null] as const) : ([null] as const));

function scoped(p: CurriculumProgram, part: "TYT" | "AYT" | null): string[] {
  const codes: string[] = [];
  for (const u of p.units) for (const o of u.outcomes) if (inPartScope(outcomeGrade(o, p.grade), part, scopes)) codes.push(o.code);
  return codes;
}

describe("alt düzey açma (resmî başlıklar, veri güdümlü)", () => {
  for (const p of REG.programs) {
    for (const part of parts(p)) {
      it(`${p.id}${part ? ` ${part}` : ""}: kazanımlar korunur, sınırlar tutar`, () => {
        const map = buildTopicMap(p, "serbest", null, { part, scopes });
        const want = [...new Set(scoped(p, part))].sort();
        const got = map.topicCodes.flat();
        expect(new Set(got).size).toBe(got.length);
        expect([...got].sort()).toEqual(want);
        expect(map.topics.length).toBeLessThanOrEqual(TOPIC_TARGET_MAX);
        expect(new Set(map.topics).size).toBe(map.topics.length);
        const units = new Set(p.units.filter((u) => u.outcomes.some((o) => inPartScope(outcomeGrade(o, p.grade), part, scopes))).map((u) => u.title)).size;
        for (const t of map.topics) {
          expect(t.length).toBeLessThanOrEqual(TOPIC_LABEL_MAX);
        }
        const keep = units >= OPEN_MIN_UNITS_KEEP && map.outcomeCount <= map.units.length * OPEN_MAX_AVG_KEEP;
        if (keep) for (const t of map.topics) expect(t).not.toMatch(/\(\+\d+ kazanım\)$/);
        if (!keep && units < OPEN_UNIT_LIMIT && map.outcomeCount >= 8) {
          expect(map.topics.length).toBeLessThanOrEqual(Math.max(OPEN_TOPIC_MAX, map.units.length));
          expect(map.topics.length).toBeGreaterThanOrEqual(8);
        }
      });
    }
  }

  it("kota toplamları her senaryoda toplamı verir", () => {
    for (const q of REG.programs) {
      for (const [key, ex] of Object.entries(q.exams ?? {})) {
        for (const s of (ex as { scenarios?: number[] } | undefined)?.scenarios ?? []) {
          const m = buildTopicMap(q, key as never, s as never, { scopes });
          expect(m.quotaByTopic.reduce((x, y) => x + y, 0)).toBe(m.total);
          expect(m.topicCodes.flat().every((c) => (m.quotaByCode[c] ?? 0) >= 0)).toBe(true);
        }
      }
    }
  });

  it("YKS kapsamı: TYT 9–10, AYT 11–12", () => {
    const p = REG.programs.find((x) => x.id === "yks-2026-cografya")!;
    for (const [part, [lo, hi]] of [["TYT", scopes.TYT], ["AYT", scopes.AYT]] as const) {
      const map = buildTopicMap(p, "serbest", null, { part, scopes });
      for (const u of map.units) {
        const g = Number(u.title.match(/^(\d+)\./)?.[1]);
        expect(g).toBeGreaterThanOrEqual(lo);
        expect(g).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe("hazırlık adı kapsamı izler", () => {
  it("TYT/AYT sınıf aralığını kapsam verisinden alır", () => {
    expect(officialPrepTitle("YKS Matematik (9–12)", "TYT", DEFAULT_GRADE_SCOPES)).toBe("TYT Matematik (9–10. sınıf) sınav hazırlığı");
    expect(officialPrepTitle("YKS Matematik (9–12)", "AYT", DEFAULT_GRADE_SCOPES)).toBe("AYT Matematik (11–12. sınıf) sınav hazırlığı");
    expect(officialPrepTitle("YKS Fizik (9–12)", "TYT", { ...DEFAULT_GRADE_SCOPES, TYT: [9, 9] })).toBe("TYT Fizik (9. sınıf) sınav hazırlığı");
    expect(officialPrepTitle("5. Sınıf Matematik", null)).toBe("5. Sınıf Matematik sınav hazırlığı");
  });
});

describe("grup başlığı konuyla aynıysa tek satır", () => {
  it("aynı ad tek konuysa tekrar yok", () => {
    expect(redundantUnitHeader("9. Sınıf · Mantık", ["9. Sınıf · Mantık"])).toBe(true);
    expect(redundantUnitHeader("9. Sınıf · Mantık", ["9. Sınıf · Mantık", "Kümeler"])).toBe(false);
  });
});

describe("YKS Felsefe resmî ünite adları (MEB 2018 Felsefe DÖP)", () => {
  const p = REG.programs.find((x) => x.id === "yks-2026-felsefe")!;
  it("kod yerine resmî ünite adı, kaynak kayıtlı", () => {
    for (const u of p.units) expect(u.title).not.toMatch(/·\s*\d+\.\d+$/);
    expect(p.units.map((u) => u.title)).toContain("10. Sınıf · Felsefenin Temel Konuları ve Problemleri");
    expect(p.units.map((u) => u.title)).toContain("11. Sınıf · MÖ 6. Yüzyıl-MS 2. Yüzyıl Felsefesi");
    expect(p.sourceIds).toContain("meb_felsefe_dop_2018");
    expect(REG.sources["meb_felsefe_dop_2018"]!.sha256).toBe("71f2b77e209fdc924efbb559744af8c67e91ddb1928a4888a4c07aa5d69654cb");
  });
  it("TYT 4, AYT 5 ünite konusu; aşırı bölme yok", () => {
    expect(buildTopicMap(p, "serbest", null, { part: "TYT", scopes }).topics).toHaveLength(4);
    expect(buildTopicMap(p, "serbest", null, { part: "AYT", scopes }).topics).toHaveLength(5);
  });
});

describe("kelime sınırında kırpma", () => {
  it("kelime ortasında kesmez, sınırı aşmaz", () => {
    const t = "Gerçek yaşam durumlarında rasyonel sayıların ondalık gösterimlerini yansıtabilme ve bölme işlemini kullanarak inceleme";
    const c = cutAtWord(t, 60);
    expect(c.length).toBeLessThanOrEqual(60);
    expect(c.endsWith("…")).toBe(true);
    expect(t.startsWith(c.slice(0, -1))).toBe(true);
    expect(t[c.length - 1]).toBe(" ");
    expect(cutAtWord("kısa", 60)).toBe("kısa");
  });
});

describe("resmî kayıtta yapışık metin kalmaz", () => {
  it("harfe yapışık a)/b) imi ve küçük→Büyük yapışması yok", () => {
    for (const q of REG.programs)
      for (const u of q.units)
        for (const o of u.outcomes) {
          expect(o.text).not.toMatch(/(^|\s)[a-zçğıöşü]{2,}[a-h]\)\s+[A-ZÇĞİÖŞÜ]/u);
          expect(o.text).not.toMatch(/(^|\s)[a-zçğıöşü]{3,}[A-ZÇĞİÖŞÜ][a-zçğıöşü]/u);
        }
  });
});

describe("YKS Tarih kazanım/açıklama sütunları ayrık (ÖSYM 2026 YKS PDF)", () => {
  const tarih = REG.programs.find((p) => p.id === "yks-2026-tarih")!;
  const outcomes = tarih.units.flatMap((u) => u.outcomes);
  const byCode = new Map(outcomes.map((o) => [o.code, o]));
  it("kod/sayı korunur", () => {
    expect(outcomes.length).toBe(75);
    expect(new Set(outcomes.map((o) => o.code)).size).toBe(75);
  });
  it("kazanım metni yalnız kazanımı taşır", () => {
    expect(byCode.get("9.2.4")!.text).toBe(
      "İlk Çağ’da coğrafya ve iklimin, insanların hayat ve geçim tarzları üzerindeki belirleyici etkisini analiz eder.",
    );
    expect(byCode.get("10.2.1")!.text).toBe(
      "1302-1453 yılları arasındaki süreçte meydana gelen başlıca siyasi gelişmeleri tarih şeridi ve haritalar üzerinde gösterir.",
    );
    expect(byCode.get("11.1.4")!.text).toMatch(/rekabeti ve bu rekabette uyguladığı stratejileri analiz eder\.$/);
    for (const o of outcomes) {
      // açıklama sütunu sızıntısı: parantezli yıl listesi, "a)" imi, ezber uyarısı
      expect(o.text, o.code).not.toMatch(/\(\d{3,4}\),|(^|\s)[a-hç]\)\s|ezberletilme/);
      expect(o.text, o.code).toMatch(/[.!]$/);
    }
  });
  it("açıklama sınırlama alanında, sayfa numarası yok", () => {
    expect(byCode.get("9.2.4")!.limitations.join(" ")).toMatch(/girilmez/);
    for (const p of REG.programs.filter((x) => x.id.startsWith("yks-2026-")))
      for (const o of p.units.flatMap((u) => u.outcomes))
        for (const l of o.limitations) expect(l, `${p.id} ${o.code}`).not.toMatch(/\s\d{2,3}$/);
  });
});

describe("log konu adı ortak 120 sınırı", () => {
  it("kelime sınırında 120", () => {
    const long = "Türklerin İslamiyet’i kabul etmeye başlamaları ile Türkiye Selçuklu Devleti’nin kuruluşu arasındaki süreçte meydana gelen gelişmeler";
    const out = logTopic(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith("…")).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
    expect(logTopic("Kısa konu")).toBe("Kısa konu");
  });
});

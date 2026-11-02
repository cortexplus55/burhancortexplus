import { describe, expect, it } from "vitest";
import { blueprintBlocks, blueprintIssues, blueprintKind } from "@/lib/content-pool/blueprint";
import type { LessonBody } from "@/lib/content-pool/schema";

const opts = ["Birinci seçenek", "İkinci seçenek", "Üçüncü seçenek", "Dördüncü seçenek", "Beşinci seçenek"];
const klinik = {
  diagram: { kind: "process_network", title: "Patofizyoloji akışı", items: [{ label: "Tetik" }, { label: "Hasar" }, { label: "Bulgu" }] },
  table: { caption: "Ayırıcı tanı", columns: ["Hastalık", "Ayırt ettiren"], rows: [["A", "x"], ["B", "y"]] },
  spot: { title: "En sık / altın standart / ilk seçenek", points: ["En sık neden: X", "Altın standart: Y", "İlk seçenek: Z"] },
  trap: { title: "İlaç uyarısı", wrong: "Her hastada aynı ilaç verilir", right: "Kontrendikasyon önce dışlanır" },
  check: { stem: "45 yaşında hasta şu bulgularla başvuruyor. En olası tanı hangisidir?", options: opts, answer: 1, explanation: "Bulgular B ile uyumludur, diğerleri dışlanır." },
};
const lesson = (bp: unknown) => ({ sections: [{ outcome_code: "TUS.DDA.1.a", blueprint: bp }] }) as unknown as LessonBody;

describe("Sınav pedagojik iskeleti (sıfır maliyetli kapı)", () => {
  it("sınav türleri", () => {
    expect(["tus", "dus", "kpss", "ales", "dgs", "yds", "yks"].map(blueprintKind)).toEqual(["klinik", "klinik", "kpss", "akil", "akil", "yds", null]);
  });
  it("TUS: tam iskelet geçer, eksik blok ve 'en sık' yokluğu yakalanır", () => {
    expect(blueprintIssues(lesson(klinik), "klinik")).toEqual([]);
    const { trap: _t, ...noTrap } = klinik;
    expect(blueprintIssues(lesson(noTrap), "klinik")).toContain("TUS.DDA.1.a: iskelet bloğu eksik (trap)");
    expect(blueprintIssues(lesson({ ...klinik, spot: { title: "Kutu başlığı", points: ["Altın standart Y", "İlk seçenek Z"] } }), "klinik").join()).toContain("en sık");
    expect(blueprintIssues(lesson({ ...klinik, check: { ...klinik.check, options: opts.slice(0, 4) } }), "klinik").join()).toContain("beklenen 5");
  });
  it("KPSS: öncüllü soru ve uydurma yüzde yasağı", () => {
    const k = { table: klinik.table, spot: klinik.spot, trap: { title: "ÖSYM çeldiricisi", wrong: "Adayların %70'i bunu seçer", right: "Doğru tarih 1923" }, check: klinik.check };
    const issues = blueprintIssues(lesson(k), "kpss").join("|");
    expect(issues).toContain("öncüllü");
    expect(issues).toContain("oran/yüzde");
  });
  it("bloklar mevcut çizicilerle üretilir", () => {
    const types = blueprintBlocks(klinik, "klinik").map((b) => b.type);
    expect(types).toEqual(expect.arrayContaining(["diagram_card", "table", "note", "exam_trap_card", "check"]));
  });
});

describe("iskelet: bölüm içinde ve uzun metin", () => {
  it("ders isteminde blueprint bölüm nesnesinin içinde istenir", async () => {
    const { lessonPrompt } = await import("@/lib/content-pool/generate");
    const u = lessonPrompt({ program: { kind: "kpss", label: "KPSS", badge: "b" }, unit: { title: "T" }, outcomes: [{ code: "K.1", text: "x", limitations: [] }] } as never).user;
    expect(u.indexOf('"blueprint"')).toBeLessThan(u.indexOf('"summary"'));
  });
  it("uzun tablo hücresi iskeleti düşürmez, kırpılır", async () => {
    const { blueprintSchema } = await import("@/lib/content-pool/blueprint");
    const r = blueprintSchema.safeParse({ table: { caption: "Tablo", columns: ["A", "B"], rows: [["x".repeat(300), "y"], ["z", "w"]] } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.table!.rows[0][0].length).toBeLessThanOrEqual(160);
  });
});

describe("iskelet: dayanıklı okuma", () => {
  it("harf cevap, fazla satır ve bozuk ek blok iskeleti düşürmez", async () => {
    const { blueprintSchema } = await import("@/lib/content-pool/blueprint");
    const r = blueprintSchema.safeParse({
      diagram: { title: "x" },
      table: { caption: "Tablo", columns: ["A", "B", "C", "D", "E", "F"], rows: Array.from({ length: 20 }, () => ["a", "b"]) },
      check: { stem: "Soru kökü burada", options: ["a", "b", "c", "d", "e"], answer: "C)", explanation: "Açıklama metni", seconds: "60 sn" },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.diagram).toBeUndefined();
      expect(r.data.table!.columns).toHaveLength(5);
      expect(r.data.table!.rows).toHaveLength(14);
      expect(r.data.check!.answer).toBe(2);
      expect(r.data.check!.seconds).toBe(60);
    }
  });
});

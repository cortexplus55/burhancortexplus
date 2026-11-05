import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStudentMemory,
  classifyWrongAnswer,
  ERROR_KINDS,
  errorKindCoachLine,
  errorKindLabel,
  isEmptyMemory,
  loadStudentMemory,
  MEMORY_HEADER,
  MEMORY_LIMITS,
  parseStudentMemory,
  refreshStudentMemory,
  scanAttemptErrors,
  studentMemoryBlock,
  studentMemoryLines,
  type MemoryInputs,
  type StudentMemory,
} from "@/lib/learning/student-memory";
import { studentOutputText } from "@/lib/learning/student-output-firewall";

/*
  Öğrenci öğrenme hafızası (5 Kasım 2026). Üretim kodunda ders adı yok; disiplin örnekleri yalnız burada
  (fizik, kimya, iktisat, matematik, tarih, hukuk, biyoloji, coğrafya).
*/

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const single = (stem: string, options: string[], correct: string, chosen: string, timeMs: number | null = null) =>
  classifyWrongAnswer({ stem, options, correct: [correct], chosen: [chosen], multi: false, timeMs });

describe("yanlış türü sınıflandırıcı (modelsiz, disiplin bağımsız)", () => {
  it("fizik: seçilen sayı doğrunun eksilisi → işaret", () => {
    expect(
      single("Yukarı atılan cismin ivmesi kaç m/s² olur?", ["-9,8 m/s²", "9,8 m/s²", "0", "4,9 m/s²", "19,6 m/s²"], "-9,8 m/s²", "9,8 m/s²"),
    ).toBe("sign");
  });

  it("kimya: saat → saniye çarpanı (3600) ya da dakika (60) → birim dönüşümü", () => {
    expect(single("Tepkime 1,5 saatte tamamlanıyor; süre kaç saniyedir?", ["90", "540", "5400", "1500"], "5400", "90")).toBe("unit_factor");
    expect(single("Tepkime 1,5 saatte tamamlanıyor; süre kaç saniyedir?", ["90", "540", "5400", "1500"], "5400", "1500")).toBe("other");
  });

  it("fizik: aynı büyüklük farklı birim yazımıyla (50 cm / 5 m) → birim dönüşümü, aynı birimde 10 katı → büyüklük", () => {
    expect(single("Çubuğun boyu kaçtır?", ["50 cm", "5 m", "500 cm", "0,5 m"], "5 m", "50 cm")).toBe("unit_factor");
    expect(single("Çubuğun boyu kaç cm'dir?", ["50 cm", "500 cm", "5000 cm", "5 cm"], "500 cm", "5000 cm")).toBe("magnitude");
  });

  it("iktisat: Türkçe binlik noktalı sayılarda 10'un katı sapma → büyüklük", () => {
    expect(
      single("GSYH 2.500 milyar TL, nüfus 50 milyon; kişi başına gelir kaç TL?", ["5.000", "50.000", "500.000", "5.000.000"], "50.000", "500.000"),
    ).toBe("magnitude");
  });

  it("matematik: dik doğrunun eğiminde 1/doğru seçilmiş → ters çevirme; eksilisi → işaret", () => {
    const options = ["4", "-4", "1/4", "-1/4", "0"];
    expect(single("Eğimi 4 olan doğruya dik doğrunun eğimi kaçtır?", options, "-1/4", "-4")).toBe("reciprocal");
    expect(single("Eğimi 4 olan doğruya dik doğrunun eğimi kaçtır?", options, "-1/4", "1/4")).toBe("sign");
  });

  it("tarih: bir yıl kayması yuvarlama, %1–25 sapma işlem hatası", () => {
    expect(single("Kanun hangi yılda yürürlüğe girdi?", ["1923", "1924", "1934", "1961"], "1924", "1923")).toBe("rounding");
    expect(single("İki olay arasında kaç yıl geçmiştir?", ["32", "38", "45", "61"], "38", "32")).toBe("arithmetic");
    expect(single("Oran kaçtır?", ["3,14", "3,15", "2,71", "1,41"], "3,15", "3,14")).toBe("rounding");
  });

  it("hukuk: olumsuz kök ('değildir', 'söylenemez', 'hariç') tek doğru kaçırılınca → kutupluluk", () => {
    const options = ["Ölçülülük", "Kanunla sınırlama", "Yasama organının takdiri", "Öze dokunmama", "Demokratik toplum düzeni"];
    expect(single("Hangisi temel hakların sınırlandırılma ölçütlerinden biri değildir?", options, "Yasama organının takdiri", "Ölçülülük")).toBe(
      "polarity",
    );
    expect(single("Bu sözleşme için hangisi söylenemez?", options, options[2]!, options[0]!)).toBe("polarity");
    expect(single("Aşağıdakiler bir idari işlemin unsurlarıdır, biri hariç. Hangisi?", options, options[2]!, options[3]!)).toBe("polarity");
    // "değilse" olumsuz kök değildir; "not ortalaması" da değildir.
    expect(single("Sözleşme geçerli değilse hangi yaptırım uygulanır?", options, options[1]!, options[0]!)).toBe("other");
  });

  it("biyoloji: öncüllü kökte seçilen küme doğru kümenin alt ya da üst kümesi → öncül alt kümesi", () => {
    const stem = "I. Ribozom\nII. Hücre zarı\nIII. Kloroplast\nYukarıdakilerden hangileri bütün canlı hücrelerde bulunur?";
    const options = ["Yalnız I", "Yalnız II", "I ve II", "II ve III", "I, II ve III"];
    expect(single(stem, options, "I ve II", "Yalnız II")).toBe("premise_subset");
    expect(single(stem, options, "I ve II", "I, II ve III")).toBe("premise_subset");
    // Kesişmeyen küme alt küme değildir.
    expect(single(stem, options, "I ve II", "II ve III")).toBe("other");
    // Öncülsüz kökte Roma rakamı taşıyan şık öncül sayılmaz.
    expect(single("Hangisi doğrudur?", options, "I ve II", "Yalnız II")).toBe("other");
  });

  it("coğrafya: çok cevaplıda eksik seçim ve fazladan seçim", () => {
    const base = { stem: "Hangileri Akdeniz ikliminin özellikleridir?", options: ["Yazlar kurak", "Kışlar ılık", "Her mevsim yağışlı", "Kar örtüsü uzun"], multi: true };
    expect(classifyWrongAnswer({ ...base, correct: ["Yazlar kurak", "Kışlar ılık"], chosen: ["Yazlar kurak"] })).toBe("partial_select");
    expect(classifyWrongAnswer({ ...base, correct: ["Yazlar kurak", "Kışlar ılık"], chosen: ["Yazlar kurak", "Kışlar ılık", "Kar örtüsü uzun"] })).toBe(
      "over_select",
    );
    // Şık yazımındaki boşluk farkı kümeyi bozmaz.
    expect(classifyWrongAnswer({ ...base, correct: ["Yazlar kurak", "Kışlar ılık"], chosen: [" Yazlar  kurak "] })).toBe("partial_select");
  });

  it("sözel soruda tür bulunamazsa 4 sn altı cevap acele, üstü diğer; doğru cevap diğer", () => {
    const options = ["Bir", "İki", "Üç", "Dört"];
    expect(single("Hangisi doğrudur?", options, "Bir", "İki", 2500)).toBe("hurried");
    expect(single("Hangisi doğrudur?", options, "Bir", "İki", 8000)).toBe("other");
    expect(single("Hangisi doğrudur?", options, "Bir", "İki")).toBe("other");
    expect(single("Hangisi doğrudur?", options, "Bir", "Bir", 1000)).toBe("other");
    expect(classifyWrongAnswer({ stem: "x", options, correct: ["Bir"], chosen: [], multi: false })).toBe("other");
  });

  it("her türün öğrenci etiketi ve öğretmen talimatı var; ders adı geçmiyor", () => {
    const subjects = /(matematik|fizik|kimya|biyoloji|tarih|coğrafya|hukuk|iktisat|edebiyat)/iu;
    for (const kind of ERROR_KINDS) {
      expect(errorKindLabel(kind).length).toBeGreaterThan(3);
      expect(errorKindCoachLine(kind).length).toBeGreaterThan(10);
      expect(errorKindLabel(kind)).not.toMatch(subjects);
      expect(errorKindCoachLine(kind)).not.toMatch(subjects);
    }
    const source = read("src/lib/learning/student-memory/error-kinds.ts") + read("src/lib/learning/student-memory/prompt.ts");
    expect(source).not.toMatch(subjects);
  });
});

describe("kayıttan yanlışlar (scanAttemptErrors)", () => {
  it("test kaydında boş cevap sayılmaz, hatalı soru atlanır, yanlışlar türlenir", () => {
    const payload = {
      type: "quiz",
      questions: [
        { text: "Hız kaç m/s?", options: ["-3", "3", "6", "9"], correct: ["-3"], multi: false },
        { text: "Hangisi?", options: ["A", "B"], correct: ["A"], multi: false },
        { text: "Hatalı soru", options: ["A", "B"], correct: ["A"], multi: false, voided: true },
        { text: "Doğru olan?", options: ["A", "B"], correct: ["B"], multi: false },
      ],
    };
    const scan = scanAttemptErrors(payload, { "0": "3", "1": "", "2": "B", "3": "B" }, "2026-11-03T10:00:00Z");
    expect(scan.answered).toBe(2);
    expect(scan.wrong).toEqual([{ kind: "sign", at: "2026-11-03T10:00:00Z" }]);
  });

  it("doğru/yanlış kaydında olumsuz önerme kaçırılınca kutupluluk; dizgi cevap da okunur", () => {
    const payload = {
      type: "true_false",
      items: [
        { text: "Bu bulgu acil müdahale gerektirmez.", correct: false },
        { text: "Hücre zarı seçici geçirgendir.", correct: true },
      ],
    };
    const scan = scanAttemptErrors(payload, { "0": true, "1": "true" }, null);
    expect(scan.answered).toBe(2);
    expect(scan.wrong).toEqual([{ kind: "polarity", at: null }]);
  });

  it("ders, kart ve podcast kayıtları boş döner", () => {
    expect(scanAttemptErrors({ type: "lesson" }, {}, null)).toEqual({ answered: 0, wrong: [] });
    expect(scanAttemptErrors(null, null, null)).toEqual({ answered: 0, wrong: [] });
  });
});

const NOW = new Date("2026-11-05T12:00:00Z");

function inputs(overrides: Partial<MemoryInputs> = {}): MemoryInputs {
  return {
    now: NOW,
    wrongAnswers: [],
    answeredCount: 0,
    outcomes: [],
    misconceptions: [],
    mistakes: [],
    preferences: null,
    familiarities: [],
    responseTimesMs: [],
    ...overrides,
  };
}

describe("buildStudentMemory (saf)", () => {
  it("boş girdide boş hafıza", () => {
    const memory = buildStudentMemory(inputs());
    expect(isEmptyMemory(memory)).toBe(true);
    expect(memory.updatedAt).toBe(NOW.toISOString());
    expect(memory.pace).toEqual({ avgTimeMs: null, hurriedShare: null });
    expect(memory.style).toEqual({ explanationStyle: null, familiarity: null });
  });

  it("hata türleri sayıya, sonra son tarihe göre sıralanır", () => {
    const memory = buildStudentMemory(
      inputs({
        answeredCount: 12,
        wrongAnswers: [
          { kind: "rounding", at: "2026-11-02T00:00:00Z" },
          { kind: "sign", at: "2026-11-01T00:00:00Z" },
          { kind: "sign", at: "2026-11-03T00:00:00Z" },
          { kind: "polarity", at: "2026-11-04T00:00:00Z" },
        ],
      }),
    );
    expect(memory.sampleSize).toBe(12);
    expect(memory.errorKinds.map((row) => [row.kind, row.count, row.lastAt])).toEqual([
      ["sign", 2, "2026-11-03T00:00:00Z"],
      ["polarity", 1, "2026-11-04T00:00:00Z"],
      ["rounding", 1, "2026-11-02T00:00:00Z"],
    ]);
  });

  it("zayıf kazanımlar: n < 3 elenir, hâkimiyet artan, en çok 8", () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      outcomeId: `o${i}`,
      unitId: "u",
      programId: "p",
      alpha: 1 + i,
      beta: 10 - i,
      n: 5,
    }));
    const memory = buildStudentMemory(inputs({ outcomes: [...outcomes, { outcomeId: "thin", unitId: "u", programId: "p", alpha: 1, beta: 9, n: 2 }] }));
    expect(memory.weakOutcomes).toHaveLength(MEMORY_LIMITS.weakOutcomes);
    expect(memory.weakOutcomes[0]).toMatchObject({ outcomeId: "o0", mastery: 0.091, n: 5 });
    expect(memory.weakOutcomes.map((row) => row.mastery)).toEqual([...memory.weakOutcomes.map((row) => row.mastery)].sort((a, b) => a - b));
    expect(memory.weakOutcomes.some((row) => row.outcomeId === "thin")).toBe(false);
  });

  it("açık yanılgılar aynı iddiayı (yazım farkıyla) birleştirir, en çok 6; defter konuları toplanır, en çok 6", () => {
    const misconceptions = [
      { topicLabel: "Asit-baz", claim: "pH arttıkça asitlik artar" },
      { topicLabel: "asit-baz", claim: "PH  arttıkça asitlik artar" },
      ...Array.from({ length: 8 }, (_, i) => ({ topicLabel: null, claim: `iddia ${i}` })),
    ];
    const mistakes = [
      { topicLabel: "Mol Kavramı", wrongCount: 2 },
      { topicLabel: "mol kavramı", wrongCount: 3 },
      { topicLabel: null, wrongCount: 9 },
      ...Array.from({ length: 7 }, (_, i) => ({ topicLabel: `Konu ${i}`, wrongCount: 1 })),
    ];
    const memory = buildStudentMemory(inputs({ misconceptions, mistakes }));
    expect(memory.openMisconceptions).toHaveLength(MEMORY_LIMITS.openMisconceptions);
    expect(memory.openMisconceptions[0]).toEqual({ topicLabel: "Asit-baz", claim: "pH arttıkça asitlik artar", count: 2 });
    expect(memory.repeatedMistakeTopics).toHaveLength(MEMORY_LIMITS.repeatedMistakeTopics);
    expect(memory.repeatedMistakeTopics[0]).toEqual({ topicLabel: "Mol Kavramı", wrongCount: 5 });
  });

  it("tercih, aşinalık modu ve tempo", () => {
    const memory = buildStudentMemory(
      inputs({
        preferences: { modalities: ["practice", "reading", "practice"], style: "examples" },
        familiarities: ["basics", "good", "basics"],
        responseTimesMs: [2000, 3000, 10000, Number.NaN, -5],
      }),
    );
    expect(memory.style).toEqual({ modalities: ["practice", "reading"], explanationStyle: "examples", familiarity: "basics" });
    expect(memory.pace).toEqual({ avgTimeMs: 5000, hurriedShare: 0.67 });
  });

  it("kayıt JSON'u gidiş-dönüş; bilinmeyen tür satırı düşer; bozuk biçim null", () => {
    const memory = buildStudentMemory(inputs({ wrongAnswers: [{ kind: "sign", at: null }], answeredCount: 1 }));
    expect(parseStudentMemory(JSON.parse(JSON.stringify(memory)))).toEqual(memory);
    const tampered = { ...memory, errorKinds: [...memory.errorKinds, { kind: "telepathy", count: 3, lastAt: null }] };
    expect(parseStudentMemory(tampered)?.errorKinds.map((row) => row.kind)).toEqual(["sign"]);
    expect(parseStudentMemory({ version: "x" })).toBeNull();
    expect(parseStudentMemory(null)).toBeNull();
  });
});

function richMemory(): StudentMemory {
  return buildStudentMemory(
    inputs({
      answeredCount: 40,
      wrongAnswers: [
        { kind: "sign", at: "2026-11-01T09:00:00Z" },
        { kind: "sign", at: "2026-11-03T09:00:00Z" },
        { kind: "other", at: "2026-11-04T09:00:00Z" },
      ],
      outcomes: [{ outcomeId: "o1", unitId: "u", programId: "p", alpha: 1, beta: 4, n: 5 }],
      misconceptions: [{ topicLabel: "Stokiyometri", claim: "Sınırlayıcı bileşen her zaman az olan maddedir" }],
      mistakes: [{ topicLabel: "Stokiyometri", wrongCount: 4 }],
      responseTimesMs: [1500, 2000, 9000],
    }),
  );
}

describe("öğretmene giden satırlar (studentMemoryLines)", () => {
  it("boş hafıza ve null → satır yok (başlık da yok)", () => {
    expect(studentMemoryLines(null)).toEqual([]);
    expect(studentMemoryLines(buildStudentMemory(inputs()))).toEqual([]);
    expect(studentMemoryBlock(null)).toBe("");
  });

  it("başlık önde, konu eşleşen satır ilk, en sık hata 'other' değil, tarih kısa", () => {
    const lines = studentMemoryLines(richMemory(), { topicLabel: "Stokiyometri: sınırlayıcı bileşen" });
    expect(lines[0]).toBe(MEMORY_HEADER);
    expect(lines[1]).toContain("Bu konuda daha önce 4 soruyu yanlış cevapladı");
    expect(lines[2]).toContain("Sınırlayıcı bileşen her zaman az olan maddedir");
    expect(lines[3]).toContain("işaret hatası (2 kez, son 3 Kas)");
    expect(lines[3]).toContain(errorKindCoachLine("sign"));
    expect(lines.some((line) => line.includes("diğer"))).toBe(false);
  });

  it("konu eşleşmeyince genel sıra: en sık hata, zayıf kazanım, tempo; içerik en çok 3 satır", () => {
    const lines = studentMemoryLines(richMemory(), { topicLabel: "Gazlar" });
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^Daha önceki pratiklerde en sık yaptığı hata: işaret hatası/);
    expect(lines[2]).toContain("1 kazanımda hâkimiyeti düşük ölçüldü (en düşüğü %20)");
    expect(lines[3]).toContain("acele payı yüksek");
    // Beş aday varken (konu + yanılgı + hata + kazanım + tempo) yine başlık + 3.
    expect(studentMemoryLines(richMemory(), { topicLabel: "Stokiyometri" })).toHaveLength(4);
    expect(studentMemoryLines(richMemory(), { max: 1 })).toHaveLength(2);
    expect(studentMemoryBlock(richMemory(), { max: 2 }).split("\n")).toHaveLength(3);
  });

  it("içerik satırlarında uydurma anı sözcükleri yok; öğrenci süzgeci başlık dahil hiçbir satırı silmez", () => {
    // Başlık yasağı alıntılar ("'geçen gün' deme"); içerik satırları o sözcükleri hiç kullanmaz.
    const fabricated = /geçen(?:lerde|\s+(?:gün|hafta|ay|yıl|sene))/iu;
    for (const topicLabel of [null, "Stokiyometri", "Gazlar"]) {
      const lines = studentMemoryLines(richMemory(), { topicLabel });
      for (const line of lines.slice(1)) expect(line).not.toMatch(fabricated);
      for (const line of lines) expect(studentOutputText(line)).toBe(line);
      const block = lines.join("\n");
      expect(studentOutputText(block)).toBe(block);
    }
  });
});

/* ───────────── Kayıt: sahte Supabase ───────────── */

type FakeTables = Record<string, { rows?: Record<string, unknown>[]; error?: { code?: string; message?: string } }>;

function fakeService(tables: FakeTables) {
  const upserts: { table: string; payload: Record<string, unknown>; options: unknown }[] = [];
  const reads: string[] = [];
  const service = {
    from(table: string) {
      reads.push(table);
      const entry = tables[table] ?? { rows: [] };
      let wantSingle = false;
      let upserted: Record<string, unknown> | null = null;
      const query: Record<string, unknown> = {};
      const chain = () => query;
      for (const name of ["select", "eq", "neq", "in", "is", "not", "gte", "gt", "lte", "lt", "order", "limit"]) query[name] = chain;
      query.maybeSingle = () => {
        wantSingle = true;
        return query;
      };
      query.upsert = (payload: Record<string, unknown>, options: unknown) => {
        upserted = payload;
        upserts.push({ table, payload, options });
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        if (entry.error?.code === "THROW") return Promise.reject(new Error("network down")).then(resolve, reject);
        if (upserted) return Promise.resolve({ data: null, error: entry.error ?? null }).then(resolve, reject);
        const rows = entry.rows ?? [];
        const data = wantSingle ? (rows[0] ?? null) : rows;
        return Promise.resolve({ data: entry.error ? null : data, error: entry.error ?? null }).then(resolve, reject);
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { service, upserts, reads };
}

const quizAttempt = {
  payload: {
    type: "quiz",
    questions: [
      { text: "Yük kaç C?", options: ["-2", "2", "4", "8"], correct: ["-2"], multi: false },
      { text: "Kütle kaç g?", options: ["5", "50", "500", "5000"], correct: ["50"], multi: false },
    ],
  },
  answers: { "0": "2", "1": "500" },
  updated_at: "2026-11-03T08:00:00Z",
};

describe("kayıt: refreshStudentMemory ve loadStudentMemory", () => {
  it("kaynakları okur, özeti kurar ve user_id üstüne upsert eder", async () => {
    const { service, upserts } = fakeService({
      exam_prep_node_attempts: { rows: [quizAttempt] },
      outcome_mastery: { rows: [{ outcome_id: "o1", unit_id: "u1", program_id: "p1", alpha: "1", beta: "4", n: 5 }] },
      exam_prep_misconceptions: { rows: [{ topic_label: "Elektrik", claim: "Yük her zaman pozitiftir" }] },
      mistake_entries: { rows: [{ topic_label: "Elektrik", wrong_count: 3 }] },
      exam_preps: { rows: [{ id: "prep1", learning_preferences: { modalities: ["practice"], style: "theory" } }] },
      exam_prep_topics: { rows: [{ familiarity: "heard" }, { familiarity: "heard" }, { familiarity: "good" }] },
      item_responses: { rows: [{ time_ms: 3000 }, { time_ms: 9000 }] },
    });
    const memory = await refreshStudentMemory(service, "user-1", NOW);
    expect(memory).not.toBeNull();
    expect(memory!.sampleSize).toBe(2);
    expect(memory!.errorKinds.map((row) => row.kind).sort()).toEqual(["magnitude", "sign"]);
    expect(memory!.weakOutcomes).toEqual([{ outcomeId: "o1", unitId: "u1", programId: "p1", mastery: 0.2, n: 5 }]);
    expect(memory!.openMisconceptions).toEqual([{ topicLabel: "Elektrik", claim: "Yük her zaman pozitiftir", count: 1 }]);
    expect(memory!.repeatedMistakeTopics).toEqual([{ topicLabel: "Elektrik", wrongCount: 3 }]);
    expect(memory!.style).toEqual({ modalities: ["practice"], explanationStyle: "theory", familiarity: "heard" });
    expect(memory!.pace).toEqual({ avgTimeMs: 6000, hurriedShare: 0.5 });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      table: "student_learning_memory",
      payload: { user_id: "user-1", version: 1, updated_at: NOW.toISOString() },
      options: { onConflict: "user_id" },
    });
    expect(upserts[0]!.payload.memory).toEqual(memory);
  });

  it("bir kaynak düşerse özet YAZILMAZ ve null döner; tablo yoksa (42P01) boş sayılır ve yazılır", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const failing = fakeService({ exam_prep_node_attempts: { rows: [quizAttempt] }, mistake_entries: { error: { code: "PGRST301", message: "timeout" } } });
      expect(await refreshStudentMemory(failing.service, "user-1", NOW)).toBeNull();
      expect(failing.upserts).toHaveLength(0);

      const thrown = fakeService({ outcome_mastery: { error: { code: "THROW" } } });
      expect(await refreshStudentMemory(thrown.service, "user-1", NOW)).toBeNull();
      expect(thrown.upserts).toHaveLength(0);

      const missing = fakeService({
        exam_prep_node_attempts: { rows: [quizAttempt] },
        item_responses: { error: { code: "42P01", message: 'relation "item_responses" does not exist' } },
      });
      const memory = await refreshStudentMemory(missing.service, "user-1", NOW);
      expect(memory?.errorKinds.length).toBe(2);
      expect(missing.upserts).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("hafıza tablosu yokken yazım uyarıyla atlanır, okuma null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { service } = fakeService({ student_learning_memory: { error: { code: "42P01", message: "relation does not exist" } } });
      expect(await refreshStudentMemory(service, "user-1", NOW)).toBeNull();
      expect(warn).toHaveBeenCalledWith("student_memory_table_missing", expect.anything());
      expect(await loadStudentMemory(service, "user-1")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it("okuma: kayıt varsa ayrıştırır, yoksa null, hata fırlarsa null", async () => {
    const stored = richMemory();
    const { service } = fakeService({ student_learning_memory: { rows: [{ memory: JSON.parse(JSON.stringify(stored)) }] } });
    expect(await loadStudentMemory(service, "user-1")).toEqual(stored);
    expect(await loadStudentMemory(fakeService({}).service, "user-1")).toBeNull();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await loadStudentMemory(fakeService({ student_learning_memory: { error: { code: "THROW" } } }).service, "user-1")).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
});

/* ───────────── Göç (PGlite) ───────────── */

describe("göç 20261105120000_student_learning_memory", () => {
  const db = new PGlite();
  const user = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${user}');`);
    await db.exec(read("supabase/migrations/20261105120000_student_learning_memory.sql"));
    // Yalnız ekleme: ikinci koşu hata vermez.
    await db.exec(read("supabase/migrations/20261105120000_student_learning_memory.sql"));
  }, 30_000);
  afterAll(() => db.close());

  it("kullanıcı başına tek satır, upsert, RLS açık, politika yok, hesap silinince CASCADE", async () => {
    await db.query("INSERT INTO student_learning_memory (user_id, memory) VALUES ($1, '{\"version\":1}'::jsonb)", [user]);
    await db.query(
      `INSERT INTO student_learning_memory (user_id, memory, version, updated_at) VALUES ($1, '{"version":1,"sampleSize":3}'::jsonb, 1, now())
       ON CONFLICT (user_id) DO UPDATE SET memory = EXCLUDED.memory, updated_at = EXCLUDED.updated_at`,
      [user],
    );
    const { rows } = await db.query<{ n: number; sample: number }>(
      "SELECT count(*)::int AS n, max((memory->>'sampleSize')::int) AS sample FROM student_learning_memory",
    );
    expect(rows[0]).toEqual({ n: 1, sample: 3 });

    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'student_learning_memory'");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const policies = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'student_learning_memory'");
    expect(policies.rows[0]?.n).toBe(0);

    await db.query("DELETE FROM auth.users WHERE id = $1", [user]);
    const left = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM student_learning_memory");
    expect(left.rows[0]?.n).toBe(0);
  });
});

/* ───────────── Bağlama bekçileri (kaynak) ───────────── */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("bağlama", () => {
  it("hesap silme listesinde tablo var ve isteğe bağlı", () => {
    const deletion = read("src/lib/privacy/account-deletion.ts");
    expect(deletion).toContain('"student_learning_memory",');
    expect(deletion).toMatch(/OPTIONAL_PURGE_TABLES = new Set\(\[[^\]]*"student_learning_memory"/);
  });

  it("yenileme etkinlik bitişinde ve deneme notlandıktan sonra arka planda; okuma sohbet, ses ve ders isteminde", () => {
    expect(read("src/lib/learning/node/complete.ts")).toMatch(/deferTask\(\(\) => refreshStudentMemory\(service, userId\), background\)/);
    expect(read("src/lib/learning/mock-exam/grade-exam.ts")).toMatch(/afterResponse\(\(\) => refreshStudentMemory\(service, userId\)\)/);
    const chat = read("src/app/api/ai/chat/route.ts");
    expect(chat).toContain("loadStudentMemory(service, userId)");
    expect(chat).toMatch(/tutorHistoryLine\(examContext\?\.history \?\? \[\]\),\s*\.\.\.memoryLines,/);
    const voice = read("src/app/api/learning/exam-prep/voice/route.ts");
    expect(voice).toContain("studentMemoryLines(await memoryEarly, { topicLabel: parsed.data.topicLabel })");
    const lesson = read("src/lib/learning/node/lesson.ts");
    expect(lesson).toContain("studentMemoryBlock(await memoryEarly, { topicLabel: input.topicLabel })");
    expect(read("src/app/ilerleme/page.tsx")).toMatch(/settle(<[^>]*>+)?\(\s*"learning_memory"/);
    expect(read("src/app/ilerleme/page.tsx")).toContain("<LearningDnaCard memory={learningMemory} />");
  });

  it("ortak havuz içeriği (content-pool, outcome-lesson) hafızayı okumaz", () => {
    const offenders = [...walk("src/lib/content-pool"), ...walk("src/lib").filter((file) => /outcome-lesson/.test(file))]
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /student-memory/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("kart sunucu bileşeni; 'use client' değil ve model çağrısı yok", () => {
    const card = read("src/components/student/learning-dna-card.tsx");
    expect(card).not.toMatch(/^\s*["']use client["']/);
    const moduleSource = ["error-kinds", "summary", "attempt-errors", "prompt", "store", "index"]
      .map((name) => read(`src/lib/learning/student-memory/${name}.ts`))
      .join("\n");
    expect(moduleSource).not.toMatch(/openai|generateJson|@\/lib\/ai\//);
    expect(moduleSource).not.toMatch(/\bany\b|@ts-ignore|@ts-expect-error/);
  });
});

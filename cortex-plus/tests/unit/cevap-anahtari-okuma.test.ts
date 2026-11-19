/**
 * Cevap anahtarı okuma açığı (19 Kasım 2026, Faz 2 denetimi). Satır güvenliği "satır benimse okurum" diyordu, sütun sınırı
 * yoktu: öğrenci açık anahtarla süren sınavının doğru cevabını doğrudan tablodan okuyabiliyordu. Göç anahtar sütunlarının
 * tarayıcı okumasını kapatır; kod bu sütunları yalnız sunucu anahtarıyla okur.
 *
 * Bekçi: (1) göçün sütun listesi kodun tek kaynağıyla aynı; (2) göç yalnız izin kısar; (3) süren sınavın sorusu anahtarsız;
 * (4) öğrenci oturumlu istemciyle anahtar sütunu okuyan kod yok.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANSWER_KEY_COLUMNS, stripAnswerKeyForActiveExam } from "@/lib/security/answer-key-columns";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261119150000_cevap_anahtari_okuma_kapat.sql";

describe("göç: anahtar sütunları tarayıcıya kapalı", () => {
  const sql = read(MIGRATION);

  it("sütun listesi kodun tek kaynağıyla birebir aynı", () => {
    const listed = new Map<string, string[]>();
    for (const match of sql.matchAll(/\('([a-z_]+)', ARRAY\[([^\]]+)\]\)/g)) {
      listed.set(match[1]!, [...match[2]!.matchAll(/'([a-z_]+)'/g)].map((item) => item[1]!));
    }
    expect(Object.fromEntries(listed)).toEqual(
      Object.fromEntries(Object.entries(ANSWER_KEY_COLUMNS).map(([table, columns]) => [table, [...columns]])),
    );
  });

  it("yalnız izin kısar: tablo düzeyi SELECT kalkar, anahtarsız sütunlar authenticated'a geri verilir; yıkıcı komut yok", () => {
    const code = sql.replace(/^--.*$/gm, "");
    expect(code).toContain("REVOKE SELECT ON TABLE public.%I FROM anon, authenticated");
    expect(code).toContain("GRANT SELECT (%s) ON TABLE public.%I TO authenticated");
    expect(code).toContain("NOT (a.attname = ANY (target.hidden))");
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER TABLE|POLICY)\b/);
    expect(read("supabase/rollback/20261119_cevap_anahtari_okuma_geri_al.sql")).toContain(
      "GRANT SELECT ON TABLE public.%I TO authenticated",
    );
  });
});

describe("süren sınav: soru anahtarsız gider", () => {
  it("doğru cevap, açıklama, örnek çözüm ve rubrik çıktıda yok; eksik alanlar güvenli varsayılana iner", () => {
    const row = {
      id: "q1",
      question_text: "Bir dik üçgende hipotenüs nedir?",
      options: ["Kısa kenar", "En uzun kenar", 3],
      question_type: "mcq",
      points: 2,
      correct_answer: "En uzun kenar",
      correct_answers: ["En uzun kenar"],
      explanation: "Dik açının karşısındaki kenar.",
      model_answer: "x",
      rubric: [{ point: "y" }],
    };
    const out = stripAnswerKeyForActiveExam(row);
    expect(out).toEqual({
      id: "q1",
      text: "Bir dik üçgende hipotenüs nedir?",
      options: ["Kısa kenar", "En uzun kenar"],
      question_type: "mcq",
      points: 2,
    });
    expect(JSON.stringify(out)).not.toMatch(/correct|explanation|model_answer|rubric|Dik açının/);
    expect(stripAnswerKeyForActiveExam({ id: 7 })).toEqual({ id: "7", text: "", options: [], question_type: "mcq", points: 1 });
  });

  it("deneme sayfası soruları yalnız anahtarsız sütunlarla okur ve soyucudan geçirir", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/page.tsx");
    expect(page).toContain('.select("id, question_text, options, question_type, points")');
    expect(page).toContain("stripAnswerKeyForActiveExam(row as Record<string, unknown>)");
  });
});

describe("öğrenci oturumlu istemci anahtar sütunu okumaz", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it("anahtar sütunlarını seçen her okuma sunucu istemcisiyle", () => {
    const offenders: string[] = [];
    for (const file of files("src")) {
      const source = read(file);
      for (const [table, columns] of Object.entries(ANSWER_KEY_COLUMNS)) {
        const pattern = new RegExp(`([\w.()]+)\s*\n?\s*\.from\("${table}"\)([\s\S]{0,260})`, "g");
        for (const match of source.matchAll(pattern)) {
          const selected = /\.select\(\s*"([^"]*)"/.exec(match[2]!)?.[1];
          if (selected === undefined) continue;
          const hit = selected === "*" || columns.some((column) => new RegExp(`(^|[\s,>-])${column}\b`).test(selected));
          if (!hit) continue;
          if (/service|admin|createServiceClient/i.test(match[1]!)) continue;
          offenders.push(`${file}:${source.slice(0, match.index).split("\n").length} ${match[1]} ${selected}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("anahtar okuyan yardımcılar öğrenci istemcisiyle çağrılmaz", () => {
    for (const file of files("src")) {
      expect(read(file), file).not.toMatch(/loadExamChatContext\(supabase\b/);
    }
  });
});

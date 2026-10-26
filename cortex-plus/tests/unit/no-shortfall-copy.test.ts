import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = [
  "Bu bölüm bu sefer yetişmedi",
  "Ders bu sefer tamamlanamadı",
  "Bağlantı kurulamadı",
  "elde soru yok",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("no shortfall copy", () => {
  it("student source has none of the forbidden sentences", () => {
    const hits: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      for (const phrase of FORBIDDEN) {
        if (text.includes(phrase)) hits.push(`${file}: ${phrase}`);
      }
      if (/Planlanan\s+\d+[^\n]{0,80}sorudan/.test(text)) hits.push(`${file}: Planlanan N sorudan`);
    }
    expect(hits).toEqual([]);
  });

  it("publish paths do not ship a short assessment", () => {
    const quiz = readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8");
    expect(quiz).toContain("if (questions.length < input.count)");
    expect(quiz).not.toContain("Math.min(minimum");
    const cards = readFileSync("src/app/api/learning/flashcards/generate/route.ts", "utf8");
    expect(cards).not.toContain("Math.min(4, count)");
    expect(cards).toContain("cards.length >= count");
    const tf = readFileSync("src/app/api/learning/true-false/generate/route.ts", "utf8");
    expect(tf).not.toContain("Math.min(4, count)");
    const fill = readFileSync("src/lib/learning/prep-topic-fill.ts", "utf8");
    expect(fill).not.toContain("minimum: 1");
    const exam = readFileSync("src/lib/learning/mock-exam/create.ts", "utf8");
    expect(exam).toContain("note: null");
    expect(exam).not.toContain("Planlanan ");
  });

  it("the generation job migration is additive", () => {
    const sql = readFileSync("supabase/migrations/20261026120000_generation_jobs.sql", "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("the deneme fixture page is closed unless the e2e flag is set", () => {
    const page = readFileSync("src/app/e2e/deneme/page.tsx", "utf8");
    expect(page).toContain('E2E_FIXTURE !== "1"');
    expect(page).toContain("notFound");
    expect(page).toContain("ParityExamRunner");
  });
});

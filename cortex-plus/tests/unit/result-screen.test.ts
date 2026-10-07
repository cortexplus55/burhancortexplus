import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resultMood } from "@/lib/learning/result-mood";

const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
const route = readFileSync("src/app/api/learning/exam-prep/rating/route.ts", "utf8");

describe("sonuç ekranı (Astra düzeni, 30 Eylül 2026)", () => {
  it("ton skora göre: harika / güzel / çalış", () => {
    expect(resultMood(6, 7)).toMatchObject({ text: "Harika iş çıkardın!", tone: "great" });
    expect(resultMood(5, 7)).toMatchObject({ text: "Güzel gidiyor", tone: "good" });
    expect(resultMood(2, 7).tone).toBe("work");
    expect(resultMood(0, 0).tone).toBe("work");
  });

  it("büyük skor, doğruluk ve süre satırları ile anket çiziliyor", () => {
    expect(session).toContain('className="cp-result-hero"');
    expect(session).toContain("<dt>Harcanan zaman</dt>");
    expect(session).toContain("<LessonRatingCard attemptId={attemptId} />");
  });

  it("anket yalnızca öğrencinin kendi denemesine yazılıyor", () => {
    expect(route).toContain('.eq("user_id", userId)');
    expect(route).toContain('z.enum(LESSON_RATINGS)');
    // Route dosyası HTTP fonksiyonları dışında dışa aktarım yapmamalı (Next derlemesi).
    expect(route).not.toMatch(/export const /);
  });
});

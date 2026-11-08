import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachReaction, consecutiveCorrect, lessonSpark, locativeSuffix, streakBadge } from "@/lib/learning/coach-reactions";

/*
  Enerjik koç ve mikro-dopamin katmanı (7 Kasım 2026): deterministik, modelsiz. Seri rozeti 2'de başlar; koç cümlesi
  ipucu, seri, ilk deneme ve yanlış durumlarına göre değişir; yanlışta azar yok. Ders kıvılcımı yalnız anlamlı adımda.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("seri", () => {
  it("art arda doğru sondan geriye sayılır; yanlış ya da cevapsız keser", () => {
    expect(consecutiveCorrect([])).toBe(0);
    expect(consecutiveCorrect([true, true, true])).toBe(3);
    expect(consecutiveCorrect([true, false, true, true])).toBe(2);
    expect(consecutiveCorrect([true, true, null])).toBe(0);
    expect(consecutiveCorrect([false])).toBe(0);
  });

  it("rozet 2'de başlar, 5'te 'kusursuz'", () => {
    expect(streakBadge(0)).toBeNull();
    expect(streakBadge(1)).toBeNull();
    expect(streakBadge(2)).toBe("⚡ 2'de 2! Ritim tuttun");
    expect(streakBadge(3)).toBe("🔥 3'te 3 seri! Harika gidiyorsun");
    expect(streakBadge(4)).toContain("4'te 4");
    expect(streakBadge(5)).toBe("🚀 5'te 5 kusursuz seri! Sınav kıvamındasın");
    expect(streakBadge(7)).toContain("7'de 7");
    expect(streakBadge(6)).toContain("6'da 6");
    expect(streakBadge(2.5)).toBeNull();
  });

  it("sayıya bulunma eki Türkçe okunuşa göre", () => {
    expect([3, 4, 5, 6, 7, 9, 10, 20, 40, 100].map(locativeSuffix)).toEqual(["te", "te", "te", "da", "de", "da", "da", "de", "ta", "de"]);
  });
});

describe("koç tepkisi", () => {
  it("ipucuyla doğru → ipucuyu över; seri 3+ → seriyi; ilk denemede doğru → nokta atışı", () => {
    expect(coachReaction({ correct: true, streak: 1, usedHint: true }).text).toContain("İpucuyla");
    expect(coachReaction({ correct: true, streak: 4, usedHint: true }).text).toContain("İpucuyla");
    expect(coachReaction({ correct: true, streak: 3 }).text).toBe("🔥 Üst üste 3. doğrun! Bu konunun mantığı iyice oturdu, hız kesme.");
    expect(coachReaction({ correct: true, streak: 1 }).text).toContain("Nokta atışı");
    expect(coachReaction({ correct: true, streak: 2 }).tone).toBe("right");
  });

  it("yanlışta azar yok, davet var; kısmen doğru ayrı", () => {
    const wrong = coachReaction({ correct: false, streak: 0 });
    expect(wrong.tone).toBe("off");
    expect(wrong.text).toMatch(/Moral bozmak yok/);
    expect(wrong.text).not.toMatch(/yanlış yaptın|başarısız|maalesef/i);
    const partial = coachReaction({ correct: false, streak: 0, partial: 50 });
    expect(partial.tone).toBe("partial");
    expect(partial.text).toContain("Kısmen doğru");
  });

  it("tutulamayan söz vermez: '+N net' gibi iddia yok", () => {
    const texts = [
      coachReaction({ correct: true, streak: 1 }).text,
      coachReaction({ correct: true, streak: 3 }).text,
      coachReaction({ correct: true, streak: 1, usedHint: true }).text,
      coachReaction({ correct: false, streak: 0 }).text,
      lessonSpark({ hadTrap: true }) ?? "",
      lessonSpark({ hadFormula: true }) ?? "",
      lessonSpark({ enteringLast: true }) ?? "",
    ];
    for (const text of texts) expect(text).not.toMatch(/\+\s?\d+\s*net|net cepte/i);
  });
});

describe("ders kıvılcımı", () => {
  it("son adım > tuzak > formül; sıradan adımda hiç", () => {
    expect(lessonSpark({ enteringLast: true, hadTrap: true })).toContain("Son adım");
    expect(lessonSpark({ hadTrap: true, hadFormula: true })).toContain("tuzağı");
    expect(lessonSpark({ hadFormula: true })).toContain("Formül");
    expect(lessonSpark({})).toBeNull();
  });
});

describe("bağlantılar (kaynak denetimi)", () => {
  it("test ve doğru/yanlış ekranları seriyi kilitlenmiş cevaplardan sayar, ipucu durumunu koça verir", () => {
    const quiz = read("src/components/parity/exam-node/quiz.tsx");
    expect(quiz).toContain("revealedRef.current.has(key)");
    expect(quiz).toContain("streakBefore={isTimedExam ? 0 : streakBefore}");
    expect(quiz).toContain("usedHint={Boolean(hintAt[String(index)])}");
    const play = read("src/components/parity/exam-quiz-play.tsx");
    expect(play).toContain("<CoachLine input={{ correct: isCorrect, streak: streakNow, usedHint, partial, mood }} />");
    expect(play).toContain("{showFeedback ? <StreakBadge streak={streakNow} /> : null}");
    const tf = read("src/components/parity/exam-node/true-false.tsx");
    expect(tf).toContain("streakBefore={streakBefore}");
    const lesson = read("src/components/parity/exam-lesson-steps.tsx");
    expect(lesson).toContain("sparkFor(step, index + 1)");
    expect(lesson).toContain("<LessonSpark text={spark.text} token={spark.token} />");
  });

  it("hareket azaltmada animasyon yok; seri sarı (marka rengi), koç cümlesi yanlışta kırmızı değil", () => {
    const css = read("src/styles/coach.css");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
    expect(css).toContain("color: var(--c-brand);");
    expect(css).toMatch(/\.cp-coach--off \{\s*color: var\(--c-text\);/);
  });
});

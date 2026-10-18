import { isLessonV3, readLessonV2, readLessonV3 } from "@/lib/learning/lesson-v3";
import { shuffleLessonChecks } from "@/lib/learning/teacher-lesson";

/**
 * "Dersi tekrarla" (18 Ekim 2026, ürün sahibinin kararı): aynı ders yeni bir kayıtta açılır —
 * anında ve ücretsiz. Çoktan seçmeli şıklar başka bir sırayla karışır (doğru şık yerini
 * ezberlenmesin), cevaplar sıfırdan. Yazım bayrakları ve devralma işareti taşınmaz. Yeni bir
 * anlatım isteyen öğrenci "Farklı anlat"la dersi yeniden yazdırır.
 */
export function replayLessonPayload(payload: unknown, salt: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.type !== "lesson" || !row.lesson) return null;
  if (row.building === true) return null;
  const { building, builtAt, upcoming, adoptedPrefetch, ...rest } = row;
  void building;
  void builtAt;
  void upcoming;
  void adoptedPrefetch;
  if (isLessonV3(row.lesson)) {
    const lesson = readLessonV3(row.lesson);
    return lesson ? { ...rest, lesson: shuffleLessonChecks(lesson, salt), replayed: true } : null;
  }
  return readLessonV2(row.lesson) ? { ...rest, replayed: true } : null;
}

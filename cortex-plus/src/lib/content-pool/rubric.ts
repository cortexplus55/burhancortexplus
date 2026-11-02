import type { LessonBody } from "@/lib/content-pool/schema";

/**
 * Havuz dersi kalite rubriği (2 Kasım 2026, ürün sahibinin kararı: "herkese öğretebilecek seviyede"). Sıfır maliyetli kod
 * denetimi: yeni başlayana tanımlar (key_terms ≥3), her kazanımda adım adım anlatım (steps ≥2), çözümlü örnek,
 * sık yapılan hata, temel→orta→ileri basamak; derste özet. Alanlar şemada isteğe bağlı (eski kayıtlar okunur);
 * eksikse ders "zayıf" sayılır ve yalnız anlatım yeniden yazılır (sorular kalır).
 */
export const RUBRIC_VERSION = 1;

export function lessonRubricIssues(lesson: LessonBody): string[] {
  const issues: string[] = [];
  if ((lesson.key_terms ?? []).length < 3) issues.push("başlangıç tanımları eksik (en az 3 terim)");
  if (lesson.summary.trim().length < 80) issues.push("özet çok kısa");
  for (const s of lesson.sections) {
    const code = s.outcome_code.trim();
    if ((s.steps ?? []).length < 2) issues.push(`${code}: adım adım anlatım yok`);
    if ((s.worked_example ?? "").trim().length < 80) issues.push(`${code}: çözümlü örnek yok`);
    if (!(s.common_mistakes ?? []).length) issues.push(`${code}: sık yapılan hata yok`);
    const l = s.ladder;
    if (!l || [l.temel, l.orta, l.ileri].some((x) => (x ?? "").trim().length < 15)) issues.push(`${code}: temel→orta→ileri basamak eksik`);
  }
  return issues;
}

export const RUBRIC_PROMPT =
  "Ders hiç bilmeyen birine de öğretebilmeli. Kurallar: (1) key_terms: ünitenin temel terimleri, her biri sade bir tanımla " +
  "(en az 3). (2) Her kazanım bölümünde: explanation sade dille, steps: konuyu adım adım kuran 2-6 kısa adım, worked_example: " +
  "soru + adım adım çözüm içeren çözümlü örnek (en az 3 cümle), common_mistakes: öğrencilerin sık yaptığı 1-3 hata ve doğrusu, " +
  "ladder: {temel, orta, ileri} — aynı kazanımın temel, orta ve ileri düzeyde ne istediğini birer cümleyle göster. " +
  "(3) summary: dersin 3-6 cümlelik özeti.";

export const RUBRIC_JSON_FIELDS =
  `"key_terms": [{"term": string, "definition": string}], ` +
  `ve her bölümde ayrıca "steps": string[], "worked_example": string, "common_mistakes": string[], ` +
  `"ladder": {"temel": string, "orta": string, "ileri": string}`;

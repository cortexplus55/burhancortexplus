import { z, type ZodError } from "zod";
import { errorResponse } from "@/lib/api/guards";
import { clampText } from "@/lib/text/clamp-text";

export { clampText };

/*
  Serbest metin alanları (30 Ekim 2026, Paket I #12).

  Canlıda 43 karakterlik bir ders adı kurulumu üç kez 400 ile düşürdü: sihirbaz adı kırpmadan
  gönderiyor, sunucu `max(40)` ile reddediyor, cevap tek "Gönderilen bilgiler geçersiz." diyordu.
  Öğrenci neyin yanlış olduğunu bilemedi. Kural: serbest metin sunucuda REDDEDİLMEZ, aynı işlevle
  kırpılır (boşluk birleştirme + uzunluk); geriye kalan gerçek doğrulama hatası alanın adını söyler.
*/

/**
 * Kırpılarak kabul edilen serbest metin şeması. Kısa kalan (min altı) metin yine reddedilir —
 * kırpma uzun metni kurtarır, boş metni uydurmaz.
 */
export function lenientText(max: number, min = 1) {
  return z.preprocess(
    (value) => (typeof value === "string" ? clampText(value, max) : value),
    z.string().min(min).max(max),
  );
}

type FieldLabels = Record<string, string>;

/** Zod hatalarından öğrenciye okunur alan adları (tekrarsız, ilk geçiş sırasıyla). */
export function invalidFields(error: ZodError, labels: FieldLabels): string[] {
  const out: string[] = [];
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    const label = labels[key] ?? key;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * 400 cevabı: `code` yine `invalid_input` (istemciler ona bakıyor), `error` alanın adını söyler,
 * `fields` makine için. Alan etiketi yoksa anahtarın kendisi yazılır.
 */
export function invalidInputResponse(error: ZodError, labels: FieldLabels) {
  const fields = invalidFields(error, labels);
  const message = fields.length
    ? `Şu bilgi eksik ya da geçersiz: ${fields.join(", ")}. Düzeltip yeniden dene.`
    : "Gönderilen bilgiler geçersiz.";
  return errorResponse(400, "invalid_input", { error: message, fields });
}

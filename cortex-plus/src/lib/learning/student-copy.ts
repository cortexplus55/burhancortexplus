import { sanitizeStudentContent } from "@/lib/learning/student-safe-text";

/**
 * Öğrenciye görünen metinden iç etiketleri temizler (26 Ekim 2026).
 * Yönetim ekranları bu süzgeci kullanmaz.
 */
const LEAKS: RegExp[] = [
  /\s*\((?:core|bonus)\)/gi,
  /\b(?:developing|mastered)\b/gi,
  /\bReadiness\b/g,
  /Kayıtlı sorulardan\.?\s*Yeni üretim yok\.?/gi,
  /Kurucu hesabı/gi,
  /\s*için geçerli ifade hangisidir\??/gi,
  /NEDEN BÖYLE\??:?\s*/gi,
  /SINAV MÜFREDATI TAMAMLAMASI:?\s*/gi,
  /şöyle hesaplanır:\s*(?=$)/gi,
];

export function sanitizeStudentCopy(text: string): string {
  let out = sanitizeStudentContent(text);
  for (const pattern of LEAKS) out = out.replace(pattern, "");
  out = out.replace(/\bemerging\b/gi, "Gelişiyor");
  out = out.replace(/[İIıi]pucu[:,]\s*/gi, "");
  out = out.replace(/^\s*kaynakta[:,]\s*/gi, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

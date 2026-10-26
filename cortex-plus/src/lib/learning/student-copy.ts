/**
 * Öğrenciye görünen metinden iç etiketleri temizler (26 Ekim 2026).
 * Yönetim ekranları bu süzgeci kullanmaz.
 */
const LEAKS: RegExp[] = [
  /\s*\((?:core|bonus)\)/gi,
  /\b(?:emerging|developing|mastered)\b/gi,
  /\bReadiness\b/g,
  /Kayıtlı sorulardan\.?\s*Yeni üretim yok\.?/gi,
  /Kurucu hesabı/gi,
  /\s*için geçerli ifade hangisidir\??/gi,
];

export function sanitizeStudentCopy(text: string): string {
  let out = text;
  for (const pattern of LEAKS) out = out.replace(pattern, "");
  out = out.replace(/[İIıi]pucu:\s*/gi, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

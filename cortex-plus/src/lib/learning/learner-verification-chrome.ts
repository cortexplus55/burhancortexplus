/**
 * Öğrenciye doğrulama / kaynak meta izi gösterme.
 * Backend doğrulama aynen çalışır; bu yalnızca yüzey temizliği.
 */

const META_NOTE_RE =
  /doğrulanamad|kaynakla doğrulan|doğrulanamayan cümleler çıkarıldı|bazı hesap adımları kaynakla|pdf['']?te var|bu cümle.*(?:pdf|kaynak)/i;

export function isLearnerVerificationNote(
  note: { title?: string; body?: string } | null | undefined,
): boolean {
  if (!note) return false;
  return META_NOTE_RE.test(`${note.title ?? ""} ${note.body ?? ""}`);
}

/**
 * Meta satırları düşür. Gerçek öğretim cümleleri (enerji kaynağı,
 * su buharı çıkarıldı) kalır — yalnızca belirli meta kalıplar silinir.
 */
export function stripLearnerVerificationChrome(text: string): string {
  return text
    .replace(/\s*Doğrulanamayan cümleler çıkarıldı\.?/gi, "")
    .replace(/\s*Bazı hesap adımları kaynakla doğrulanamadığı için çıkarıldı\.?/gi, "")
    // "Kaynak: kimya.pdf, s.4" — dosya noktasında kesilmez; sayfa dahil silinir.
    .replace(/\s*Kaynak:\s*\S+(?:\s*,\s*)?(?:\s*s\.\d+)?\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

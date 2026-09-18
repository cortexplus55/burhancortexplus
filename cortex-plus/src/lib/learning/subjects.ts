/**
 * Kurulumda gösterilen ders önerileri.
 *
 * Hem sihirbazın arama kutusu hem belgesiz kurulumun öneri çipleri buradan
 * besleniyor: iki yerde ayrı liste tutulursa biri güncellenip diğeri
 * unutuluyor.
 */
export const COMMON_SUBJECTS = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türkçe",
  "Tarih",
  "Coğrafya",
  "İngilizce",
  "Felsefe",
  "Bilgisayar",
] as const;

/**
 * Öğrencinin daha önce çalıştığı dersler önce, sonra yaygın dersler.
 * Aynı ders iki listede de varsa bir kez görünür.
 */
export function subjectSuggestions(recent: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const subject of [...recent, ...COMMON_SUBJECTS]) {
    const label = subject.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

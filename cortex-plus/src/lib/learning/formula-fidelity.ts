/**
 * Dersin yazdığı formül kaynaktakiyle uyuşuyor mu?
 *
 * Canlıda üretilen bir zemin dersi "Boussinesq — Tekil Yük" başlıklı bir
 * bölüm yazdı ve formülü şöyle verdi:
 *
 *   Δσz = (Q/π) × (1 / (1 + (z/R)²))
 *
 * Kaynağın 12. sayfasında duran formül ise:
 *
 *   Δσz = (3Q) / (2π z²) · [1 / (1 + (r/z)²)]^(5/2)
 *
 * Bölüm başlığı kaynaktan geliyordu ama bölümün İÇİ modelin genel
 * bilgisinden geliyordu ve kimse karşılaştırmıyordu.
 *
 * Sayfanın çıkarılmış formülleri elimizde (document_pages.formulas).
 * Burada bir denklem çözücü yok; olsaydı bu turda bitmez, doğru da
 * çalışmazdı.
 *
 * İlk denemem sembolleri karşılaştırmaktı ve ÇALIŞMADI: uydurma formül
 * gerçeğiyle sembollerin %83'ünü paylaşıyordu — ikisinde de Δσz, Q, z,
 * r, π geçiyor. Ayırt eden şey sembol değil KATSAYI: gerçeğinde 3, 2π ve
 * 5/2 var, uydurmasında hiçbiri yok.
 *
 * Ölçü bu yüzden dar: kaynağın formülünde geçen ayırt edici sayılar (üç
 * ve üstü) dersin aynı büyüklük için yazdığı formülde de geçmeli.
 * Katsayısı düşen bir formül yanlış bir formüldür.
 *
 * Yakalamadıkları var — işlem sırası, ters çevrilmiş kesir, yanlış
 * sembol. Yanlış alarm dersi hiç ürettirmediği için ölçü bilerek gevşek;
 * amaç baştan farklı bir formülü yakalamak.
 */

/** Formülü karşılaştırılabilir hâle getirir: boşluk, süsleme, çarpım işareti. */
function normalize(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[·×*]/g, "*")
    .replace(/[–—−]/g, "-")
    .toLocaleLowerCase("tr");
}

/** Formüldeki harf simgeleri; hangi kaynağın karşılığı olduğunu bulmak için. */
function symbolsOf(formula: string): Set<string> {
  return new Set(normalize(formula).match(/[a-zğüşıöçπσδγλφθ]+/g) ?? []);
}

/**
 * Formülün ayırt edici sayıları: katsayılar ve üsler.
 *
 * 1 ve 2 neredeyse her formülde geçiyor (kare, birim, "1 +"), o yüzden
 * ayırt etmiyor. Üç ve üstü ayırt ediyor: Boussinesq'in 3'ü ve 5'i.
 */
function coefficientsOf(formula: string): Set<string> {
  const numbers = normalize(formula).match(/\d+/g) ?? [];
  return new Set(numbers.filter((n) => Number(n) >= 3));
}

/** İki formül aynı büyüklüğü mü anlatıyor? Sol taraf aynıysa evet. */
function sameSubject(a: string, b: string): boolean {
  const left = (text: string) => normalize(text).split("=")[0] ?? "";
  const la = left(a);
  const lb = left(b);
  if (!la || !lb) return false;
  return la === lb || la.includes(lb) || lb.includes(la);
}

/** Sembol örtüşmesi — aynı sol tarafı paylaşan kaynaklardan hangisi. */
function overlap(a: string, b: string): number {
  const sa = symbolsOf(a);
  const sb = symbolsOf(b);
  if (!sa.size) return 0;
  return [...sb].filter((symbol) => sa.has(symbol)).length;
}

export type FormulaCheck = { sourceFormula: string; lessonFormula: string };

/** Kaynağın aynı büyüklüğü tanımlayan formülüyle katsayısı tutmayanlar. */
export function formulaMismatches(
  lessonTexts: string[],
  sourceFormulas: string[],
): FormulaCheck[] {
  // Kaynağın BÜTÜN formülleri aday: aynı sol tarafı paylaşan iki formül
  // varsa (zemin belgesinde ikisi de "Δσz =" ile başlıyor) doğru olanı
  // seçebilmek için hepsi elde durmalı. Katsayı süzgeci eşleşmeden SONRA
  // uygulanıyor — önce uygulanınca dersin doğru yazdığı 2:1 formülü,
  // listede kalan tek formül olan Boussinesq'e karşı ölçülüp yanlış
  // sayılıyordu.
  const sources = sourceFormulas
    .map((formula) => formula.trim())
    .filter((formula) => formula.includes("=") && symbolsOf(formula).size >= 2);
  if (!sources.length) return [];

  // Ders metninden "... = ..." biçimindeki parçaları çıkar.
  const lessonFormulas: string[] = [];
  for (const text of lessonTexts) {
    for (const line of text.split(/[\n;]/)) {
      if (!line.includes("=")) continue;
      const trimmed = line.trim();
      if (trimmed.length < 5 || trimmed.length > 200) continue;
      if (symbolsOf(trimmed).size < 2) continue;
      lessonFormulas.push(trimmed);
    }
  }

  const issues: FormulaCheck[] = [];
  for (const lessonFormula of lessonFormulas) {
    // Aynı sol tarafı birden çok kaynak paylaşabiliyor (zemin belgesinde
    // iki formül de "Δσz =" ile başlıyor); sembolleri en çok tutan alınır.
    const candidates = sources.filter((source) =>
      sameSubject(source, lessonFormula),
    );
    if (!candidates.length) continue;
    const match = candidates.reduce((best, source) =>
      overlap(source, lessonFormula) > overlap(best, lessonFormula)
        ? source
        : best,
    );

    const expected = coefficientsOf(match);
    if (!expected.size) continue; // ölçülecek ayırt edici sayı yok
    const written = coefficientsOf(lessonFormula);
    if ([...expected].every((number) => written.has(number))) continue;

    issues.push({ sourceFormula: match, lessonFormula });
  }
  return issues;
}

/** Doğrulayıcının okuyacağı hâli. */
export function formulaFidelityIssues(
  lessonTexts: string[],
  sourceFormulas: string[],
): string[] {
  return formulaMismatches(lessonTexts, sourceFormulas).map(
    (issue) =>
      `Formül kaynakla uyuşmuyor. Kaynakta: "${issue.sourceFormula}" — derste: "${issue.lessonFormula}". Sayfadaki hâliyle yaz.`,
  );
}

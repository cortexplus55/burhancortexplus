/**
 * Kimyasal formüllerde alt simge (Faz 5 §3.1, 19 Kasım 2026): "H2O" → "H₂O", "C6H12O6" → "C₆H₁₂O₆". Yalnız baştan
 * sona element simgelerinden ve sayılardan oluşan, en az bir sayı taşıyan sözcükler çevrilir; "Soru 2", "10. sınıf"
 * ya da büyük harfli kısaltmalar (ör. "TYT2") değişmez. Gösterim içindir: kayıtlı veri ve karşılaştırma metni aynen kalır.
 */
const ELEMENTS = new Set(
  (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo " +
    "Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl " +
    "Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr"
  ).split(" "),
);

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(digits: string): string {
  return digits.replace(/\d/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit);
}

/** Sözcük gerçekten bir formül mü: element simgesi (+ isteğe bağlı sayı) parçalarından ibaret ve en az bir sayı var. */
function isFormula(word: string): boolean {
  if (!/\d/.test(word) || !/^[A-Z]/.test(word)) return false;
  const parts = word.match(/[A-Z][a-z]?\d*/g);
  if (!parts || parts.join("") !== word) return false;
  return parts.every((part) => ELEMENTS.has(part.replace(/\d+$/, "")));
}

export function chemSubscripts(text: string): string {
  if (!text || !/\d/.test(text)) return text;
  return text.replace(/(?<![\p{L}\d])[A-Z][A-Za-z\d]*(?![\p{L}\d])/gu, (word) =>
    isFormula(word) ? word.replace(/([A-Za-z])(\d+)/g, (_, symbol: string, digits: string) => symbol + toSubscript(digits)) : word,
  );
}

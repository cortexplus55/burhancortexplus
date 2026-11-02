/*
  Koşullu önerme dönüşümlerinin adları (2. tur UX denetimi, 2 Kasım 2026): p ⇒ q için
  karşıtı q ⇒ p, tersi ¬p ⇒ ¬q, karşıt tersi ¬q ⇒ ¬p. Model bunları karıştırabildiği için
  havuz kapısı ve anlatım denetimi bu kuralı kodla sınar (model çağrısı yok).
*/

type Atom = { name: string; neg: boolean };

const ARROW = "(?:⇒|→|=>|⟹)";
const NEG_PREFIX = "(?:¬|~|∼)";
const NEG_SUFFIX = "(?:′|'|’)";
const ATOM = `(${NEG_PREFIX}?\\s*[pqrs]\\s*${NEG_SUFFIX}?)`;
const LABEL = "(karşıt\\s+tersi|karşıtı|tersi)";
// Etiket → (en çok 12 karakter bağlaç: ise, :, =, olan, …) → formül
const LABEL_THEN_FORMULA = new RegExp(`${LABEL}[^.;⇒→\\n]{0,12}?${ATOM}\\s*${ARROW}\\s*${ATOM}`, "giu");
// Formül → "önermesinin|’nun" olmadan doğrudan etiket ("q ⇒ p, p ⇒ q’nun tersidir")
const FORMULA_THEN_LABEL = new RegExp(`${ATOM}\\s*${ARROW}\\s*${ATOM}\\s*(?:,|)?\\s*(?:önermesi\\s+)?[pqrs]\\s*${ARROW}\\s*[pqrs]\\s*[’']?n[uıiü]n\\s+(karşıt\\s+tersi|karşıtı|tersi)`, "giu");

function atom(raw: string): Atom {
  const t = raw.replace(/\s+/g, "");
  const neg = /^[¬~∼]/u.test(t) || /[′'’]$/u.test(t);
  return { name: t.replace(/[¬~∼′'’]/gu, "").toLowerCase(), neg };
}

function labelKey(label: string): "converse" | "inverse" | "contrapositive" {
  const l = label.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  if (l === "karşıt tersi") return "contrapositive";
  if (l === "karşıtı") return "converse";
  return "inverse";
}

const NAME: Record<ReturnType<typeof labelKey>, string> = {
  converse: "karşıtı",
  inverse: "tersi",
  contrapositive: "karşıt tersi",
};

/** Temel önerme p ⇒ q kabul edilir (metinde "p ⇒ q" geçmiyorsa denetim yapılmaz). */
function expected(kind: ReturnType<typeof labelKey>): [Atom, Atom] {
  if (kind === "converse") return [{ name: "q", neg: false }, { name: "p", neg: false }];
  if (kind === "inverse") return [{ name: "p", neg: true }, { name: "q", neg: true }];
  return [{ name: "q", neg: true }, { name: "p", neg: true }];
}

function same(a: Atom, b: Atom) {
  return a.name === b.name && a.neg === b.neg;
}

function show(a: Atom) {
  return `${a.neg ? "¬" : ""}${a.name}`;
}

/**
 * p ⇒ q için karşıt/ters/karşıt ters adını yanlış formülle eşleştiren ifadeleri döndürür.
 * Örnek hata: "tersi q ⇒ p" (doğrusu: karşıtı q ⇒ p).
 */
export function logicTermIssues(text: string): string[] {
  if (!text || !new RegExp(`\\bp\\s*${ARROW}\\s*q\\b`, "u").test(text)) return [];
  const issues: string[] = [];
  const check = (label: string, left: string, right: string) => {
    const kind = labelKey(label);
    const got: [Atom, Atom] = [atom(left), atom(right)];
    const want = expected(kind);
    // Yalnız p/q ile yazılmış dönüşümler denetlenir; temel önermenin kendisi ("p ⇒ q") etiketin hemen ardında
    // "p ⇒ q önermesinin karşıtı" gibi okunabileceğinden atlanır.
    if (got.some((a) => a.name !== "p" && a.name !== "q")) return;
    if (!got[0].neg && !got[1].neg && got[0].name === "p" && got[1].name === "q") return;
    if (same(got[0], want[0]) && same(got[1], want[1])) return;
    const actual = (Object.keys(NAME) as (keyof typeof NAME)[]).find((k) => {
      const e = expected(k);
      return same(got[0], e[0]) && same(got[1], e[1]);
    });
    issues.push(
      `"${NAME[kind]}" ${show(got[0])} ⇒ ${show(got[1])} olarak yazılmış` +
        (actual ? ` (bu, "${NAME[actual]}"; p ⇒ q'nun ${NAME[kind]} ${show(want[0])} ⇒ ${show(want[1])})` : ""),
    );
  };
  for (const m of text.matchAll(LABEL_THEN_FORMULA)) check(m[1]!, m[2]!, m[3]!);
  for (const m of text.matchAll(FORMULA_THEN_LABEL)) check(m[3]!, m[1]!, m[2]!);
  return [...new Set(issues)];
}

/** Üretim istemlerine eklenen kısa kural (yalnız önerme/mantık içeren ünitelerde). */
export const LOGIC_TERMS_RULE =
  "Mantık terimleri: p ⇒ q için KARŞITI q ⇒ p, TERSİ ¬p ⇒ ¬q (p′ ⇒ q′), KARŞIT TERSİ ¬q ⇒ ¬p (q′ ⇒ p′). " +
  "Koşullu önerme karşıt tersine denktir; karşıtı ile tersi birbirine denktir. Bu adları karıştırma.";

export function needsLogicTermsRule(text: string): boolean {
  return /önerme|koşullu|mantık/iu.test(text);
}

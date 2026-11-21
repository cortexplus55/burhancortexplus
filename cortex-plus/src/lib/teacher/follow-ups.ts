/*
  Dinamik takip soruları (öğretmen v3, teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibinin istemi). Sabit kalıp çipler
  ("Benzer bir soru ver") yerine öğretmen, o an anlattığı konunun doğal devamı olan üç kısa merak sorusunu yazar. Ekran
  onları yanıtın altında sağa yaslı "↳" haplar olarak çizer; dokunulan soru öğrencinin mesajı olarak gider.

  Biçim (tek kaynak): model yanıtın EN SONUNA tek satır yazar
      [[sorular:Soru bir?|Soru iki?|Soru üç?]]
  Sunucu işareti metinden ayırır, soruları doğrular (`normalizeFollowUps`) ve normalleşmiş tek işareti yanıtın sonuna
  geri koyar (`followUpMarker`). Ekran işareti `extractFollowUps` ile ayırır; yanıt akarken yarım işaret
  `hideStreamingFollowUps` ile gizlenir (öğrenci ham köşeli parantez görmez).

  Kod soru yazmaz: yalnız biçimi düzeltir (baştaki ok, numara, tırnak; sondaki soru işareti) ve kuralı tutmayanı atar.
  Ders, konu ya da kişi adı yok.
*/

export const FOLLOW_UP_MARK = "sorular";
export const FOLLOW_UP_COUNT = 3;
export const FOLLOW_UP_MIN_CHARS = 4;
export const FOLLOW_UP_MAX_CHARS = 80;

const MARKER_RE = /\[\[sorular:([^\]]*)\]\]/g;

/** Türkçe küçük harf ve boşluk sadeleştirmesi (aynı sorunun iki yazımını ayırt etmemek için). */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Tek soruyu temizler: baştaki ok/madde/numara/tırnak, sondaki noktalama; soru işaretiyle biter. Uymazsa boş. */
export function cleanFollowUp(raw: string): string {
  let text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:↳|->|→|[-*•–—]|\d+[.)])\s*/u, "")
    .replace(/^["“”'«»]+|["“”'«»]+$/gu, "")
    .trim();
  text = text.replace(/[.!…:;,\s]+$/u, "").trim();
  if (!text) return "";
  if (!text.endsWith("?")) text = `${text}?`;
  const length = [...text].length;
  if (length < FOLLOW_UP_MIN_CHARS || length > FOLLOW_UP_MAX_CHARS) return "";
  // Köşeli parantez ve dikey çizgi işaretin ayıracıdır; soruda kalamaz.
  if (/[[\]|]/.test(text)) return "";
  return text;
}

/** Soruları temizler, aynılarını ayıklar, en çok üç tane bırakır. */
export function normalizeFollowUps(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = cleanFollowUp(item);
    if (!text) continue;
    const key = fold(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length === FOLLOW_UP_COUNT) break;
  }
  return out;
}

/** Normalleşmiş işaret; soru yoksa boş dize. */
export function followUpMarker(questions: readonly string[]): string {
  const clean = normalizeFollowUps(questions);
  return clean.length ? `[[${FOLLOW_UP_MARK}:${clean.join("|")}]]` : "";
}

/**
 * İşareti metinden ayırır. Birden çok işaret varsa sonuncunun soruları geçerlidir (model ara yere de yazmış olabilir);
 * hepsi metinden silinir. Gövdenin sonundaki boşluk kırpılır.
 */
export function extractFollowUps(content: string): { body: string; questions: string[] } {
  const text = String(content ?? "");
  let last: string | null = null;
  const body = text.replace(MARKER_RE, (_all, inner: string) => {
    last = inner;
    return "";
  });
  const questions = last === null ? [] : normalizeFollowUps(String(last).split("|"));
  return { body: body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd(), questions };
}

/**
 * Akış sürerken: tamamlanmış işareti siler, sonda kalan yarım işareti ("[[sor", "[[sorular:Soru bi") gizler.
 * Metnin sonundaki tek "[" ya da "[[" de işaretin başı olabilir; o da geçici gizlenir.
 */
export function hideStreamingFollowUps(text: string): string {
  let out = String(text ?? "").replace(MARKER_RE, "");
  const open = out.lastIndexOf("[[");
  if (open >= 0 && !out.slice(open).includes("]]")) {
    const tail = out.slice(open + 2);
    const prefix = `${FOLLOW_UP_MARK}:`;
    if (prefix.startsWith(tail) || tail.startsWith(prefix)) out = out.slice(0, open);
  } else if (/\[$/.test(out)) {
    out = out.slice(0, -1);
  }
  return out.trimEnd();
}

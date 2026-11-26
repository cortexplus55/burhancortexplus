/**
 * Görünen ad süzgeci (26 Kasım 2026, mobil 1. adım; App Store 1.2 ve Google Play kullanıcı içeriği politikası).
 * Düelloda başkalarına görünen tek kullanıcı içeriği oyuncunun adı. Bu süzgeç küfür ve hakaret içeren adları tutar;
 * süzgeçten kaçanı öbür oyuncular "Bildir" ile bildirir, yönetici gizler (`/admin/duello-bildirimleri`).
 *
 * Saf; sayfa (ad yazılırken) ve sunucu (kayıtta ve sıralama gösterilirken) aynı işlevi kullanır.
 * - Harfler küçültülür (Türkçe kurallarıyla), rakamla yazılan harfler çözülür (0 → o, 1 → i, 3 → e, 4 → a, 5 → s, 7 → t),
 *   tekrar eden harfler teke iner. "ı" ile "i" ayrı tutulur: "sıkı" gibi masum sözcükler yakalanmasın.
 * - Uzun kökler adın boşluksuz hâlinde aranır (araya boşluk ya da nokta koymak kurtarmaz); kısa kökler yalnız tek
 *   başına bir sözcükse sayılır (başka sözcüklerin içinde geçmesi masumdur).
 */

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Adın boşluksuz hâlinde aranan kökler. Gerçek bir adın içinde geçebilen kökler buraya yazılmaz (kısa listeye). */
const LONG_ROOTS = [
  "siktir",
  "sikiş",
  "sikis",
  "sikik",
  "sikerim",
  "sikeyim",
  "orospu",
  "orosbu",
  "pezevenk",
  "yarrak",
  "dalyarak",
  "amcık",
  "amcik",
  "götveren",
  "gotveren",
  "kahpe",
  "kaltak",
  "sürtük",
  "surtuk",
  "yavşak",
  "yavsak",
  "gavat",
  "godoş",
  "godos",
  "fuck",
  "bitch",
  "whore",
  "pussy",
  "asshole",
  "faggot",
] as const;

/** Yalnız tek başına sözcükken sayılan kısa kökler. */
// "sike" yok: tek harfli köklerde tekrar teke iner ve "Sikke" adıyla aynı olurdu.
const SHORT_WORDS = ["sik", "ibne", "amk", "aq", "oç", "piç", "pic", "pust", "puşt", "göt", "got", "dick", "cunt", "shit", "nigger", "nigga"] as const;

function decode(raw: string): string {
  const lower = raw.toLocaleLowerCase("tr");
  let out = "";
  for (const char of lower) out += LEET[char] ?? char;
  return out;
}

const collapseAll = (value: string) => value.replace(/(.)\1+/gu, "$1");
/** Kökün kendisinde çift harf varsa ("yarrak") üçlü ve üstü tekrar ikiye iner; çift harf korunur ("Niger" ≠ "nigger"). */
const collapseToTwo = (value: string) => value.replace(/(.)\1{2,}/gu, "$1$1");
const hasDouble = (value: string) => /(.)\1/u.test(value);

/** Karşılaştırma biçimi: küçük harf, rakamla yazılan harf çözülmüş, tekrar eden harf teke inmiş. */
export function normalizeName(raw: string): string {
  return collapseAll(decode(raw));
}

export function isOffensiveName(raw: string | null | undefined): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  const decoded = decode(raw);
  const compact = decoded.replace(/[^\p{L}]/gu, "");
  const compactSingle = collapseAll(compact);
  const compactDouble = collapseToTwo(compact);
  const longHit = LONG_ROOTS.some((root) => (hasDouble(root) ? compactDouble.includes(root) : compactSingle.includes(collapseAll(root))));
  if (longHit) return true;
  const words = decoded.split(/[^\p{L}]+/u).filter(Boolean);
  return words.some((word) =>
    SHORT_WORDS.some((bad) => (hasDouble(bad) ? collapseToTwo(word) === bad : collapseAll(word) === collapseAll(bad))),
  );
}

/** Sıralamada gizlenen ya da süzgece takılan adın yerine. */
export const HIDDEN_PLAYER_NAME = "Oyuncu";
/** Misafirin adı süzgece takılırsa kayda geçen ad. */
export const GUEST_FALLBACK_NAME = "Misafir oyuncu";
export const NAME_NOT_ALLOWED_MESSAGE = "Bu ad kullanılamaz. Başka bir ad yaz.";

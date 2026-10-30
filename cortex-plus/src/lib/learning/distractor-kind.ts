/**
 * Çeldirici türü ölçüsü (30 Ekim 2026, canlı tur: Makroekonomi dersi). Ders içi soru bir endeks soruyordu, şıklarda
 * enflasyon türleri ("Dezenflasyon", "Stagflasyon") vardı. Kural (`SAME_KIND_DISTRACTOR_RULE`) yazara söyler; bu
 * dosya modelsiz bir işaret verir.
 *
 * Kod konunun türlerini bilmez. Türü iki yerden okur:
 *   1. Kökün sorduğu tür: "hangi X", "… X hangisidir", "hangisi bir X'tir".
 *   2. Şıkkın türü: kaynakta ya da derste o terimi tanımlayan cümlenin son sözcüğü ("TÜFE, … ölçen bir endekstir" →
 *      endeks; "Dezenflasyon, enflasyon oranının düşmesidir" → düşme).
 * İşaret yalnız doğru cevabın türü kökün sorduğu türle tutunca ve çeldiricinin kendi tanımı başka bir tür söyleyince
 * verilir; tanımı bulunamayan şık hakkında bir şey söylenmez. Ders adı ya da sabit kelime listesi yok (yalnız genel
 * soru sözcükleri: "kavram", "durum", "gelişme" tür değildir).
 */

/** Tür söylemeyen soru sözcükleri (ilk beş harfleriyle karşılaştırılır). */
const GENERIC_WORDS = [
  "kavram", "terim", "ifade", "seçenek", "şık", "şıkkı", "durum", "olay", "gelişme", "sonuç", "sonucu", "bilgi",
  "özellik", "yargı", "cevap", "yanıt", "açıklama", "görüş", "öncül", "madde", "örnek", "neden", "nedeni", "etken",
  "faktör", "sebep", "biçim", "şekil", "tür", "türü", "türler", "türdür", "çeşit", "grup", "kategori", "yol", "yolu",
  "işlem", "nitelik", "unsur", "öğe", "öge", "ögesi", "öğesi", "bölüm", "kısım", "yön", "yönü", "alan", "alanı",
  "kişi", "ad", "adı", "aşama", "adım", "aşağıdakilerden", "hangisi", "hangileri", "şunlardan", "olgu", "türüdür",
  "değil", "var", "yok",
];
const GENERIC_KEYS = new Set(GENERIC_WORDS.map((word) => word.slice(0, 5)));

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase("tr");

/** Türün karşılaştırma anahtarı: sözcüğün ilk beş harfi (ek farkı takılmasın). */
function kindKey(word: string): string | null {
  const clean = word.replace(/[^\p{L}]/gu, "");
  if (clean.length < 3) return null;
  const key = clean.slice(0, 5);
  return GENERIC_KEYS.has(key) ? null : key;
}

/** Kökün sorduğu tür anahtarı; bulunamazsa ya da genel bir sözcükse null. */
export function askedKind(stem: string): string | null {
  const text = fold(stem);
  const candidates = [
    /(?:^|[^\p{L}])hangi\s+(\p{L}{3,})/u.exec(text)?.[1],
    /(\p{L}{3,})\s+(?:aşağıdakilerden\s+)?hangisi(?:dir|ydi)?(?=[^\p{L}]|$)/u.exec(text)?.[1],
    /hangisi\s+(?:bir\s+)?(\p{L}{3,}?)(?:[dt][ıiuü]r)(?=[^\p{L}]|$)/u.exec(text)?.[1],
  ];
  for (const word of candidates) {
    if (!word || word === "aşağıdakilerden") continue;
    const key = kindKey(word);
    if (key) return key;
  }
  return null;
}

/** Tanım cümlesinin son sözcüğünden ek-fiil ("-dır", "-tir") ve kaynaştırma çıkar: "endekstir" → "endeks". */
function genusOf(lastWord: string): string | null {
  const word = lastWord.replace(/[^\p{L}]/gu, "");
  const match = /^(\p{L}{3,}?)(?:y)?(?:[dt][ıiuü]r)$/u.exec(word);
  if (!match) return null;
  // Sıfat yüklem tür söylemez ("önemlidir", "gerekli", "yapısaldır").
  if (/(?:lı|li|lu|lü|sız|siz|suz|süz|sal|sel)$/u.test(match[1]!)) return null;
  return kindKey(match[1]!);
}

function sentencesOf(context: string): string[] {
  return context
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

/**
 * Terimin kaynakta ya da derste tanımlandığı türü. Tanım cümlesi terimle ve ardından virgül, iki nokta ya da noktalı
 * virgülle başlar ("Dezenflasyon, …dır") ya da terim cümlenin ilk altı sözcüğünde parantez içindedir ("Tüketici fiyat
 * endeksi (TÜFE), …"); cümle ek-fiille biter. Virgülsüz cümle ("ÜFE TÜFE'den daha oynaktır") tanım sayılmaz.
 */
export function termKind(term: string, context: string): string | null {
  const name = fold(term).replace(/[.,;:!?]+$/u, "").trim();
  if (!name || name.split(/\s+/u).length > 4) return null;
  for (const raw of sentencesOf(context)) {
    const sentence = fold(raw).replace(/\*\*|==/g, "").replace(/^[-•*\s]+/u, "");
    const opensWith = [",", ":", ";", " –", " -", " ("].some((mark) => sentence.startsWith(`${name}${mark}`));
    const head = sentence.split(/\s+/u).slice(0, 6).join(" ");
    const named = head.includes(`(${name})`);
    if (!opensWith && !named) continue;
    const words = sentence.replace(/[.!?]+$/u, "").split(/\s+/u);
    const kind = genusOf(words[words.length - 1] ?? "");
    if (kind) return kind;
  }
  return null;
}

function carriesKind(option: string, kind: string): boolean {
  return fold(option)
    .split(/[^\p{L}]+/u)
    .some((word) => word.length >= 3 && word.slice(0, 5) === kind);
}

/**
 * Sorulan türden olmayan çeldiriciler. `context`: kaynak sayfaları ve dersin metni. Doğru cevabın türü sorulan türle
 * tutmuyorsa (ya da okunamıyorsa) boş döner: ölçü kendini doğrulayamadığı yerde susar.
 */
export function offKindDistractors(input: {
  stem: string;
  options: readonly string[];
  correctIndex: number;
  context: string;
}): string[] {
  const kind = askedKind(input.stem);
  if (!kind || !input.context.trim()) return [];
  const correct = input.options[input.correctIndex];
  if (!correct) return [];
  const correctKind = carriesKind(correct, kind) ? kind : termKind(correct, input.context);
  if (correctKind !== kind) return [];
  return input.options.filter((option, index) => {
    if (index === input.correctIndex || carriesKind(option, kind)) return false;
    const other = termKind(option, input.context);
    return other !== null && other !== kind;
  });
}

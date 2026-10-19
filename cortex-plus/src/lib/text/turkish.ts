/**
 * Türkçe metin işlemleri.
 *
 * JavaScript'in `toLowerCase()` işlevi Türkçe bilmiyor: "İyi günler" yazısını
 * küçültünce "i̇yi günler" çıkıyor — noktalı i'nin noktası ayrı bir işaret
 * olarak kalıyor ve ekranda çift noktalı görünüyor. Aynı sorun aramada da
 * var: "İngilizce" ile "ingilizce" birbirini bulamıyor.
 *
 * Bu dosya iki işi ayırıyor: ekranda gösterilecek metin için doğru küçültme,
 * arama karşılaştırması için katlama.
 */

/** Ekranda gösterilecek metni Türkçe kurallarına göre küçültür. */
export function turkishLower(value: string): string {
  return value.toLocaleLowerCase("tr");
}

/**
 * Arama karşılaştırması için metni sadeleştirir.
 *
 * Hem büyük-küçük harfi hem de şapkaları eritiyor: "ogretmen" yazan
 * "Öğretmen"i buluyor, "ingilizce" yazan "İngilizce"yi buluyor. Karşılaştırmanın
 * iki tarafına da uygulanmak zorunda, yoksa hiçbir işe yaramıyor.
 *
 * `ı` ile `i` bilerek aynı harfe indiriliyor: klavyede ikisini ayırt ederek
 * yazmak zor ve arama kutusunda kimse buna dikkat etmiyor.
 */
export function turkishFold(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    // Birleşen işaretler (şapka, nokta, tilde) atılıyor: ö→o, ğ→g, ç→c.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

/**
 * İki cümle aynı şeyi mi söylüyor (19 Ekim 2026)? Kelimeler katlanıp ilk beş harfe kesilir (Türkçe
 * ekleri kabaca atar: "eşlenmesi" ~ "eşlenir"), kesişim / birleşim oranı eşiği aşarsa tekrar sayılır.
 * Derste doğru/yanlış sorusunun "Açıklama"sı ile "Doğrusu" çoğu kez aynı cümleydi.
 */
export function nearDuplicateSentence(a: string, b: string, threshold = 0.6): boolean {
  const stems = (value: string) =>
    new Set(
      turkishFold(value)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1)
        .map((word) => word.slice(0, 5)),
    );
  const left = stems(a);
  const right = stems(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const stem of left) if (right.has(stem)) shared += 1;
  return shared / (left.size + right.size - shared) >= threshold;
}

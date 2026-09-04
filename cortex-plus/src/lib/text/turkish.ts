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

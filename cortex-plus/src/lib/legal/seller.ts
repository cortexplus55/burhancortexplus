/**
 * Satıcı (üye iş yeri) bilgileri — tek kaynak.
 *
 * 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Mesafeli
 * Sözleşmeler Yönetmeliği, satıcının kimliğini ve iletişim bilgilerini sitede
 * AÇIKÇA göstermeyi zorunlu tutuyor. PayTR de üye iş yeri incelemesinde bunu
 * arıyor.
 *
 * İletişim sayfasında yalnızca bir e-posta adresi vardı; ünvan, adres,
 * telefon ve vergi bilgisi hiç yoktu.
 *
 * Bilgiler burada duruyor çünkü aynı değerler beş ayrı yerde geçiyor:
 * mesafeli satış sözleşmesi, ön bilgilendirme formu, iptal-iade, teslimat ve
 * iletişim sayfası. Beş yerde elle yazılırsa biri güncellenip diğerleri
 * unutulur ve hukuki metinler birbirini tutmaz.
 *
 * ============================ DOLDURULACAK ============================
 *
 * Aşağıdaki alanlar BOŞ. Uydurulmadı: yanlış bir adres ya da vergi numarası
 * yazmak, hiç yazmamaktan daha kötü — hem mevzuata aykırı hem de ilk
 * denetimde güven kaybı.
 *
 * Şahıs işletmesi için gereken alanlar doldurulmalı. Doldurulmadığı sürece
 * hukuki sayfalarda kırmızı bir uyarı görünüyor ve /admin/sistem eksik
 * olduğunu söylüyor.
 */

export type SellerInfo = {
  /** Şahıs işletmesinde ad-soyad; şirkette tam ticaret ünvanı. */
  legalName: string;
  /** Açık adres: mahalle/cadde, no, ilçe, il, posta kodu. */
  address: string;
  phone: string;
  email: string;
  taxOffice: string;
  taxNumber: string;
  /** Alan adı — sözleşmelerde "site" tanımı için. */
  website: string;
};

export const SELLER: SellerInfo = {
  legalName: "",
  address: "",
  phone: "",
  email: "cortexplus@cortexplus.app",
  taxOffice: "",
  taxNumber: "",
  website: "cortexplus.app",
};

/** Doldurulmamış zorunlu alanlar. Boş dizi = hukuki metinler yayına hazır. */
export function missingSellerFields(seller: SellerInfo = SELLER): string[] {
  const required: { key: keyof SellerInfo; label: string }[] = [
    { key: "legalName", label: "Ad soyad / ünvan" },
    { key: "address", label: "Açık adres" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "E-posta" },
    { key: "taxOffice", label: "Vergi dairesi" },
    { key: "taxNumber", label: "Vergi numarası" },
  ];
  return required.filter((f) => !seller[f.key]?.trim()).map((f) => f.label);
}

export function isSellerComplete(seller: SellerInfo = SELLER): boolean {
  return missingSellerFields(seller).length === 0;
}

/** Metinlerde kullanılacak gösterim; boşsa okuyucuya belli olsun. */
export function sellerField(key: keyof SellerInfo, seller: SellerInfo = SELLER): string {
  const value = seller[key]?.trim();
  return value ? value : "[doldurulacak]";
}

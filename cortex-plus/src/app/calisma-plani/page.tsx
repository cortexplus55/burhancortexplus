import { permanentRedirect } from "next/navigation";

/**
 * "Çalış" ekranı kaldırıldı (3 Ekim 2026).
 *
 * Bütün hazırlıkları ve belgeleri tek programda karıştırıyordu: en yakın
 * sınavın programı, altında başka derslerin tekrar konuları, son belgeler.
 * Astra'da her sınavın yolu yalnız kendi kartında; öğrenci Sınavlar'dan
 * hazırlığını seçip o yolu yürür.
 *
 * Rota yer imleri ve eski bağlantılar için duruyor.
 */
export default function CalismaPlaniRedirect(): never {
  permanentRedirect("/deneme-sinavlari");
}

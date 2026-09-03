import { permanentRedirect } from "next/navigation";

/**
 * "Uygulamalar" bölümü kaldırıldı; yerini Araçlar aldı.
 *
 * Rota bilerek duruyor: kullanıcıların yer imleri, paylaşılmış bağlantılar
 * ve arama motorunun bildiği adres burasıydı. Sayfayı silmek onları 404'e
 * düşürürdü, kalıcı yönlendirme doğru adrese taşıyor.
 */
export default function UygulamalarRedirect(): never {
  permanentRedirect("/araclar");
}

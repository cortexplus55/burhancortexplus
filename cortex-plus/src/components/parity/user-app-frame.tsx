import { withFrameCsp } from "@/lib/parity/user-app";

/**
 * Üretilen mini uygulamayı çalıştıran çerçeve.
 *
 * Bu bileşen ürünün güvenlik sınırı. İçerideki belgeyi bir model yazdı ve
 * başka kullanıcılar da açabiliyor; yani düşman girdi muamelesi görüyor.
 *
 * İki katman:
 *
 * 1. `sandbox="allow-scripts"` — ve `allow-same-origin` KASITLI OLARAK YOK.
 *    Bu ikisi birlikte verilirse iframe kendi sandbox'ını kaldırabilir ve
 *    sayfamızın kaynağına erişir: çerez, localStorage, Supabase oturumu.
 *    İkisini aynı anda vermeyin.
 *
 * 2. Ağa kapalı CSP (`default-src 'none'`) — model yönergeye uymayıp fetch
 *    ya da CDN koyarsa istek hiç çıkmaz. Uygulama içeriden veri sızdıramaz.
 *
 * `allow-forms`, `allow-popups`, `allow-top-navigation` de verilmiyor:
 * uygulamanın kullanıcıyı bir yere göndermesi ya da form göndermesi için
 * hiçbir meşru sebep yok.
 */
export function UserAppFrame({
  html,
  title,
}: {
  html: string;
  title: string;
}) {
  return (
    <iframe
      className="ap-uapp-frame"
      title={title}
      srcDoc={withFrameCsp(html)}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}

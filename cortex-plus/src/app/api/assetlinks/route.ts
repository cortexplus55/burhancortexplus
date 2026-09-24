import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Digital Asset Links — mağaza uygulamasının adres çubuğunu gizlemesini
 * sağlayan dosya.
 *
 * `/.well-known/assetlinks.json` adresinden servis ediliyor (yönlendirme
 * `next.config.ts` içinde). Android, TWA açılırken bu dosyayı okuyup
 * uygulamanın imza parmak izini burada arıyor. Bulamazsa uygulama yine
 * çalışıyor ama ÜSTÜNDE tarayıcı adres çubuğuyla — yani mağazadan indirilen
 * şey bir tarayıcı sekmesi gibi görünüyor ve "uygulama" hissi tümüyle
 * kayboluyor.
 *
 * Statik dosya yerine uç nokta olmasının sebebi: parmak izi bir sır değil
 * ama YAPILANDIRMA. Play, yükleme anahtarınızı kendi anahtarıyla yeniden
 * imzalıyor, yani buradaki değer siz uygulamayı yayınlayana kadar
 * bilinmiyor ve sonradan değişebiliyor (anahtar yenileme). Depoya sabit
 * yazmak, her değişiklikte yeni bir dağıtım gerektirirdi.
 *
 * Kurulum adımları: `docs/delivery/MAGAZA-UYGULAMASI.md`.
 */

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? "";
/**
 * Virgülle ayrılmış SHA-256 parmak izleri.
 *
 * Genelde İKİ tane oluyor ve en sık yapılan hata birini unutmak: Play App
 * Signing açıkken mağazadaki uygulamayı Google'ın anahtarı imzalıyor, sizin
 * yükleme anahtarınız yalnızca yüklemeyi imzalıyor. Yerelde test ettiğiniz
 * sürüm ile mağazadan inen sürümün parmak izi farklı — ikisi de burada
 * olmalı, yoksa biri çalışırken diğeri adres çubuğu gösterir.
 */
const FINGERPRINTS = process.env.ANDROID_CERT_FINGERPRINTS ?? "";

export function GET() {
  const fingerprints = FINGERPRINTS.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  /*
    Yapılandırma yoksa BOŞ DİZİ dönüyoruz, 404 değil.

    İkisi de "bağlı uygulama yok" demek ama boş dizi geçerli bir cevap:
    Android'in doğrulayıcısı ve Google'ın test aracı onu okuyup "hiçbir
    uygulama tanımlı değil" diyor. 404 ise "sunucu bozuk mu, yol mu yanlış"
    sorusunu açık bırakıyor ve kurulum sırasında saatler yedirebiliyor.
  */
  if (!PACKAGE_NAME || !fingerprints.length) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    {
      /*
        Android bu dosyayı kurulumdan sonra da tazeliyor. Uzun önbellek,
        parmak izi değiştiğinde eski cevabın günlerce takılı kalması demek;
        bir saat hem yükü tutuyor hem düzeltmeyi aynı gün geçiriyor.
      */
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}

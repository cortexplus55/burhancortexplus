import type { MetadataRoute } from "next";

/**
 * PWA bildirimi — mağaza uygulamasının da dayandığı dosya.
 *
 * Android'deki paket bir TWA olacak (Trusted Web Activity): mağazadaki
 * uygulama bu siteyi kendi kabuğunda açıyor, ayrı bir yerel uygulama
 * yazılmıyor. Astra da aynı yöntemi kullanıyor (`co.astra_ai.app.twa`).
 * Ayrıntı: `docs/delivery/MAGAZA-UYGULAMASI.md`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    /*
      `id` sabit kalmalı. Play, uygulamayı bununla tanıyor; `start_url`
      değişirse (kampanya parametresi, dil öneki) kimlik bozulmasın diye
      ayrı duruyor.
    */
    id: "/",
    name: "Cortex Plus",
    short_name: "Cortex+",
    description: "AI destekli öğrenme platformu",
    start_url: "/",
    // Kabuğun dışına çıkan bağlantı tarayıcıda açılsın diye kapsam kökte.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#e8a838",
    lang: "tr",
    categories: ["education"],
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      /*
        Maskeli sürüm ayrı bir girdi olmak zorunda.

        Android simgeyi daire, kare ya da damla biçiminde kırpıyor. `any`
        olarak işaretlenmiş bir simge kırpıldığında kenarları kesiliyor;
        `maskable` diyen girdi, çizimin güvenli bölgeye sığdığını söylüyor.
        İkisini tek girdide birleştirmek ("any maskable") her iki durumda da
        yanlış sonuç veriyor: maskesiz yerde fazla boşluklu, maskeli yerde
        kesik görünüyor.
      */
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

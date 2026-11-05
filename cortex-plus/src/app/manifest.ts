import type { MetadataRoute } from "next";

/**
 * PWA bildirimi — mağaza uygulamasının da dayandığı dosya.
 *
 * Android'deki paket bir TWA olacak (Trusted Web Activity): mağazadaki
 * uygulama bu siteyi kendi kabuğunda açıyor, ayrı bir yerel uygulama
 * yazılmıyor. kıyas ürünü da aynı yöntemi kullanıyor (`co.astra_ai.app.twa`).
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
    // Durum çubuğu rengi `layout.tsx` viewport'undaki koyu temayla aynı (#0d0d0d): kurulu uygulama açılırken
    // altın çubuktan koyu sayfaya geçiş görünüyordu (6 Kasım 2026).
    theme_color: "#0d0d0d",
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
      // Maskeli girdinin kendi çizimi var: tam karo zemin, işaret %60 (`icon-maskable.png/route.tsx`).
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

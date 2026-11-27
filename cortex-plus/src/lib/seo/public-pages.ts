/**
 * Herkese açık kanonik sayfaların tek listesi (27 Kasım 2026, GEO): site haritası (`app/sitemap.ts`) adresleri,
 * `/llms.txt` adresleri ve başlıkları buradan okur. Başlık sayfanın kendi `pageMetadata` başlığıdır; kısa not yalnız
 * `/llms.txt` içindir ve sayfada gerçekten olanı söyler.
 *
 * Listede yönlenen adres (`/kullanim-sartlari` → `/kullanim-kosullari`, emekli `/ogretmenler-ve-profesorler-icin`),
 * oturum isteyen ya da robots'un kapattığı adres (`/giris`, `/kayit`, `/pay`, `/ogretmen` …) yok; bekçi
 * `geo-ai-search.test.ts` ve `seo-search-console.test.tsx` bunu tutar. Resmî müfredat sayfaları (program, ünite,
 * kazanım) kayıt defterinden gelir (`curriculumSitemapPaths`); buradaki `/mufredat` yalnız `/llms.txt` içindir.
 */
export type PublicPage = {
  /** Kök için boş dize (site haritası `https://cortexplus.app` yazar, sondaki eğik çizgi olmadan). */
  path: string;
  title: string;
  note: string;
  /** Site haritasında yer alır mı (`/mufredat` müfredat listesinden gelir). */
  inMarketingSitemap: boolean;
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "", title: "Ana sayfa", note: "Ürünün tanımı, 7 adımlı kayıtsız tur, planlar ve sık sorulanlar.", inMarketingSitemap: true },
  { path: "/ozellikler", title: "Özellikler", note: "Bugün çalışan bütün araçlar; Plus'a özel olanlar etiketli.", inMarketingSitemap: true },
  { path: "/fiyatlandirma", title: "Fiyatlandırma", note: "Güncel paketler, fiyatlar ve ücretsiz hesabın sınırları.", inMarketingSitemap: true },
  { path: "/mufredat", title: "Resmî Müfredat", note: "MEB ve ÖSYM belgelerinden çıkarılan program, ünite ve kazanım listesi.", inMarketingSitemap: false },
  { path: "/ornek", title: "Nasıl çalışır — örnek çalışma", note: "Hazır bir ders notuyla girişsiz örnek ders, podcast, test ve sözlü.", inMarketingSitemap: true },
  { path: "/sinav-hazirligi", title: "Sınav hazırlığı", note: "Notundan sınav gününe kadar çalışma yolunun nasıl kurulduğu.", inMarketingSitemap: true },
  { path: "/resmi", title: "Resmî Takvim ve Sınav Yapıları", note: "Resmî sınav takvimi ve sınav yapıları.", inMarketingSitemap: true },
  { path: "/yardim", title: "Yardım", note: "Sık sorulan sorular ve destek.", inMarketingSitemap: true },
  { path: "/mobil-uygulama", title: "Telefondan Cortex", note: "Telefonda ana ekrana ekleme.", inMarketingSitemap: true },
  { path: "/hakkimizda", title: "Hakkımızda", note: "Çalışma ilkelerimiz.", inMarketingSitemap: true },
  { path: "/iletisim", title: "İletişim", note: "Destek ve satıcı bilgileri.", inMarketingSitemap: true },
  { path: "/gizlilik", title: "Gizlilik politikası", note: "Hangi verinin neden işlendiği.", inMarketingSitemap: true },
  { path: "/kvkk", title: "KVKK aydınlatma metni", note: "Kişisel verilerin işlenmesi hakkında aydınlatma.", inMarketingSitemap: true },
  { path: "/kullanim-kosullari", title: "Kullanım koşulları", note: "Hesap, ücretsiz ve ücretli kullanım, yapay zekâ içerikleri.", inMarketingSitemap: true },
  { path: "/cerez-politikasi", title: "Çerez politikası", note: "Kullanılan çerezler ve tercihler.", inMarketingSitemap: true },
  { path: "/hesap-silme", title: "Hesap silme", note: "Giriş yapmadan da hesabı kalıcı silme.", inMarketingSitemap: true },
] as const;

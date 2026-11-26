import type { CapacitorConfig } from "@capacitor/cli";

/*
  Cortex Plus mobil uygulaması (26 Kasım 2026, Aşama 1). Tek kod tabanı: uygulama canlı siteyi
  (https://cortexplus.app) kendi web görünümünde açar; kamera, bildirim, titreşim, paylaşım, ağ durumu ve
  durum çubuğu telefonun kendi yeteneklerinden gelir (`src/lib/platform/native.ts`). Web sitesi aynen çalışır.

  - Tarayıcı kimliğine `CortexPlusApp/1 (<platform>)` eklenir: sunucu ve sayfa uygulamada olduğunu buradan da bilir
    (`src/lib/platform/native-ua.ts`). Köprü yüklenmeden önce çalışan ilk betik de bu işarete bakar.
  - `allowNavigation`: yalnız kendi alan adımız uygulamanın içinde açılır; başka her bağlantı (hukuki metinler dışı
    siteler, e-posta, harita) telefonun tarayıcısında açılır.
  - `errorPath`: ilk açılışta bağlantı yoksa `mobile/www/offline.html` ("Bağlantı koptu — tekrar dene").
  - iOS: durum çubuğu web görünümünün üstüne binmez (`StatusBar.overlaysWebView: false`); alt güvenli alan için
    sayfa açılışta `viewport-fit=cover` alır (yalnız iOS uygulamasında, `src/app/layout.tsx` ilk betiği).
  - Android: sistem çubukları için web görünümü kenar payıyla yerleşir (`SystemBars.insetsHandling: "native"`);
    sayfa `viewport-fit=cover` istemediği sürece içerik durum ve gezinme çubuğunun altına inmez.
*/
const PRODUCTION_URL = "https://cortexplus.app";
const BACKGROUND = "#05070E";

const config: CapacitorConfig = {
  appId: "app.cortexplus.mobile",
  appName: "Cortex Plus",
  webDir: "mobile/www",
  backgroundColor: BACKGROUND,
  loggingBehavior: "production",
  server: {
    url: PRODUCTION_URL,
    cleartext: false,
    allowNavigation: ["cortexplus.app", "www.cortexplus.app"],
    errorPath: "offline.html",
  },
  ios: {
    appendUserAgent: "CortexPlusApp/1 (ios)",
    backgroundColor: BACKGROUND,
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: false,
  },
  android: {
    appendUserAgent: "CortexPlusApp/1 (android)",
    backgroundColor: BACKGROUND,
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: BACKGROUND,
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: BACKGROUND,
    },
    SystemBars: {
      insetsHandling: "native",
      style: "DARK",
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

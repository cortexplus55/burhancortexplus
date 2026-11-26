# Mobil uygulama (iOS ve Android) — 26 Kasım 2026

Tek kod tabanı: Capacitor 8 uygulaması canlı siteyi (`https://cortexplus.app`) kendi web görünümünde açar; kamera,
bildirim, titreşim, paylaşım, ağ durumu ve durum çubuğu telefonun yeteneklerinden gelir. Web sitesi aynen çalışır.

## Ürün sahibinin kararları (26 Kasım 2026)

| Soru | Karar |
|---|---|
| Uygulama içinde abonelik | **Mağazanın otomatik yenilenen aboneliği.** Hukuki metinler (sözleşme, ön bilgilendirme, iptal-iade) Aşama 2'de yeni sürüme geçer; web'de PayTR ve "otomatik yenilenmez" aynen kalır (`AUTO_RENEW_SUPPORTED` web içindir) |
| Alt sekme çubuğu | **Bugünkü beşli:** Ana Sayfa, Sınavlar, Stüdyo, Kütüphane, Profil (web'in telefon görünümüyle aynı) |
| Mağaza hesapları | Açık değil; Apple ve Google'da yalnız ücret ödemesi kaldı, kurulum birlikte yapılacak |
| Sıra | **İki aşama:** önce ödemeye dokunmayan kısım, sonra uygulama içi satın alma |

## Aşama 1 — yapıldı

| Parça | Ne | Nerede |
|---|---|---|
| Kabuk | `appId: app.cortexplus.mobile`, ad "Cortex Plus", açılış zemini #05070E, yalnız kendi alan adımız uygulamada açılır (başka bağlantı telefonun tarayıcısında), ilk açılışta bağlantı yoksa `offline.html` | `capacitor.config.ts`, `mobile/www/` |
| Yerel projeler | Android (`android/`, Gradle 8.14, SDK 36) ve iOS (`ios/`, Swift Package Manager, iOS 15+). İzin metinleri Türkçe: kamera, galeri, mikrofon; Android'de bildirim ve mikrofon izni; iPhone'da yalnız dikey | `android/app/src/main/AndroidManifest.xml`, `ios/App/App/Info.plist` |
| Simge ve açılış | Sitenin 3B işareti koyu zeminde; yeniden üretmek: `node scripts/mobile-assets.mjs` | `scripts/mobile-assets.mjs` |
| Uygulamada mıyız | Tarayıcı kimliğine `CortexPlusApp/1 (ios|android)` eklenir. İlk betik (React'ten önce) `<html>`e `cx-native` yazar ve iOS'ta alt güvenli alan için `viewport-fit=cover` ekler | `src/lib/platform/native-ua.ts`, `src/app/layout.tsx` |
| Yardımcı katman | `isNativeApp()`, `getNativePlatform()`, `triggerHaptic()`, `nativeShare()`, `useNetworkStatus()`; eklentiler yalnız uygulamada ve ihtiyaç anında yüklenir (web paketine girmez) | `src/lib/platform/native.ts` |
| Açılış | Açılış ekranı sayfa hazır olunca kapanır; durum çubuğu koyu; Android geri tuşu bir sayfa geri, kökteyse uygulamayı arka plana alır; bildirime ya da bağlantıya dokununca kendi yolumuz açılır | `src/components/native/native-bootstrap.tsx` |
| İlk açılış akışı | 3 adım, cihaz başına bir kez: seviye (Ortaokul/LGS, Lise/YKS, Üniversite, KPSS/TUS/Uzmanlık) profile yazılır; ilk adım (notunun fotoğrafını çek ya da öğretmene sor; ses açıksa "Canlı sesli öğretmene sor"); bildirim izni değeri anlatıldıktan sonra. Çekilen sayfalar sunucuya gitmeden kurulumun materyal adımına taşınır (sayfa tepsisi, 1600 px küçültme, fotoğraf seti) | `src/components/native/native-onboarding.tsx`, `/api/app/onboarding` |
| Kamera | Uygulamada sayfa tepsisinin kamera düğmesi telefonun kendi kamerasını açar; web'de değişmez | `src/lib/platform/native-camera.ts`, `photo-page-tray.tsx` |
| Bağlantı koptu | Üstte "Bağlantı koptu — tekrar dene"; bağlantı gelince kalkar | `src/components/native/offline-bar.tsx` |
| Bildirim | Cihaz anahtarı `/api/push/token`'a yazılır; uygulama içi bildirim yazılınca yalnız **yeni** satır telefona gider. iOS doğrudan Apple'a (APNs), Android Firebase'e. Gece 22:00–08:00 hatırlatma yok (hesap bildirimleri muaf); "Uygulama içi bildirimler" kapalıysa telefona da gitmez. Çıkışta cihaz anahtarı silinir | `src/lib/notifications/push*.ts`, göç `20261126120000_user_push_tokens.sql` |
| Girişte Google | Uygulamanın web görünümünde Google girişi çalışmaz (Google reddediyor): düğme yerine e-posta ve şifre; Google ile açılan hesap "Şifremi unuttum" ile şifre belirler | `src/lib/auth/in-app-browser.ts`, `google-blocked-note.tsx` |
| Titreşim ve paylaşım | Testte "Kontrol et": doğruda onay, yanlışta uyarı titreşimi. "Sınıfla Paylaş" telefonun paylaşım ekranını açar | `exam-quiz-play.tsx`, `class-share-button.tsx` |
| CI | Android `.apk` ve imzasız `.aab`, iOS simülatör derlemesi | `.github/workflows/mobile-build.yml` |

**Yerelde Android derlemesi:** proje yolunda "Masaüstü" (ASCII dışı harf) olduğu için Gradle Windows'ta durur. Geçici
sürücü harfiyle: `subst Q: "C:\Users\burha\OneDrive\Masaüstü\Cortex-Plus-Dev"`, sonra `Q:\cortex-plus\android` içinde
`npx cap sync android` ve `.\gradlew.bat assembleDebug`. Projeye `overridePathCheck` yazılmadı.

## Göç (canlıda)

`supabase/migrations/20261126120000_user_push_tokens.sql`: yalnız ekler (bir tablo, bir dizin). 26 Kasım 2026'da #728
yayınından sonra ürün sahibinin onayıyla uygulandı (`docs/operasyon/goc-kayitlari.md`). Telefona bildirim gitmesi için
yalnız APNs ve FCM kimlik bilgileri kaldı (aşağıdaki hesaplar).

## Mağaza ve bildirim hesapları (ürün sahibiyle birlikte)

1. **Apple Developer** (yıllık 99 $): App ID `app.cortexplus.mobile`, Push Notifications yeteneği, APNs anahtarı
   (.p8) → Vercel'e `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`. Dağıtım sertifikası ve profil (imzalı derleme için).
2. **Google Play Console** (bir kerelik 25 $): uygulama kaydı, yükleme anahtarı.
3. **Firebase**: Android uygulaması `app.cortexplus.mobile` → `google-services.json` dosyası `android/app/` içine
   (dosya gizli değildir ama depoya ürün sahibinin onayıyla girer); hizmet hesabı anahtarı → `FCM_PROJECT_ID`,
   `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.
4. **RevenueCat** (Aşama 2): App Store ve Google Play bağlantısı, webhook sırrı → `REVENUECAT_WEBHOOK_SECRET`.

## Mağaza uyumluluğu — yapıldı (26 Kasım 2026)

Ayrıntı ve mağaza beyan tabloları: `docs/delivery/MAGAZA-UYUMLULUK-KONTROL.md`.

- Uygulamada web ödemesi yok: `src/lib/platform/native-payment-policy.ts` (middleware) ödeme sayfalarını `/pay`'e,
  tanıtım sayfalarını ana sayfaya, oturumsuz ana sayfayı kayda yönlendirir; PayTR, veli bağlantısı ve kod uçları 403.
- `/pay` uygulamada mağaza abonelik ekranıdır (`native-subscription-screen.tsx`): plan, dönem, fiyat, otomatik yenileme,
  24 saat kuralı, mağazadan iptal, "Satın Alımları Geri Yükle", Gizlilik ve Kullanım Şartları. Ürün kimlikleri
  `src/lib/billing/store-products.ts`. Satın alma düğmesi `STORE_BILLING_LIVE = false` ile kapalı (`store-billing.ts`).
- Kalıcı hesap silme Ayarlar'da; giriş yapmadan silme `/hesap-silme` (e-postayla imzalı onay bağlantısı).
- Öğretmen yanıtında "Bildir", ders ve öğretmen ekranında yapay zekâ notu; Kullanım Koşulları ve KVKK metni yeni sürüm.

## Mobil 1. adım — yapıldı (26 Kasım 2026)

Ürün sahibinin kararı (aynı gün): ayrı yerel arayüz ve çevrimdışı mod **yapılmayacak**, tek kod tabanı kalır. Bugünkü
kabukta biten mağaza işleri:

| Parça | Ne | Nerede |
|---|---|---|
| Gizlilik bildirimi | `PrivacyInfo.xcprivacy` (takip yok, UserDefaults CA92.1, App Privacy tablosuyla aynı veri türleri), Xcode projesinde kaynak | `ios/App/App/PrivacyInfo.xcprivacy` |
| Uygulamanın kendi eklentisi | `CortexDevice`: kilit (LocalAuthentication / BiometricPrompt), mağaza değerlendirmesi (SKStoreReviewController / Play In-App Review), ders sesi denetimleri. iOS'ta `CortexBridgeViewController` kaydeder, Android'de `MainActivity` | `ios/App/App/CortexDevicePlugin.swift`, `android/.../CortexDevicePlugin.java`, `src/lib/platform/native-device.ts` |
| Arka plan sesi | iOS `UIBackgroundModes` audio + çalma kipi; Android `CortexMediaService` (ön plan, mediaPlayback) kilit ekranı ve bildirim alanı denetimleri; radyo ve podcast `useNativeMediaControls` | `AppDelegate.swift`, `CortexMediaService.java`, `src/lib/platform/native-media.ts` |
| Yerel çalışma hatırlatması | `@capacitor/local-notifications`; plan sunucuda (`/api/app/reminders`, `local-reminders.ts`), telefonda kurulur (`native-reminders.ts`); tam zamanlı alarm yok | `native-bootstrap.tsx` |
| Zorunlu güncelleme | `/api/app/version`, `NativeUpdateGate`; kural `app-version.ts` | `src/components/native/native-update-gate.tsx` |
| Uygulama kilidi | Ayarlar → Giriş ve güvenlik (`AppLockSetting`); kilit katmanı `NativeLockGate`, içerik ilk betikte gizlenir (`cx-locked`) | `src/lib/platform/native-lock.ts` |
| Mağaza değerlendirmesi | Puanlı etkinlik %80+ → şartlar tutarsa mağaza penceresi | `src/lib/platform/native-review.ts`, `use-node-lifecycle.ts` |
| Düelloda bildir ve engelle | Ad süzgeci, sıralama süzgeci, `/api/duels/[code]/report|block`, `/api/student/duel-blocks`, `/admin/duello-bildirimleri` | göç `20261126180000_duel_reports_blocks.sql` (**onay bekliyor**) |

Yerelde Android hata ayıklama ve yayın derlemesi geçti; iOS derlemesi CI'da (macOS). Gerçek cihazda denenecekler
(hesaplar açılınca): Face ID / parmak izi, kilit ekranı denetimleri, mağaza değerlendirme penceresi (Play yalnız
mağazadan kurulmuş uygulamada gösterir; Apple geliştirme derlemesinde her seferinde gösterir).

## Aşama 2 — uygulama içi satın alma (hesaplar açılınca)

Ekran ve ürün kimlikleri hazır (yukarıda). Kalan: RevenueCat eklentisi ve kimlik eşlemesi, satın alma çağrısı,
`POST /api/webhooks/revenuecat`, ardından `STORE_BILLING_LIVE = true`.

- `@revenuecat/purchases-capacitor`, `src/lib/billing/mobile-iap.ts`: tekliflerin adları `sinav_haftasi`,
  `plus_monthly`, `sigma_monthly` ve ek kredi paketleri; "Satın Alımları Geri Yükle".
- Uygulamada abonelik ekranı yalnız mağaza satın alması gösterir: PayTR, veli ödeme bağlantısı ve dışarıya ödeme
  bağlantısı uygulamada görünmez (App Store 3.1.1, Google Play ödeme politikası). Karar tarayıcı kimliğinden de
  okunabilir (`native-ua.ts`), sunucu sayfası buna göre çizer.
- `POST /api/webhooks/revenuecat` (sır doğrulamalı, olay tablosuyla tekil): satın alma, yenileme, ürün değişikliği,
  iptal, bitiş ve tek seferlik satın alma aynı abonelik ve cüzdana yazılır; web'den alan telefonda, telefondan alan
  web'de aynı hesabı kullanır. Bu, ödeme ve plan etkinleştirme mantığına dokunur: ayrı PR, ayrı inceleme.
- Hukuki metinler: mağaza aboneliği otomatik yenilenir; sözleşme, ön bilgilendirme ve iptal-iade metni yeni sürüme
  geçer (herkes bir kez yeniden onaylar). Web'deki PayTR satışı "otomatik yenilenmez" olarak kalır.

## Bilinen riskler ve açık kararlar

| Konu | Durum |
|---|---|
| App Store 4.2 (yalnız web sitesini saran uygulama) | Uygulama canlı siteyi açıyor (ürün sahibinin kararı, 26 Kasım 2026: ayrı yerel arayüz yok). Kamera, anlık ve yerel bildirim, arka planda ders sesi ve kilit ekranı denetimleri, yüz/parmak izi kilidi, mağaza değerlendirmesi, titreşim, paylaşım menüsü, çevrimdışı ekran ve mağaza satın alması (Aşama 2) yerel değer katıyor; inceleme notunda anlatıldı. Ret gelirse karar ürün sahibinde |
| Sign in with Apple (4.8) | Uygulamada Google girişi gösterilmiyor; yalnız e-posta ve şifre olduğu sürece zorunlu değil. Uygulamaya Google girişi eklenirse Apple ile giriş de gerekir (karar ürün sahibinde) |
| Hesap silme (5.1.1) | Ayarlar → Hesabı sil → "Hesabımı kalıcı olarak sil" (onay penceresi, mağaza aboneliği uyarısı); giriş yapmadan `/hesap-silme` |
| Evrensel bağlantılar | `apple-app-site-association` ve `assetlinks.json` Apple ekip kimliği ve imza anahtarı gelince eklenir; o zamana kadar bağlantılar telefonun tarayıcısında açılır |

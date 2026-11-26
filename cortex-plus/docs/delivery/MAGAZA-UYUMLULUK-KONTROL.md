# Mağaza uyumluluk kontrolü — 26 Kasım 2026

Cortex Plus web sitesi ve Capacitor mobil uygulaması (iOS, Android) için Türkiye mevzuatı (KVKK, mesafeli satış,
18 yaş altı), App Store İnceleme Yönergeleri ve Google Play politikalarına göre yapılan denetim. Her satır kodda
doğrulandı; kanıt sütunu dosyayı ya da testi gösterir. "Kurucu aksiyonu" satırları kodla yapılamaz, mağaza panelinde
ya da resmî kurumda yapılır.

Uygulama içi satın alma Aşama 2'dir (`docs/delivery/MOBIL-UYGULAMA.md`): RevenueCat ve sunucunun mağaza bildirimi
ucu ayrı PR'da gelir. Bu denetimde abonelik ekranı hazırlandı ve satın alma düğmesi `STORE_BILLING_LIVE = false`
ile kapalı. Uygulama, Aşama 2 bitmeden mağazaya incelemeye gönderilmez.

## 1. Denetim tablosu

| # | Madde | Durum | Kanıt |
|---|---|---|---|
| 1.1 | Uygulama içi kalıcı hesap silme (devre dışı bırakma değil) | DÜZELTİLDİ | Silme işçisi zaten tam siliyordu (`src/lib/privacy/account-deletion.ts`, `purgeUserData`). Düğme "Veri silme talebi oluştur" idi, satır içi onayla açılıyordu; şimdi "Hesabımı kalıcı olarak sil", onay penceresi, silinen ve mevzuat gereği kalan listesi (`account-deletion-panel.tsx`, `account-deletion-copy.ts`). Ayarlar → "Hesabı sil" (`#hesabi-sil`) ve "Gizlilik ve yasal" satırından da açılır |
| 1.2 | Silmede mağaza aboneliği uyarısı ve yönetim yönlendirmesi | DÜZELTİLDİ | Ayarlar bölümü, onay penceresi, `/hesap-silme` ve onay e-postası aynı cümleyi okur (`STORE_DELETION_WARNING`); App Store ve Google Play abonelik yönetimi bağlantıları (`storeManageUrl`) |
| 1.3 | Giriş yapmadan açılan web silme sayfası (Google Play) | DÜZELTİLDİ | `/hesap-silme` (200 OK, oturumsuz, onay kapısından muaf, alt bilgide ve site haritasında). İki yol: Ayarlar'daki düğme ya da e-postayla imzalı onay bağlantısı (`deletion-link.ts`, `public-deletion.ts`, `/api/hesap-silme/talep`, `/api/hesap-silme/onay`). Bağlantı 24 saat geçerli, yalnız hesabın kutusuna gider, silme yalnız POST ile; talep ucu kayıtlı adresi ele vermez |
| 2.1 | Uygulamada PayTR, veli ödeme bağlantısı, kampanya kodu ve web'e yönlendirme yok | DÜZELTİLDİ | Önce yoktu: uygulama `/pay`'de PayTR'yi, ana sayfada veli bağlantısını ve fiyatları gösteriyordu. Şimdi tek kural (`native-payment-policy.ts`, middleware): ödeme sayfaları `/pay`'e, tanıtım sayfaları ana sayfaya, oturumsuz ana sayfa kayda yönlenir; ödeme ve kod uçları 403 `native_store_only`; `/pay` uygulamada yalnız mağaza ekranını çizer; kalan cümleler için `data-web-only` güvenlik ağı (`native-app.css`). Kod içinde "web'den daha ucuz" cümlesi hiç yoktu |
| 2.2 | Abonelik ekranında plan adı, dönem, fiyat, otomatik yenileme, 24 saat kuralı | DÜZELTİLDİ | `native-subscription-screen.tsx`, cümleler `storeRenewalTerms` (tek kaynak, Kullanım Koşulları'yla aynı kural) |
| 2.3 | "Satın Alımları Geri Yükle" | DÜZELTİLDİ | Aynı ekran; Aşama 1'de hesabın planını sunucudan yeniden okur (`restoreAccountPurchases`), Aşama 2'de önce mağazanın geri yüklemesi koşar |
| 2.4 | Ekranda tıklanabilir Gizlilik Politikası ve Kullanım Şartları | DÜZELTİLDİ | Aynı ekran, `/gizlilik` ve `/kullanim-kosullari` |
| 3.1 | `/gizlilik`, `/kullanim-kosullari`, `/kvkk`, `/hesap-silme` giriş yapmadan 200 OK ve telefonda düzgün | GEÇTİ | e2e `magaza-uyumluluk.spec.ts` (375 ve 360 px, yana taşma yok). Eski `/kullanim-sartlari` adresi 26 Kasım 2026'dan beri kalıcı yönlendirmeyle (308) `/kullanim-kosullari`'na gider |
| 3.2 | Gizlilik Politikası: toplanan veriler ve sağlayıcılar | DÜZELTİLDİ | Sayfa kısa bir özetti; şimdi e-posta, ders notu/PDF/fotoğraf, sesli öğretmen, ödeme geçmişi, bildirim anahtarı, hata kayıtları ve OpenAI, Supabase, Vercel, Resend, PayTR, Apple, Google, RevenueCat, Sentry, Upstash, PostHog tek tek; saklama ve silme hakkı |
| 3.3 | Kullanım Şartları: web satışı ile mağaza aboneliği ayrımı | DÜZELTİLDİ | `terms-text.ts`, yeni "Mobil uygulamada mağaza aboneliği" maddesi; web'deki "otomatik olarak yenilenmez" aynen. Sürüm 2026-11-26 |
| 3.4 | KVKK aydınlatma metni ve 18 yaş altı veli/vasi bilgilendirmesi | DÜZELTİLDİ | 18 yaş bölümü vardı ("vasi" açıkça eklendi). Eksikler eklendi: bildirim cihaz anahtarı, canlı sesli öğretmen, Apple ve Google (bildirim, mağaza), RevenueCat, giriş yapmadan silme. Yeni alıcı esaslı değişiklik: sürüm 2026-11-26 |
| 3.5 | Sürüm değişince sunucu zaman damgasıyla yeniden onay | GEÇTİ | `LEGAL_VERSIONS`, onay kapısı (`consent-gate.tsx`), kayıt `consent_records` (`consent_type`, `version`, `accepted_at`, okuma kanıtı `evidence`); yazma yalnız sunucu anahtarıyla, zaman sunucuda doğrulanır (`consentMoment`). Bu PR iki metnin sürümünü yükseltti: herkes bir sonraki girişte bir kez onaylar |
| 3.6 | Köşeli parantezli boş alan (`[Şirket Adı]` vb.) | GEÇTİ | Hiç yok (bekçi `magaza-uyumluluk.test.ts`). Satıcı bilgileri `seller.ts`'te dolu |
| 4.1 | iOS izin açıklamaları | DÜZELTİLDİ | `Info.plist`: kamera (tarama), galeri (yalnız seçilen fotoğraf), mikrofon (canlı sesli öğretmen, ses saklanmaz). Galeriye ekleme izni, uygulamanın yapmadığı bir işi anlatıyordu ("sınav sabahı kâğıdını kaydetmek"); doğru cümle yazıldı. Anahtar kalıyor: kamera eklentisi bu API'ye bağlı, anahtarsız yükleme reddedilir (ITMS-90683) |
| 4.2 | Android izinleri | DÜZELTİLDİ (mobil 1. adım) | INTERNET, POST_NOTIFICATIONS, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS; 1. adımla FOREGROUND_SERVICE ve FOREGROUND_SERVICE_MEDIA_PLAYBACK (yalnız ders sesi çalarken açılan medya servisi) ve USE_BIOMETRIC (uygulama kilidi). Yerel bildirim eklentisinin eklediği SCHEDULE_EXACT_ALARM birleşik bildirimden çıkarıldı (`tools:node="remove"`): Google Play bu izni yalnız alarm ve takvim uygulamalarına verir; hatırlatma tam olmayan zamanlamayla kurulur |
| 4.3 | Öğretmen yanıtını tek yerden bildirme | DÜZELTİLDİ | Testlerde "Soruda hata bildir" vardı, sohbette yalnız başparmak vardı ve "uygunsuz" seçeneği yoktu. Her yanıtın altında "Bildir" → Yanlış bilgi / Uygunsuz ya da zararlı / Başka bir sorun (`message-actions.tsx`, `/api/ai/chat/report`); bildirim yönetimin destek listesine düşer (`/admin/destek`), yanıt olumsuz oy alır |
| 4.4 | Yapay zekâ şeffaflık notu | DÜZELTİLDİ | Hiç yoktu. Öğretmen sohbetinin başında ve dersin giriş ekranında tek cümle (`ai-notice.ts`): yapay zekâ desteklidir, hata yapabilir, resmî sınav kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez |
| 4.5 | Mağaza beyan tabloları ve inceleme notu | DÜZELTİLDİ | Bu belge (bölüm 2, 3, 4) |
| 5.1 | Otomatik testler | DÜZELTİLDİ | `tests/unit/magaza-uyumluluk.test.ts`, `magaza-uyumluluk-ekran.test.tsx`, e2e `magaza-uyumluluk.spec.ts`; 1. adım `mobil-adim-1.test.ts`, `mobil-adim-1-ekran.test.tsx` |
| 6.1 | iOS gizlilik bildirimi (PrivacyInfo.xcprivacy, ITMS-91053) | DÜZELTİLDİ (mobil 1. adım) | `ios/App/App/PrivacyInfo.xcprivacy`: takip yok, gerekçeli API yalnız cihazda ayar saklama (UserDefaults, CA92.1); toplanan veri türleri bölüm 2'deki App Privacy tablosuyla aynı (bekçi karşılaştırır). Xcode projesinde kaynak olarak bağlı. Capacitor çekirdeği ve Cordova katmanının kendi bildirim dosyaları paketlerinde |
| 6.2 | Arka planda ses ve kilit ekranı denetimleri | DÜZELTİLDİ (mobil 1. adım) | iOS: `UIBackgroundModes` → `audio`, ses oturumu açılışta "çalma" kipinde (etkinleştirilmeden: başka uygulamanın sesi ancak öğrenci bizde ses başlatınca durur); kilit ekranı bilgisini web görünümünün Media Session'ı yayımlar. Android: `CortexMediaService` (ön plan, `mediaPlayback`, dışa kapalı) bildirim alanında ve kilit ekranında başlık, oynat/duraklat, 15 sn geri/ileri, önceki/sonraki; duraklatılmış ses 10 dakikada kapanır. Sınav Radyosu ve podcast aynı kancayı kullanır (`native-media.ts`) |
| 6.3 | Yerel çalışma hatırlatması | DÜZELTİLDİ (mobil 1. adım) | Öğrencinin seçtiği saatte (18:30–21:00) 14 güne kadar telefonun kendi bildirimi; sınava kalan gün sayılır, sınav günü ve sonrası yok, bugün çalıştıysa ilk hatırlatma yarın. İzin istenmez (açılış akışındaki bildirim izni), çıkışta ve oturum yokken silinir. Aynı akşam iki bildirim gelmesin diye son 14 günde uygulamayı açmış cihaza sunucu çalışma hatırlatmasını anlık bildirimle göndermez (`push.ts`) |
| 6.4 | Zorunlu güncelleme | DÜZELTİLDİ (mobil 1. adım) | `/api/app/version` + `NativeUpdateGate`: en düşük sürümün altı kapatılamayan "Yeni sürüm gerekli", son sürümün altı kapatılabilen şerit. Kural `app-version.ts`, Vercel'de `MOBILE_MIN_VERSION_IOS/ANDROID`, `MOBILE_LATEST_VERSION_IOS/ANDROID`; App Store adresi `APPLE_APP_STORE_ID` tanımlanınca |
| 6.5 | Yüz tanıma / parmak izi kilidi | DÜZELTİLDİ (mobil 1. adım) | Ayarlar → Giriş ve güvenlik: açınca soğuk açılışta ve bir dakikadan uzun arka plandan sonra Face ID / Touch ID / parmak izi ya da cihaz şifresi. Ayar cihazda, biyometrik veri cihazdan çıkmaz (`NSFaceIDUsageDescription`). Telefonda ekran kilidi kalmadıysa kilit kendiliğinden kalkar; "Çıkış yap" her zaman açık |
| 6.6 | Mağaza değerlendirme penceresi | DÜZELTİLDİ (mobil 1. adım) | Yalnız mağazanın kendi penceresi (SKStoreReviewController / Play In-App Review); kendi "bizi değerlendir" ekranımız ve karşılığında ödül yok. Puanlı bir etkinlik %80 ve üstüyle biterse sayılır: en az 3 başarı, ilk açılıştan 3 gün sonra, son istekten 120 gün sonra |
| 6.7 | Kullanıcı içeriği: düelloda süzgeç, bildir, engelle (App Store 1.2, Google Play UGC) | DÜZELTİLDİ (mobil 1. adım; göç canlıda) | Düelloda başkalarına görünen tek içerik oyuncu adı. Ad süzgeci (`display-name-filter.ts`) uygunsuz adı kayda almaz ve sıralamada "Oyuncu" gösterir. Sıralamadaki her oyuncuda "Bildir" (misafir dahil; Uygunsuz ad / Hile şüphesi / Rahatsız edici davranış / Başka) ve "Engelle" (oturumlu; engellenen oyuncu öğrencinin gördüğü sıralamalardan ve kurduğu düellolardan çıkar, Ayarlar'dan kaldırılır). İki ayrı kişiden "uygunsuz ad" gelen tur kararı beklemeden gizlenir; yönetici kuyruğu `/admin/duello-bildirimleri`. Tablolar `20261126180000_duel_reports_blocks.sql` (yalnız ekler) |

## 2. Apple App Privacy (App Store Connect → App Privacy)

"Tracking": **Hayır**. Reklam yok, başka şirketlerin uygulama ve siteleriyle veri birleştirilmez, reklam kimliği
istenmez (ATT gerekmez).

| Veri türü (Apple adı) | Toplanıyor mu | Amaç | Kimliğe bağlı | Not |
|---|---|---|---|---|
| Contact Info → Name | Evet | App Functionality | Evet | Kayıttaki ad soyad |
| Contact Info → Email Address | Evet | App Functionality | Evet | Giriş ve hizmet e-postaları |
| User Content → Photos or Videos | Evet | App Functionality | Evet | Kullanıcının çektiği ya da seçtiği defter/soru fotoğrafı |
| User Content → Audio Data | Evet | App Functionality | Evet | Canlı sesli öğretmen: ses gerçek zamanlı işlenir, kaydı saklanmaz; sağlayıcı kötüye kullanım denetimi için en çok 30 gün tutabildiği için ihtiyatla "toplanıyor" |
| User Content → Other User Content | Evet | App Functionality | Evet | Yüklenen belgeler, sohbetler, test cevapları |
| User Content → Customer Support | Evet | App Functionality | Evet | Destek talepleri ve yanıt bildirimleri |
| Purchases → Purchase History | Evet | App Functionality | Evet | Plan, tarih, durum |
| Identifiers → User ID | Evet | App Functionality | Evet | Hesap kimliği |
| Identifiers → Device ID | Evet | App Functionality | Evet | Bildirim cihaz anahtarı (yalnız bildirim izni verilirse) |
| Diagnostics → Crash Data, Other Diagnostic Data | Evet | App Functionality | Hayır | Sentry'ye kullanıcı kimliği gönderilmez, kişisel veri ayıklanır |
| Usage Data → Product Interaction | Evet (yalnız izinle) | Analytics | Hayır | PostHog yalnız analitik çerezine izin verilirse, kimlik eşlemesi yok |
| Financial Info → Payment Info | Hayır | — | — | Kart bilgisi bize gelmez (mağaza ya da PayTR işler) |
| Location, Health, Contacts, Browsing History, Search History, Sensitive Info | Hayır | — | — | — |

Gizlilik politikası adresi: `https://cortexplus.app/gizlilik`. Destek adresi: `https://cortexplus.app/iletisim`.

## 3. Google Play Data Safety (Play Console → App content → Data safety)

- Veri aktarımda şifreleniyor: **Evet** (HTTPS).
- Kullanıcı verilerinin silinmesini isteyebilir: **Evet**. Hesap silme adresi: `https://cortexplus.app/hesap-silme`.
- "Paylaşılıyor": **Hayır**. Sağlayıcılar (OpenAI, Supabase, Vercel, Resend, Sentry, Upstash, PostHog, PayTR,
  RevenueCat) bizim adımıza veri işleyen hizmet sağlayıcılardır; Google'ın tanımında bu aktarım "paylaşma" sayılmaz.

| Kategori → tür | Toplanıyor | İsteğe bağlı mı | Amaç | Not |
|---|---|---|---|---|
| Kişisel bilgiler → Ad | Evet | Hayır | Uygulama işlevi, hesap yönetimi | |
| Kişisel bilgiler → E-posta adresi | Evet | Hayır | Uygulama işlevi, hesap yönetimi, iletişim | |
| Kişisel bilgiler → Kullanıcı kimlikleri | Evet | Hayır | Uygulama işlevi, hesap yönetimi | |
| Finansal bilgiler → Satın alma geçmişi | Evet | Evet | Uygulama işlevi | Yalnız satın alan |
| Mesajlar → Diğer uygulama içi mesajlar | Evet | Evet | Uygulama işlevi | Yapay zekâ öğretmenle sohbet |
| Fotoğraflar ve videolar → Fotoğraflar | Evet | Evet | Uygulama işlevi | |
| Ses → Ses kayıtları | Evet | Evet | Uygulama işlevi | "Geçici olarak işleniyor" işaretlenir: kayıt saklanmaz |
| Dosyalar ve dokümanlar | Evet | Evet | Uygulama işlevi | Ders notları, PDF |
| Uygulama etkinliği → Uygulama etkileşimleri | Evet | Evet | Analiz | Yalnız analitik izniyle |
| Uygulama etkinliği → Kullanıcı tarafından oluşturulan diğer içerik | Evet | Evet | Uygulama işlevi | Test cevapları, kartlar |
| Uygulama bilgileri ve performans → Kilitlenme günlükleri, Teşhis | Evet | Hayır | Uygulama işlevi | Kimliğe bağlanmaz |
| Cihaz veya diğer kimlikler | Evet | Evet | Uygulama işlevi | Bildirim cihaz anahtarı |
| Konum, kişiler, takvim, sağlık, web geçmişi | Hayır | — | — | |

## 4. İnceleme ekibi için not ve demo hesap

**Demo hesap** (kurucu oluşturur; şifre yalnız mağaza panelinin "Sign-in information" alanına yazılır, depoya ve
belgeye yazılmaz):

1. Ayrı bir inceleme adresi açın (kurucu hesabının `+etiket`i değil: `+etiket` aynı kutuya katlanır, kayıt 409 verir).
2. `/kayit`'ten e-posta ve şifreyle kayıt, e-posta doğrulaması.
3. `/admin` → Kullanıcılar → hesaba Plus tanımla (ödeme kaydı yazılmaz), en az 30 gün.
4. Hesapta örnek bir sınav hazırlığı kurun (kısa bir ders notu PDF'i), ilk ders açılmış olsun.
5. İnceleme ekibi hesabı silebilir: silinirse aynı adımlarla yeniden açın; ikinci bir yedek hesap hazır tutun.

**İnceleme notu (Notes for review), önerilen metin:**

> Cortex Plus, öğrencinin kendi ders notundan ders, test, kart ve çalışma planı hazırlayan bir eğitim uygulamasıdır.
> Uygulamaya özgü yetenekler: kamerayla defter tarama, anlık bildirim ve telefonda kurulan yerel çalışma hatırlatması,
> canlı sesli öğretmen (mikrofon), Sınav Radyosu ve podcast'in arka planda ve kilit ekranı denetimleriyle çalması,
> yüz tanıma / parmak izi ile uygulama kilidi (Ayarlar → Giriş ve güvenlik), titreşim ve paylaşım menüsü, çevrimdışı
> ekranı. Düelloda oyuncu adları süzülür; her oyuncu "Bildir" ve "Engelle" ile bildirilebilir. Uygulamada Google ile
> giriş gösterilmez (yalnız e-posta ve şifre). Hesap silme: Profil → Ayarlar → Hesabı sil → Hesabımı kalıcı olarak sil. Giriş yapmadan silme:
> https://cortexplus.app/hesap-silme. Yapay zekâ yanıtını bildirme: her yanıtın altındaki "Bildir". Uygulama içinde
> dijital içerik yalnız App Store / Google Play aboneliğiyle satılır; uygulamada başka ödeme yolu ya da dışarıya
> yönlendirme yoktur.

## 5. Mağaza panelinde yapılacaklar (kurucu aksiyonu)

| Yer | İş |
|---|---|
| App Store Connect | Abonelik grubu ve üç ürün: `sinav_haftasi` (haftalık), `plus_monthly`, `sigma_monthly` (aylık); fiyat `plans` tablosundaki fiyatla aynı fiyat basamağı. Yerelleştirilmiş ürün adı ve açıklaması Türkçe |
| App Store Connect | App Privacy formu (bölüm 2; `PrivacyInfo.xcprivacy` ile aynı), yaş derecelendirmesi anketi (yapay zekâ sohbeti sorusuna "Evet"; kullanıcı üretimli içerik: düelloda yalnız oyuncu adı görünür, süzgeç + bildir + engelle var), gizlilik politikası ve destek adresi, inceleme notu ve demo hesap (bölüm 4) |
| App Store Connect | Uygulama kimliği gelince Vercel'e `APPLE_APP_STORE_ID` (zorunlu güncelleme ekranının "Güncelle" bağlantısı) |
| App Store Connect | Uygulama açıklamasına ya da sözleşme alanına Kullanım Koşulları bağlantısı (`https://cortexplus.app/kullanim-kosullari`): otomatik yenilenen abonelikte Apple EULA bağlantısı ister |
| Google Play Console | Data safety formu (bölüm 3), hesap silme adresi `https://cortexplus.app/hesap-silme`, içerik derecelendirmesi (IARC; kullanıcılar arası etkileşim: düelloda yalnız ad, bildir ve engelle var) |
| Google Play Console | **Ön plan servisi beyanı** (App content → Foreground service permissions): `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, "Sınav Radyosu ve podcast arka planda çalarken oynatma denetimleri"; kısa bir ekran kaydı istenir (radyoyu başlat, ekranı kilitle, bildirimden duraklat) |
| Google Play Console | **Hedef kitle ve içerik**: kullanıcılar arasında 13 yaş altı (ortaokul) varsa Aileler politikası uygulanır (reklam yok, yalnız Aileler'e uygun SDK, açık gizlilik politikası). Hedef yaş grubu bilinçli seçilmeli; 13 yaş altı seçilirse incelemesi uzar |
| Google Play Console | Abonelik ürünleri (aynı kimlikler) ve temel planlar; kişisel geliştirici hesabıysa üretime çıkmadan önce kapalı testte en az 12 test kullanıcısıyla 14 gün |
| Her iki mağaza | Uygulamayı yalnız Türkiye'de yayınlamak (metinler Türk hukukuna göre; ABD'de COPPA, AB'de GDPR ayrıca değerlendirilir) |
| Vercel | Aşama 2: `REVENUECAT_WEBHOOK_SECRET`; mağaza ucu canlıda doğrulanınca `STORE_BILLING_LIVE = true` (ayrı PR) |

## 6. Kurucudan beklenen resmî bilgiler

| Bilgi | Neden | Durum |
|---|---|---|
| Geliştirici hesabının sahibi | Apple ve Google'da görünen satıcı adı, metinlerdeki veri sorumlusu ve satıcıyla (Mukadder Önder, şahıs işletmesi) aynı olmalı; başka adla açılırsa metinler güncellenir | Hesaplar açılınca |
| ETBİS kaydı | Web'de satış yapan şahıs işletmesi için Elektronik Ticaret Bilgi Sistemi kaydı; kaydın yapılıp yapılmadığı depoda doğrulanamıyor (`docs/delivery/MALIYET-VERGI-24-EKIM.md`) | Doğrulanmalı |
| Yurt dışı aktarım bildirimi | KVKK m.9: standart sözleşme imzalanıp Kurul'a bildirildiğinde `CROSS_BORDER_SCC_NOTIFIED = true` ve metin buna göre (`compliance-flags.ts`) | Bekliyor |
| Google Play geliştirici adresi ve telefonu | Ücretli uygulamada mağaza sayfasında herkese açık görünür (sitede zaten yayımlı olanlar kullanılabilir) | Hesap açılınca |
| İYS kaydı | Yalnız kampanya e-postası açılırsa | Ertelendi (21 Kasım 2026) |

VERBİS: Kurul kararlarındaki çalışan sayısı ve mali bilanço eşiklerinin altında kalan ve ana faaliyeti özel nitelikli
veri işlemek olmayan veri sorumlusu kayıttan muaftır. Cortex Plus'ın bu muafiyete girdiği varsayımla çalışıldı; güncel
eşikler ve işletmenin durumu mali müşavire doğrulatılmalı.

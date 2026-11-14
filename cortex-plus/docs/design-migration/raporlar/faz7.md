# Faz 7 · Giriş + kayıt, kurulum, /pay (`ui.v2.giris`, `ui.v2.kurulum`, `ui.v2.pay`)

7A, 7B ve 7C tek PR'da (hız için; üç bayrak ayrı, biri kapalıyken öbürleri bağımsız açılır). 7.0 incelemesi aşağıda,
ayrı bir rapor dosyası açılmadı.

## 1. Özet
- **7A giriş, kayıt, şifre sıfırlama:** bayrak açıkken alanlar 48 px hap, yazı 16 px (iOS yakınlaştırmasını önler),
  gönder düğmesi marka gradyanı (tek brand), odak halkası `--cx-focus`. Şifre alanlarına göster / gizle düğmesi
  (`aria-label` "Şifreyi göster" / "Şifreyi gizle", `aria-pressed`, `aria-controls`); düğme DOM'da hep var ama yalnız
  yeni görünümde görünür, bayrak kapalıyken ekran eskisiyle aynı. E-posta alanlarına `inputMode="email"`, gönder
  düğmelerine `aria-busy`.
- **7B kurulum:** bayrak açıkken ana eylem marka gradyanı, kartlar kenarsız (`bg-1`, köşe 24), yükleme yüzeyi kenarsız
  (`bg-1`, köşe 24; sürüklemede `brand-weak` zemin ve marka çizgisi, metin bileşenden aynen), sınav türü hapları 40 /
  telefonda 44. Adım yapısı, alan sırası, yükleme hattı ve oluşturma aynen.
- **7C /pay:** `?plan=plus|week|sigma` artık işe yarıyor: istenen kart işaretli gelir, Sigma istendiyse "Diğer planlar"
  kapalı değil açık başlar ve sayfa karta kayar. Faz 3B'nin yükseltme penceresi `/pay?plan=sigma` bağlantısı veriyordu
  ama sayfa parametreyi okumuyordu: Sigma kartı katlanmış hâlde kalıyordu. Bu düzeltme bayraktan bağımsız. Bayrak
  açıkken ekranda tek brand: istenen kartın ana düğmesi, yoksa önerilen Plus'ınki; öbür satın alma düğmeleri cam, ek
  paket düğmeleri zayıf. PayTR çerçevesi, token isteği, aktivasyon, fiyatlar ve metinler aynen.

## 2. 7.0 inceleme (kod okundu)
- **Giriş yolları:** `/giris` (istemci bileşeni), `/kayit` (sihirbaz), `/sifremi-unuttum`, `/kayit/tamamla`,
  `/auth/callback`. Sosyal giriş yalnız Google; Instagram / Facebook / TikTok tarayıcısında Google düğmesi yerine not.
- **Yönlendirme:** `next` her yerde `safeNextPath` ile doğrulanıyor (`src/lib/auth/safe-next-path.ts`); başka alan adına
  yönlendirme engelli, bekçi `giris-login.test.tsx`. **DUR koşulu yok.**
- **Alanlar:** giriş `email` / `current-password`, kayıt `email` / `new-password` ×2, sıfırlama `email`; hiçbirinde
  `autocomplete="off"` yok. Hata metinleri bildirim (toast) ile, `authErrorMessage`'tan; yanlış şifre mesajı hesabın
  varlığını söylemiyor. Tek bilinçli istisna: e-posta + şifre reddedilince `/api/auth/giris-ipucu` yalnız "hesap Google
  ile açılmış" diyebilir (AGENTS.md, 8 Kasım kararı; dokunulmadı).
- **Kayıt onayları:** KVKK aydınlatma ve koşullar okumalı kutu (`ReadGate`), yaş beyanı, isteğe bağlı kampanya izni.
  Metin ve davranış aynen.
- **e2e'nin giriş yöntemi:** `auth.setup.ts` test hesabıyla e-posta + şifre; bu fazın testleri gerçek giriş yapmaz,
  Supabase kimlik ucunu ağ katmanında taklit eder.
- **Kurulum:** `/deneme-sinavlari/olustur` → `ExamCreateEntry` → sihirbaz. Dört hedef (`?hedef=lise|yks-lgs|universite|akademik`)
  kayıt sayfasında (`signupPresetFor`), geçersiz değerde ön seçim yok; kurulum sayfası `?ders=`, `?istem=`,
  `?documentId=` okur. Hazırlık oluşturma `/api/learning/exam-prep/create`; sunucu ret kodu `free_prep_limit`
  (`lesson.create` değil). Bu yüzden "Hazırlığı oluştur" `<Gate action="lesson.create">` içine **konmadı** (ANA: yalnız
  sunucu bu eyleme bağlıysa). Hazırlık sınırı zaten sihirbazda `prepLimitReached` ile okunuyor.
- **Yükleme:** türler `DOCUMENT_UPLOAD_ACCEPT`, dosya başına 50 MB (`uploadSizeProblem`), belge sayısında ürün sınırı
  yok (31 Ekim kararı), ilerleme gerçek (yükleme motorunun olayları, `photoSetProgressLine`). "Hoca kuralı" adlı bir
  alan kodda yok; çizilmedi.
- **/pay:** `AppShell focus` → (kurucuysa durum kartı) → `#planlar` `SubscriptionCards` → `PromoRedeem` → ücretsizde
  `PlusMonth`. Fiyatlar yalnız veritabanındaki `plans.price_try`'den; bileşende sabit fiyat yok (`config.ts` fiyat
  taşımıyor, kredi ve gün taşıyor). Kart bilgisi bize gelmiyor: PayTR iFrame API, kart formu PayTR'ın çerçevesinde
  (AGENTS.md "Ödeme"). Aktivasyon `/odeme/basarili`'nın ödeme satırını yoklamasıyla; onay gelmeden "Planın aktif"
  yazılmıyor. Veli ödeme bağlantısı `/odeme/veli/[token]`, oturumsuz, aynı çerçeve.

## 3. Değişen dosyalar
- Bayrak ve sarmalayıcı: `src/lib/ui-v2/scope.tsx` (yeni; anahtar boşsa çocukları olduğu gibi döndürür),
  `src/app/{giris,kayit,sifremi-unuttum}/layout.tsx`, `src/app/deneme-sinavlari/olustur/page.tsx`, `src/app/pay/page.tsx`.
- Görünüm: `src/styles/ui-v2-{giris,kurulum,pay}.css`.
- İşaretler ve küçük davranış: `src/components/auth/password-toggle.tsx`, `src/app/giris/giris-inner.tsx`,
  `src/app/kayit/signup-wizard.tsx`, `src/app/sifremi-unuttum/page.tsx`, `src/components/parity/subscription-cards.tsx`
  (`pickedPlanFrom`, `data-cx-picked`, `data-cx-main`).
- Fikstür: `/e2e/paketler` (yeni), `/e2e/sihirbaz?ui=v2`.
- Testler: `tests/unit/ui-v2-faz7.test.tsx`, `tests/e2e/faz7.spec.ts`.

## 4. Ölçüm
- `/giris`, `/kayit`, `/sifremi-unuttum` bayrağı istek anında okumak için dinamik oldu (önce durağandı). Canlıda bayrak
  okuması süreç içinde 30 sn önbellekli (`isFeatureEnabled`); bedel sunucunun yanıt süresi, ilk ölçüm aşağıda.

## 6. Promptan ayrılan yerler
- 7A, 7B, 7C ayrı dal yerine tek PR (Burhan: "hızlan"); bayraklar ayrı kaldı.
- Kurulumda `Segmented` bileşeni yazılmadı: sınav türü hapları zaten hap; yalnız ölçü ve köşe yeni görünüme alındı.
- Dosya listesi `ListRow`'a çevrilmedi: bugünkü liste ad, boyut, durum ve kaldırma düğmesini zaten taşıyor; yapıyı
  değiştirmek yükleme davranışına dokunurdu.
- `/pay`'de radyo grubu kurulmadı: kartlar ayrı satın alma düğmeli; seçim yerine `?plan=` ile işaret ve kaydırma.
  Radyo grubu ödeme akışını değiştirirdi (7C "EN YÜKSEK DİKKAT").
- Hata metinleri sayfa içi alan hatasına çevrilmedi (bugün bildirimle); metin ve davranış değişmez kuralı.

## 10. Burhan'ın yapacakları
- Önizlemede kendi hesabınla bir kez gerçek ödeme: (1) `/pay?plan=sigma` Sigma kartı açık ve işaretli mi, (2) "Plus'a
  yükselt" PayTR çerçevesini açıyor mu, çerçeve telefonda yana taşıyor mu, (3) dönüşte "Ödemen alındı, Plus paketin
  tanımlanıyor" bekleme ekranı, (4) birkaç saniye sonra plan rozeti Plus.
- Telefonda giriş: alana dokununca ekran yakınlaşmamalı (16 px), şifre göz düğmesi.

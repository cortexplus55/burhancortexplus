# Cortex Plus — kapsamlı inceleme çalışma raporu

**Güncelleme:** 6 Eylül 2026, 13:08 TSİ. **Durum:** bağlantı, ödeme, abonelik ve temel öğrenci akışları incelendi; kritik düzeltmeler production'a alındı. Astra ücretsiz hesap karşılaştırması ve PayTR mağaza onayından sonraki gerçek test ödeme henüz tamamlanmadı.

Bu rapor ölçülmüş bulguları koddan çıkarılan risklerden ayırır. Bir testin geçmesi, gerçek ödeme veya tüm ekranların çalıştığı anlamına gelmez.

## 0. Uygulama sonucu

- GitHub `main`: `b93ebdd` — abonelik, ödeme mutabakatı, doküman tekrar işleme, doğru bağlantı betikleri ve doğrulanmamış pazarlama iddialarının temizliği.
- Vercel: aynı commit `burhancortexplus-app` production dağıtımında **Ready**.
- Supabase `dgjfyewgrukglsehyntc`: `20260906130000_subscription_billing`, `20260906140000_atomic_paytr_callback` ve `20260906150000_subscription_expiry_guards` uygulandı ve migration geçmişine kaydedildi.
- Satıştaki planlar: Plus aylık 599 TL, Plus yıllık 2.990 TL; Sigma aylık 1.999 TL, Sigma yıllık 9.990 TL.
- Canlı `/fiyatlandirma`: aylık ve yıllık değerler tarayıcıda doğrulandı. PayTR anahtarları beklediği için satın alma düğmeleri “Yakında” ve pasif.
- Canlı şema denetimi: 65/65 kontrol başarılı; proje ref'i `dgjfyewgrukglsehyntc`.
- `finalize_paytr_payment` RPC çağrılabilir durumda; olmayan denetim ödemesine beklendiği gibi `payment_not_found` döndürdü ve işlem geri alındı.

## 1. Bağlantı haritası

| Katman | Kanıt | Sonuç |
|---|---|---|
| Yerel Git → GitHub | origin ve uzak main sorgusu | Doğru repo: cortexplus55/burhancortexplus |
| GitHub → Vercel | Chrome production ayrıntısı; GitHub commit durumu | Doğru proje: cortexplus55/burhancortexplus-app |
| Vercel → domain | 5 Eylül panelinde Current Domains: cortexplus.app | Doğru |
| Vercel build kökü | Chrome Build and Deployment | cortex-plus; Node 24.x |
| Canlı uygulama → Supabase | /giris istemci paketindeki ref ve 6 Eylül /api/health | dgjfyewgrukglsehyntc; appUrl doğru |
| Yerel Supabase erişimi | .env.local ile yalnızca okuma sorguları | Doğru projeye erişim var |
| Vercel Codex bağlayıcısı | get_project 403; list_teams yalnızca eski BrhnOndr hesabını gösterdi | Yanlış hesap; düzeltilmedi |
| Supabase Codex bağlayıcısı | Hedef proje için permission hatası | Yetki/hesap bağlantısı düzeltilmeli; kök neden kesinleşmedi |
| Supabase GitHub entegrasyonu | Chrome Integrations: repository bağlı değil | Otomatik şema yayını yok; uygulama bağlantısından ayrı |
| Supabase Vercel entegrasyonu | Chrome Integrations: Install Vercel integration | Panel entegrasyonu bağlı görünmüyor; elle env bağlantısı çalışıyor |

Vercel proje ID: prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A. Takım ID: team_7fZJmWjbQtKXSDwCZCA4s7Ym.

Vercel proje ortam listesinde Supabase, OpenAI, uygulama alan adı, SMTP parolası ve Upstash değişkenleri var. Takım düzeyinde ortak değişken bağlı değil. PayTR, PostHog, Sentry ve Search Console değişkenleri yok. SMTP host/kullanıcı/port kodda güvenli operasyon varsayılanlarına sahip olduğu için yalnızca parola ve göndericiyle çalışabilir; PayTR anahtarları olmadan ödeme token'ı kesin olarak oluşturulamaz.

İlk gözlemde production 45f3e57 idi; 17e0da1 Upstash düzeltmesi preview dalındaydı. İnceleme sırasında başka çalışma b104760 ve b42230f commit'lerini main'e gönderdi. 6 Eylül Chrome paneli b42230f dağıtımını Ready + Production olarak doğruladı: https://vercel.com/cortexplus55/burhancortexplus-app/Bp7SrPXEuAJs2j8rHDPYsP5AzWNC . Vercel çalışma kayıtlarının erişilebilen son bir saatinde Warning, Error ve Fatal sayıları sıfırdı; Hobby plan daha uzun aralığı göstermedi.

## 2. Öncelikli bulgular

### P1 — Canlı fiyat kartları tutarı 100 kat büyük gösteriyor

6 Eylül uygulama içi tarayıcıda /fiyatlandirma: Plus 29.900 TL, Sigma 49.900 TL, Başlangıç 9.900 TL. Görsel olarak da doğrulandı. Aynı anda canlı plans sorgusu: Plus price_try=29900, Pro=49900, Başlangıç=9900. PayTR sepet oluşturucusu bu tutarları kuruş kabul edip 100'e bölüyor. Dolayısıyla gerçek tutarlar 299, 499 ve 99 TL.

Kaynak: src/components/parity/astra-subscription-cards.tsx, src/lib/payments/paytr.ts. Fiyat birimi düzeltildi ve yeni abonelik kolonları yoksa eski plan sorgusuna güvenli dönüş eklendi. Production'da planlar gerçek Plus/Sigma verisiyle gösteriliyor.

### P1 — Yerel abonelik kodu mevcut canlı şemayla uyumsuz

6 Eylül 11:43 TSİ okuma kontrolü: plans.billing_period ve subscriptions.current_period_start yok; iki sorgu HTTP 400. Yerel /pay, /fiyatlandirma, ödeme token API ve abonelik API bu alanları seçiyor. Bazıları hatayı boş liste veya abonelik yok şeklinde gizliyor. Token API geçerli planı bulamayarak 404 döndürebilir. Callback'teki eski alanlara dönüş bu diğer sorguları düzeltmiyor.

Kaynak: src/app/pay/page.tsx; src/app/fiyatlandirma/page.tsx; src/app/api/payments/paytr/create-token/route.ts; src/app/api/payments/subscription/route.ts.

Kullanıcı kararıyla yeni ticari model uygulandı: Plus 599 TL/ay ve 2.990 TL/yıl; Sigma 1.999 TL/ay ve 9.990 TL/yıl. Eski paketler geçmiş ödeme bağları korunarak satıştan kaldırıldı. Yeni kolonlar, kademeye bağlı aylık kota ve günlük yenileme hatırlatma işi production'da etkin.

### P1 — Ödeme alındığı hâlde hizmet tanımlanamayabilir

Hem HEAD hem yerel callback, payment_webhook_events kaydını işlemin başında processed_at ile ekliyor. Her insert hatasını tekrar bildirim sayıp OK dönüyor. Sonraki ödeme/abonelik/kredi yazımlarının çoğunda hata denetlenmiyor. İşlem yarıda kalırsa sonraki bildirim mevcut olay kaydı nedeniyle atlanıyor; üstelik payments.status hizmet tanımlanmadan paid yapılıyor.

Bu koddan doğrulanan bir başarısızlık senaryosudur; gerçek kullanıcıda para kaybı yaşandığı tespit edilmedi. `finalize_paytr_payment` veritabanı fonksiyonu production'a uygulandı: ödeme, cüzdan, hareket, abonelik, bildirim ve webhook tamamlanması tek işlem; veritabanı hatasında callback 500 dönüyor ve PayTR tekrar deneyebiliyor. PayTR dokümanı tekrar bildirimlerin merchant_oid ile ayırt edilmesini anlatır: https://dev.paytr.com/iframe-api/iframe-api-2-adim . PayTR mağazası onaylanmadığı için gerçek test ödeme henüz yapılmadı.

### P1 — Dokümanlar tarayıcı yarıda kalınca sonsuza kadar işleniyor görünebilir

Yükleme ve işleme iki ayrı istemci isteği. İlk istek dosyayı ve `processing_jobs` kaydını oluşturuyor; ikinci istek gelmezse işi sunucuda alan bir worker/cron yok. Canlı hesapta 29 Ağustos tarihli iki PDF hâlâ İşleniyor, aynı dosyanın başka denemesi `empty_content` ile Başarısız. Bu, tasarım kusurunun canlı belirtisi.

Production'da İşleniyor kayıtlarına “Yeniden işle” eklendi; tekrar deneme dokümana sabit idempotency anahtarı kullanıyor, yarım türetilmiş sayfa/chunk verisini temizliyor ve veritabanı kayıt hatalarında depodaki yetim dosyayı kaldırıyor. 271 test ve tür kontrolü geçti.

### P1 — Abonelik ve doğrulama migration'ları birbirini eziyor

`docs/delivery/subscription-billing-draft.sql` içindeki credit_reserve planın monthly_allowance değerini kullanıyor (Sigma 1600). Canlıdaki `20260905170000_email_verification_gate.sql` ise aynı fonksiyonda premium kotasını 400'e sabitliyor. Taslak doğrudan migration olarak uygulanırsa e-posta doğrulama davranışını ezebilir. Fiyat/kademe onayından sonra iki kuralı birleştiren yeni migration gerekli.

### P1 — Premium kararı bitiş tarihini denetlemiyor

Premium erişim, kredi yenileme ve davet ödülü sorguları artık `current_period_end` değerini denetliyor. Günlük cron tam bitiş anında aboneliği kapatıyor; cron çalışana kadarki saatlerde de hak sorguları süresi dolmuş üyeliği premium saymıyor.

### P2 — Bağlantı kurulum araçları yanlış projeye yönlendiriyordu

setup-vercel-link.ps1 ve verify-cli.ps1 eski burhancortexplus Vercel projesini doğru kabul ediyordu. setup-cli.ps1 iki alt betiği scripts klasörü yerine repo kökünde arıyordu. Yerel .vercel/project.json yoktu. Bu görevde doğru proje/takım/ID'ler, alt betik yolları ve iki bağlantı rehberi düzeltildi; doğru yerel project.json oluşturuldu. Bu, CLI hesabına yetki vermez. Betikler sözdizim kontrolünden geçti; oturum açan kurulum betiği çalıştırılmadı.

### P1 — PayTR mağaza onayı beklerken satın alma düğmesi açıktı

6 Eylül proje ortam listesinde `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` yok; takım ortak değişkenleri de boş. Yerel `.env.local` dosyasında aynı alanlar boş. `PAYTR-ABONELIK.md`, cortexplus.app ek mağaza başvurusunun 5 Eylül'de gönderildiğini ve onay beklediğini belgeliyor; bu nedenle anahtarların henüz olmaması beklenen durum. Production'da sunucu yapılandırmasına göre düğmeler “Yakında” ve pasif. Mağaza onaylandığında anahtarlar Vercel secret olarak eklenmeli ve PayTR'nin istediği gerçek test ödeme yapılmalı.

### P2 — Yayın kontrolleri şemayı doğrulamıyor

GitHub CI Node 20 kullanırken Vercel Node 24 kullanıyor. CI lint, typecheck, build ve unit test çalıştırıyor; canlı şema önkoşulunu kontrol etmiyor. Vercel panelinde deployment checks tanımlı değildi. Derleme başarılı olsa bile olmayan kolonlar çalışma anında hata oluşturuyor. Bu görevde scripts/audit-live-schema.mjs eklendi: yalnızca GET, limit(0), hedef kilidi ve zaman aşımıyla 63 literal tabloyu ve abonelik alanlarını kontrol eder; eksik şemada exit 1 verir. RLS, fonksiyon gövdeleri ve migration geçmişini doğrulamaz.

### P2 — Canlı vitrin ürün/veriyle tam örtüşmüyor

/fiyatlandirma Sigma gösteriyor; canlı veri setinde aktif paketler Başlangıç, Cortex Plus ve Cortex Pro. Yıllık %58 düğmesi var; canlı şemada yıllık plan alanları yok. Ana sayfada kaldırılan uygulamalar bölümüne rağmen onlarca interaktif uygulama sözü var. 12.400 öğrenci, 2.1M soru, %94 net artışı değerleri cinematic-social-proof.tsx içinde sabit metinler; analitikten çekilmiyor. Kanıtları kullanıcıyla doğrulanmalı veya vitrin metinleri gerçek ürüne göre düzeltilmeli.

Production'da doğrulanmamış sayılar, isimli örnek yorumlar, “2 kat hızlı” ve kaldırılmış uygulamalar vaadi çıkarıldı. Yerine çalışan ürün döngüsü — yanlış defteri, kişisel kaynak, çalışma planı ve ilerleme — anlatılıyor.

## 3. Geçen kontroller

- Doğru GitHub reposuna bağlayıcı ve CLI erişimi.
- Canlı Supabase ref'i ve /api/health: ok=true.
- 6 Eylül canlı şemada kaynakta geçen 63 literal tablonun varlık kontrolü; abonelik kolon kontrolleri hariç başarılı.
- abuse_events 5 Eylül yoktu; 6 Eylül yeniden sorgulamada mevcut. Önceki eksik bulgusu kapandı; RLS/fonksiyon denetimi yapılmış sayılmaz.
- Supabase panelindeki son bir saatlik dört Postgres hatasının tamamı 11:42–11:43'te yapılan şema denetiminden geldi: iki kez `plans.billing_period`, iki kez `subscriptions.current_period_start`. Başka Postgres hatası görünmedi.
- npm run lint: hata yok, 6 kullanılmayan değişken/fonksiyon uyarısı.
- npm run typecheck: başarılı.
- npm test: 33 dosya / 271 test başarılı.
- npm run build: başarılı, 131 rota üretildi; doğrulanan commit production'a dağıtıldı.
- Playwright: 39/39 tarayıcı testi başarılı; anonim erişim korumaları, genel sayfalar, mobil taşma, başlık ve temel erişilebilirlik kontrolleri geçti.
- Bu görevde değiştirilen 3 PowerShell dosyası: 0 parse hatası; git diff --check başarılı.

## 4. Tarayıcıda görülenler ve eksik kapsam

Görüldü: Cortex Plus misafir ana sayfa, fiyatlandırma, kayıt ilk adımı; oturumlu hesapta Sor, Profil, sınav hazırlığı, araçlar, yanlış defteri, günün turu, çalışma planı, dokümanlar, quizler, flashcardlar, anlatarak öğren, ilerleme ve sohbet geçmişi. Sayfalar boş kalmadı. Cortex profilinde Temel — Ücretsiz plan yazıyordu; bu hesap premium değil.

Astra Chrome oturumu açık. Hesap adı “Deneme”; Astra AI Plus üyeliği 24 Eylül 2026'ya kadar geçerli. Sor ekranı, sınav hazırlıkları, etkinlik menüsü ve Lab incelendi. Lab'da oyun, simülasyon, araç, günlük bulmaca, liderlik tablosu ve kullanıcı uygulamaları var; Cortex Plus'ta bu alan ürün kararıyla kaldırıldığı için otomatik parite işi sayılmadı. Ücretsiz Astra hesabı henüz ayrı oturumda açılmadı.

Bekliyor: Astra ücretsiz hesap karşılaştırması; Cortex premium hesabı; gerçek sohbet/quiz/sınav oluşturma, yeni doküman yükleme ve ses akışları; hesaplar arası veri izolasyonu, admin ve mail teslimi; PayTR test ödeme ve callback doğrulaması; Vercel environment değerlerinin isim/kapsam karşılaştırması; Supabase canlı RLS ve fonksiyon izinleri; migration geçmişinin tam karşılaştırılması; mobil ekranların kapsamlı görsel kontrolü. Bu kalemler tamamlanmadan tam sistem denetimi tamamlandı denmemeli.

## 5. Önerilen uygulama sırası

1. Chrome'u yeniden bağla; Astra premium ve Cortex test hesaplarını aç. Codex Vercel/Supabase bağlantılarının doğru hesaba yetkilendirilmesini tamamla.
2. Canlı fiyat birimi hatasını bağımsız düzelt; ardından kart/checkout tutarını birlikte kontrol et.
3. Ödeme callback'ini atomik ve yeniden denemeye dayanıklı hâle getir; kesinti/tekrar/eşzamanlılık testleri ekle.
4. Abonelik + e-posta doğrulama kota değişikliklerini birleştir; canlı şema geçmişini çıkar ve uygulanacak tek değişikliği incele. Otomatik db push kullanma.
5. Şema önkoşulları → preview → test ödeme → production → gerçek ekran kontrolü sırasıyla yayımla.
6. Öğrenci akışları ve Astra karşılaştırmasını tamamla; yalnızca öğrenciye yarar sağlayan farkları iş listesine al.

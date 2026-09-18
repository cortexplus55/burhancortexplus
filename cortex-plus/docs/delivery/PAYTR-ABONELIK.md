# PayTR aboneliği — kurulum ve kalan işler

5 Eylül 2026'da yazıldı. Ödeme entegrasyonunun *neden* böyle kurulduğunu
anlatır; koddan okunamayan kısım budur.

## Mağaza: cortexplus.app kendi mağazasını ister

PayTR'da **bir mağaza = bir site**. Her mağazanın kendi `merchant_id`,
`merchant_key`, `merchant_salt` üçlüsü ve **tek bir bildirim (callback) URL'i**
vardır. Bildirim URL'i istek başına değiştirilemez, mağaza ayarıdır.

Hesapta bugün tek mağaza var:

| Alan | Değer |
|---|---|
| Mağaza no | `710114` |
| Kayıtlı site | `https://tusaicortex.com/` |
| Bildirim URL | `https://tusaicortex.com/api/payment/paytr-notify` |
| Komisyon | %2,95 (vergiler dahil) |
| Sözleşme | 05.06.2026 |
| Havale/EFT | tanımlı değil |

Bu mağaza **tusaicortex.com'a ait ve orada kalacak**. cortexplus.app için
PayTR panelinden **ek mağaza başvurusu** yapılır (Mağazalar → "Yeni bir
mağaza mı açmak istiyorsunuz?"). Ek mağaza, ana mağazayla aynı firma
bilgileriyle açılır; başvuru formu yalnızca site adresi, aylık ortalama ciro
ve yetki onayı ister.

> **Durum (17 Eylül 2026):** `https://cortexplus.app` için ek mağaza
> **onaylandı**. Sırada yalnızca aşağıdaki dört adım var; anahtarlar Vercel'e
> girilene kadar ortamda PayTR anahtarı yok ve olmamalı.

**Onay gelince yapılacaklar:**

1. Yeni mağazanın Entegrasyon Bilgileri sayfasından üç değeri al.
2. Vercel → `burhancortexplus-app` → Environment Variables:
   `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
   **710114'ün anahtarlarını buraya yazma** — o tusaicortex'in mağazası.
3. Yeni mağazanın panelinde Destek & Kurulum → Ayarlar → Bildirim URL:
   `https://cortexplus.app/api/payments/paytr/callback`
   Yolun sonundaki `callback` önemli; PayTR'ın varsayılan örneği
   `paytr-notify` diyor, bizim rotamız o değil.
4. `PAYTR_TEST_MODE=1` ile test kartından uçtan uca dene, sonra `0` yap.

## Yenileme neden otomatik değil

PayTR'ın iFrame API'si tek seferlik ödeme alır. Otomatik tahsilat için
**Kayıtlı Kart Tekrarlayan Ödeme** servisi gerekiyor ve o servis üç şey ister:
Direkt API entegrasyonu, kart saklama (`utoken` + `ctoken`) ve **Non3D
yetkisi**. Non3D ile `recurring_payment` yetkisi mağazaya otomatik gelmiyor —
PayTR'a talep açılıyor, birimleri onaylıyor.
Belge: <https://dev.paytr.com/direkt-api/kart-saklama-api/kayitli-kart-tekrarlayan-odeme>

### Engel yalnızca izin değil — 17 Eylül 2026'da doğrulandı

PayTR'nin kendi dokümanı yeniden okundu ve şu ortaya çıktı: **iFrame API'nin
kart saklama parametresi yok**. `store_card`, `utoken`, `ctoken` — hiçbiri
iFrame token isteğinin parametre listesinde geçmiyor; kart saklama tümüyle
Direkt API başlığının altında tanımlı.

Yani Non3D yetkisi alınsa bile bugün saklanacak bir kart olmuyor. Kart
saklamak Direkt API'ye geçmek demek ve Direkt API'de **kart numarası ile CVV
kendi sunucumuzdan** PayTR'ye gidiyor — bu PCI-DSS kapsamına girmek, tek
kişilik bir işletme için ayrı ve ciddi bir karar.

| Engel | Neden |
|---|---|
| Kart saklama iFrame API'de yok | `store_card` yalnızca Direkt API'de |
| Direkt API kart verisini bizden geçiriyor | PCI-DSS kapsamı |
| Non3D yetkisi ayrıca talep ediliyor | PayTR birimleri onaylıyor |

Bu üç madde kodda tek yerde yazılı: `src/lib/payments/paytr-capability.ts`
→ `RECURRING_BLOCKERS`, ve `/admin/sistem` sayfasında tablo olarak görünüyor.
Aynı dosyadaki `AUTO_RENEW_SUPPORTED` sabiti **tek kaynak**: `false` durduğu
sürece bir bekçi test, sözleşme metninin "otomatik olarak yenilenmez" demeye
devam ettiğini doğruluyor. Sözleşmede söz verilip üründe yapılmayan şey, hiç
söz vermemekten kötü.

### Yetki gerçekten var mı — artık sorulabiliyor

`probePaytrRecurring()` kart saklama servisine **var olmayan** bir kullanıcı
için kayıtlı kart listesi soruyor (`/odeme/capi/list`). Para hareketi yok,
yalnızca okuma. Cevap `/admin/sistem`'de açık / kapalı / belirlenemedi olarak
yazıyor ve anahtarlar Vercel'e girildiği an kendiliğinden gerçek cevabı
veriyor.

İki şeye dikkat edildi:

- **İmza formülü** dokümandan birebir: `hash_str = utoken + merchant_salt`.
  `merchant_id` EKLENMEZ. İlk yazımda eklenmişti; PayTR her isteği imza
  hatasıyla reddedecekti ve hata cevabı `{"status":"error",...}` olduğu için
  "status" kelimesine bakan okuma bunu **başarı** sanacaktı. Yani yanlış
  formül tam olarak kaçınılmak istenen sonucu üretiyordu: yetki yokken
  "yetki var".
- **Belirsizlik asla "açık" okunmuyor.** Yanlış "kapalı" okumanın bedeli
  gereksiz bir uyarı; yanlış "açık" okumanın bedeli tutulamayacak bir söz.

Bekçi test: `tests/unit/paytr-capability.test.ts`.

### Sıradaki adım: PayTR'den yazılı cevap

Direkt API'ye geçmek ürün sahibinin kararı ve karar **park edildi**: önce
PayTR'ye sorulacak. Dört soru ve her cevabın ne değiştireceği hazır:
`PAYTR-DESTEK-TALEBI.md`. Dördüncü soru Non3D / `recurring_payment`
yetkisinin bu mağazada tanımlı olup olmadığını doğrudan kaynağından
soruyor — "yetki alındı sanıyorum" ile gerçek durum arasındaki farkı
kapatacak olan da bu.

Bu yüzden bugünkü model **hatırlatmalı yenileme**:

- Ödeme gelince `subscriptions.current_period_end` planın `period_days`
  kadar ileri atılır (30 veya 365).
- `subscriptions.auto_renew` **false** duruyor. "Kod hazır, yalnızca yetki
  eksik" demek yanlış olurdu: tahsilat kodu hiç yazılmadı ve yazılabilmesi
  için önce Direkt API'ye geçilmesi gerekiyor.
- Günlük cron (`/api/cron/subscription-renewal`, Vercel `crons`, 06:00 UTC)
  bitişe 3 gün kalanlara bildirim atar, süresi dolanı `inactive` yapar.
  Yetkilendirme: `Authorization: Bearer $CRON_SECRET`.

**Açılabilmesi için sırayla:** (1) Direkt API'ye geçiş — ödeme formu bizde,
kart verisi bizden geçiyor, PCI kapsamı kabul ediliyor; (2) ödeme anında
`store_card=1` ile kart saklama ve dönen `utoken`/`ctoken`'ın saklanması
(`subscriptions` tablosuna `paytr_utoken`, `paytr_ctoken` sütunları);
(3) PayTR'den Non3D + `recurring_payment` yetkisi; (4) cron'a `auto_renew =
true` satırları için `https://www.paytr.com/odeme` POST'u (`non_3d=1`,
`recurring_payment=1`); (5) sözleşme metinlerinin ve
`AUTO_RENEW_SUPPORTED`'ın aynı anda güncellenmesi.

Sıra önemli: (5) önce yapılırsa sözleşme tutulamayan bir söz verir.

## Erken yenileme kalan günü yakmaz

`nextPeriodEnd()` yeni dönemi **mevcut bitişin üstüne** ekler. Bitişine 10 gün
kalmışken aylık yenileyen öğrenci 30 değil 40 gün alır. Aksi hâlde erken
yenilemek cezaya dönerdi ve kimse süresi dolmadan yenilemezdi.

## Fiyatlar

Astra AI'ın 5 Eylül 2026 tarihli vitrini referans alındı (Plus ₺770/ay ve
₺3.852/yıl, Sigma ₺2.567/ay; Sigma'da yıllık seçeneği yok). Her kalemde
%22 aşağıda kaldık:

> **18 Eylül 2026'da referans yeniden kontrol edildi: Astra Plus hâlâ 770 TL.**
> Kademeler de aynı (Plus + Sigma, aylık/yıllık). Yani aşağıdaki fiyatlar
> güncel bir karşılaştırmaya dayanıyor, değiştirilecek bir şey yok. Bir daha
> sorulursa bu satır cevaptır.

| | Aylık | Yıllık | Yıllıkta tasarruf |
|---|---|---|---|
| Plus | ₺599 | ₺2.990 (₺249/ay) | %58 |
| Sigma | ₺1.999 | ₺9.990 (₺833/ay) | %58 |

`plans.price_try` **kuruş** tutar (`59900` = ₺599,00). İsmi yanıltıcı ama
`formatTry()` ve PayTR'a giden tutar bu varsayıma dayanıyor — değiştirilirse
ödeme tutarları 100 katına çıkar.

Kademeyi ayıran şey kota: `plans.monthly_allowance` (Plus 400, Sigma 1600).
`credit_reserve()` dönem yenilerken bu değeri okur. Önceden her premium
kullanıcı 400 alıyordu, yani Sigma kartındaki "daha yüksek aylık kullanım
hakkı" kodda karşılığı olmayan bir sözdü.

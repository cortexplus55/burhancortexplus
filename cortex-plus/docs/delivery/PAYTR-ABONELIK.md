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

Kademeyi ayıran şey kota: `plans.monthly_allowance` (kredi sistemi v2'den beri, 8 Ekim 2026: Plus
7.200, Sigma 60.000; ilk hâli Plus 400, Sigma 1600).
`credit_reserve()` dönem yenilerken bu değeri okur. Önceden her premium
kullanıcı 400 alıyordu, yani Sigma kartındaki "daha yüksek aylık kullanım
hakkı" kodda karşılığı olmayan bir sözdü.

## İade

PayTR iade için ayrı bir callback göndermez. İade üç yoldan deftere işlenir:

1. **Admin → Ödemeler → İade et** — uygulamadan PayTR iade API'sine istek
   atar, başarılıysa krediyi / aboneliği geri alır.
2. **PayTR'de yapıldı, kaydet** — iade PayTR panelinden zaten yapılmışsa,
   uygulamayı tekrar PayTR'ye göndermeden deftere yazar (test modunda iade
   API'si çalışmıyorsa bu yol kullanılır).
3. **PayTR'den kontrol et** — Durum Sorgu ile PayTR'deki `returns[]`
   listesini çeker; her `reference_no` bir kez işlenir.

### Harcanmış kredi

Kredi paketi iade edilince geri alınacak tutar, satın alma anındaki
ledger satırından (`pay_<sipariş>`) okunur. Bakiye **asla eksiye düşmez**:
kullanıcı kredinin bir kısmını harcadıysa yalnızca kalanı alınır; harcanmış
kısım admin önizlemesinde "geri alınamayan" olarak görünür.

### Kısmi iade

Kısmi iade orantılı kredi geri alır; Plus/Sigma planını **kapatmaz**.
Ödeme satırı `paid` kalır, ekranda "Kısmi iade: X TL" yazılır. Tam iadede
durum `refunded` olur. Abonelikte tam iade, kullanıcının **aktif**
aboneliğini hedefler (plan yükseltmesinden sonra eski Plus ödemesi iade
edilse bile); önceki ödenmiş dönem hâlâ sürüyorsa süre kısaltılır, yoksa
abonelik iptal edilir ve dönem hakkı sıfırlanır.

### Mutabakat ve yarım kalan iade

"PayTR'den kontrol et" PayTR'deki iade **toplamını** kayıtlı toplamla
karşılaştırır; fark (delta) kadar tek satır yazar. `reference_no` olmasa
bile aynı toplam iki kez işlenmez. Panelden "kaydet" sonrası kontrol de
çift saymaz.

İade kaydı önce `applying` olur; kredi/abonelik adımları bitince `applied`
yapılır. Bir adım yarıda kalırsa satır `applying` kalır ve aynı referansla
tekrar denendiğinde kaldığı yerden devam eder.

Eski akışta `payments.status=refunded` yazılmış ama `refunds` satırı
olmayan kayıtlarda aktif (yeni) aboneliğe dokunulmaz — yalnızca kredi
defteri tamamlanır.

## Onay sonrası uygulama planı (8 Kasım 2026)

Ürün sahibi 8 Kasım'da otomatik yenileme, 3 günlük ek süre, kart silme ve
hukuki metin paketini istedi; PayTR onayı olmadığı için (bkz.
`PAYTR-DESTEK-TALEBI.md` → "Durum") **yazılmadı**. Onay + test ortamı gelince
bu sırayla, tek PR'da değil aşamalı:

| Aşama | Ne | Kural |
|---|---|---|
| 0 | PCI belgesi (PayTR'nin istediği SAQ) ve Vercel'de `PAYTR_DIRECT_API=1` | Belge olmadan canlıya kart formu çıkmaz |
| 1 | Göç (yalnız ekleme): `subscriptions.paytr_utoken`, `paytr_ctoken`, `card_last4`, `card_brand`, `grace_period_until`, `renewal_retry_count`, `last_renewal_attempt_at`, `last_renewal_error`; `auto_renew`/`cancel_at_period_end` zaten var | utoken/ctoken yalnız `service_role`; istemciye yalnız `has_saved_card`, `card_last4/brand`, `auto_renew`, `cancel_at_period_end`, `current_period_end`, `grace_period_until` |
| 2 | **İlk ödeme Direkt API ile** (3D, `store_card=1`, kendi kart formumuz; taksit tablosu bizde); veli bağlantısı (`/odeme/veli/[token]`) **her zaman** `store_card=0`, `auto_renew=false` | Kart numarası ve CVV sunucumuzdan geçer: sunucu kaydı tutmaz, günlüğe yazmaz |
| 3 | `paytr-recurring.ts`: `kayitli-kart-tekrarlayan-odeme` imzası (`merchant_id + user_ip + merchant_oid + email + payment_amount + payment_type + installment_count + currency + test_mode + non_3d` + salt, HMAC-SHA256 base64), `recurring_payment=1`, `non_3d=1`; CAPI list / delete; `utoken` callback'ten | Test modunda PayTR test kartıyla uçtan uca doğrulanmadan canlı anahtar açılmaz |
| 4 | Yenileme **mevcut günlük cron'un içinde** (`subscription-renewal`; Hobby'de üçüncü cron yok): aday = `auto_renew` ∧ ¬`cancel_at_period_end` ∧ utoken ∧ (`current_period_end <= now` ∨ ek süre içinde, son denemeden ≥ 20 sa, `renewal_retry_count < 3`); `merchant_oid` dönem + deneme numarasından deterministik (çift çekim imkânsız); başarıda dönem uzar, sayaçlar sıfırlanır, Resend "yenilendi" e-postası; 1. başarısızlıkta `grace_period_until = now + 3 gün`, erişim sürer, e-posta; 3. başarısızlıkta `expired` + `auto_renew=false`, "ücretsize geçildi, borç yok" e-postası | Asla eksi bakiye / borç; ek süre boyunca Plus hakları aynen |
| 5 | Öğrenci `/pay`: sonraki yenileme tarihi ve tutarı, maskeli kart, "Otomatik yenilemeyi kapat/aç", "Kayıtlı kartımı sil" (CAPI delete; dönem sonuna kadar hak sürer), ek süre sarı kartı; `/admin/odemeler`: otomatik yenilemesi açık / ek süredeki abone sayısı, son denemeler; `/admin/sistem`: kart saklama durumu (bugünkü yoklama) | Öğrenci kredi sayısı görmez |
| 6 | **En son, tek commit'te:** `AUTO_RENEW_SUPPORTED = true`, `RECURRING_BLOCKERS = []`, KVKK (m.5/2-c, utoken/ctoken, maskeli kart, PayTR'ye iletim), gizlilik (PCI altyapısı PayTR'de, kart silme, veli bağlantısında saklama yok), ön bilgilendirme + mesafeli satış ("Abonelik yenileme, otomatik tahsilat ve iptal": güncel bedel kayıtlı karttan, fiyat değişikliği öncesi e-posta, tek tıkla cezasız durdurma, 3 gün / 3 deneme, borçsuz ücretsize dönüş, veli ödemesi tek seferlik), kullanım koşulları; KVKK sürümü değişir → onay kapısı yeniden sorar (tasarım gereği) | Bekçi testler bu flip'i zorlar: metinler sabit true/false'a göre |

Pastedeki "iFrame'e `store_card=1` gönder" adımı **yok**: iFrame API'de böyle
bir parametre bulunmuyor (17 Eylül 2026 doğrulaması, PayTR'nin 5 Ekim cevabı).

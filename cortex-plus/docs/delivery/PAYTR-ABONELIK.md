# PayTR aboneliği — kurulum ve kalan işler

5 Eylül 2026'da yazıldı, 16 Eylül 2026'da güncellendi (ek mağaza onaylandı).
Ödeme entegrasyonunun *neden* böyle kurulduğunu anlatır; koddan okunamayan
kısım budur.

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

> **Durum (16 Eylül 2026): ek mağaza onaylandı.** 5 Eylül'de gönderilen
> `https://cortexplus.app` başvurusu PayTR tarafından kabul edildi. Artık
> yapılacak iş panelden üç değeri alıp ortama taşımak.

**Canlıya alma sırası — bu sırayla yapın:**

1. Yeni mağazanın **Entegrasyon Bilgileri** sayfasından üç değeri al.
2. Vercel → `burhancortexplus-app` → Environment Variables:
   `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
   **710114'ün anahtarlarını buraya yazma** — o tusaicortex'in mağazası.
3. Yeni mağazanın panelinde Destek & Kurulum → Ayarlar → **Bildirim URL**:
   `https://cortexplus.app/api/payments/paytr/callback`
   Yolun sonundaki `callback` önemli; PayTR'ın varsayılan örneği
   `paytr-notify` diyor, bizim rotamız o değil. Yanlış yazılırsa ödeme
   çekilir ama abonelik hiç açılmaz — panelde işlem "Devam Ediyor" kalır.
4. `PAYTR_TEST_MODE=1` ile test kartından uçtan uca dene.
5. Çalıştığını gördükten sonra `PAYTR_TEST_MODE=0` **ve** `PAYTR_DEBUG_ON=0`
   yapıp yeniden dağıt.

## Test modu sessizce para kaybettirir

`test_mode=1` iken PayTR gerçek para çekmez, ama bildirim yine `success`
döner: `finalize_paytr_payment` çalışır, abonelik açılır, kredi yüklenir —
kasaya hiçbir şey girmez. Yani ekranda her şey doğru görünürken ürün
bedava dağıtılıyor olur.

Bu yüzden **Yönetim → Sistem** ekranı PayTR satırını anahtarlar tanımlıyken
bile `Test modu` diye işaretliyor ve üstte uyarı gösteriyor
(`isPaytrTestMode()`). O ekranın yanlış bilgi vermemesi kuralı burada da
geçerli: "Tanımlı" demek "para geliyor" demek değil.

`PAYTR_DEBUG_ON` kodda **0** varsayılıyor. PayTR `debug_on=1`'i yalnızca
entegrasyon için öneriyor; açık kalırsa hata ayrıntısı ödeme çerçevesinde
müşteriye görünür.

## Tutar doğrulaması — bilinçli olarak yok

`finalize_paytr_payment` bildirimdeki tutarı `payments.amount_try` ile
karşılaştırmıyor. Sahtecilik riski değil: `hash` merchant key ile
imzalanıyor, tutarı uydurulmuş bir bildirim zaten `INVALID` dönüyor.

Eşitlik kontrolü **eklenmemeli**: taksitli alışverişte PayTR'ın gönderdiği
`total_amount`, 1. adımda yollanan `payment_amount`'tan **büyük** olur
(taksit komisyonu). Eşitlik arayan bir kontrol taksitli ödemeleri reddeder.
Bir gün eklenecekse doğru kural `total_amount >= amount_try` — eksik ödemeyi
yakalar, taksiti bozmaz.

## Yenileme neden otomatik değil

PayTR'ın iFrame API'si tek seferlik ödeme alır. Otomatik tahsilat için
**Kayıtlı Kart Tekrarlayan Ödeme** servisi gerekiyor ve o servis üç şey ister:
Direkt API entegrasyonu, kart saklama (`utoken` + `ctoken`) ve **Non3D
yetkisi**. Non3D ile `recurring_payment` yetkisi mağazaya otomatik gelmiyor —
PayTR'a talep açılıyor, birimleri onaylıyor.
Belge: <https://dev.paytr.com/direkt-api/kart-saklama-api/kayitli-kart-tekrarlayan-odeme>

Bu yüzden bugünkü model **hatırlatmalı yenileme**:

- Ödeme gelince `subscriptions.current_period_end` planın `period_days`
  kadar ileri atılır (30 veya 365).
- `subscriptions.auto_renew` **false** duruyor — kod hazır, yetki yok.
- Günlük cron (`/api/cron/subscription-renewal`, Vercel `crons`, 06:00 UTC)
  bitişe 3 gün kalanlara bildirim atar, süresi dolanı `inactive` yapar.
  Yetkilendirme: `Authorization: Bearer $CRON_SECRET`.

**Yetki geldiğinde:** cron'un içine `auto_renew = true` olan satırlar için
`https://www.paytr.com/odeme` üzerine `non_3d=1` + `recurring_payment=1`
POST'u eklenecek; kart tokenları için `subscriptions` tablosuna `paytr_utoken`
ve `paytr_ctoken` sütunları gerekecek.

## Erken yenileme kalan günü yakmaz

`nextPeriodEnd()` yeni dönemi **mevcut bitişin üstüne** ekler. Bitişine 10 gün
kalmışken aylık yenileyen öğrenci 30 değil 40 gün alır. Aksi hâlde erken
yenilemek cezaya dönerdi ve kimse süresi dolmadan yenilemezdi.

## Fiyatlar

Astra AI'ın 5 Eylül 2026 tarihli vitrini referans alındı (Plus ₺770/ay ve
₺3.852/yıl, Sigma ₺2.567/ay; Sigma'da yıllık seçeneği yok). Her kalemde
%22 aşağıda kaldık:

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

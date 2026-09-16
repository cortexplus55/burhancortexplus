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

> **Durum (16 Eylül 2026, canlıdan doğrulandı):** kod tarafı bitti ve
> yayında çalışıyor; eksik olan tek şey mağaza anahtarları.
>
> | Kontrol | Sonuç |
> |---|---|
> | `POST /api/payments/paytr/callback` (bozuk imza) | **400 `INVALID`** — rota yayında, middleware muaf tutuyor, imzasızı reddediyor |
> | `POST /api/payments/paytr/create-token` (oturumsuz) | **401** — yetki koruması çalışıyor |
> | `/fiyatlandirma` butonları | **"Yakında"** — `isPaytrConfigured()` false, yani Vercel'de `PAYTR_*` **tanımlı değil** |
> | `tests/unit/paytr.test.ts` | 10/10 geçiyor |
>
> Yani ek mağaza onayı gelir gelmez yapılacak iş yalnızca üç değeri almak ve
> bildirim URL'ini yazmak. Kodda dokunulacak yer yok.

**Onay gelince yapılacaklar:**

1. Yeni mağazanın Entegrasyon Bilgileri sayfasından üç değeri al.
2. Bunları **`.env.local`'a** yaz (terminale yapıştırma) ve doğrula:

   ```bash
   npx dotenv -e .env.local -- node scripts/verify-paytr.mjs
   ```

   Script sırayla şunları yapar: anahtarların varlığı, mağaza numarasının
   710114 *olmadığı*, imza gidiş-dönüşü, PayTR'dan **gerçek** `get-token`
   yanıtı (mağazanın canlı olduğunun tek kesin kanıtı), canlı callback ucunun
   bozuk imzayı reddetmesi ve son olarak doğru imzalı bir yoklamayla
   **Vercel'deki anahtarların yereldekiyle eşleştiği**. Hiçbir adım para
   çekmez. Hepsi ✓ olmadan ödeme akışı açılmamalı.
3. Vercel → `burhancortexplus-app` → Environment Variables:
   `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
   **710114'ün anahtarlarını buraya yazma** — o tusaicortex'in mağazası.
   Panel yerine script kullanacaksan:

   ```bash
   VERCEL_TOKEN=... node scripts/push-vercel-env.mjs --include-paytr
   ```

   `--include-paytr` bilerek zorunlu: bayrak olmadan `PAYTR_*` atlanır, böylece
   tusaicortex anahtarları kazara bu projeye gitmez.
4. Yeni mağazanın panelinde Destek & Kurulum → Ayarlar → Bildirim URL:
   `https://cortexplus.app/api/payments/paytr/callback`
   Yolun sonundaki `callback` önemli; PayTR'ın varsayılan örneği
   `paytr-notify` diyor, bizim rotamız o değil.
5. `PAYTR_TEST_MODE=1` ile test kartından uçtan uca dene, sonra `0` yap.
   Ödemenin gerçekten açıldığını `/fiyatlandirma` butonlarının artık
   "Yakında" yazmamasından gör — o yazı `isPaytrConfigured()`'a bağlı.

### Tek komutla aktivasyon

Yukarıdaki 2–5. adımları elle yapmak yerine:

```bash
VERCEL_TOKEN=... PAYTR_MERCHANT_ID=... PAYTR_MERCHANT_KEY=... PAYTR_MERCHANT_SALT=... \
  node scripts/activate-paytr.mjs
```

Sırayla: anahtar biçimi ve 710114 koruması → PayTR'dan gerçek `get-token` →
anahtarları Vercel'e yaz → **production'ı yeniden dağıt** (env değişkeni
dağıtım olmadan etkimez, kolay atlanan adım bu) → dağıtım READY olana kadar
bekle → canlıdan callback imzasını ve `/fiyatlandirma` butonlarını doğrula.

Herhangi bir adım düşerse sonrakine geçilmez. Önemli sonucu: anahtarlar
PayTR'a karşı kanıtlanmadan Vercel'e **yazılmaz**, yani hatalı anahtarla
yarım açık bir ödeme akışı bırakılamaz. `--dry-run` hiçbir şey yazmadan ne
yapacağını söyler ve token istemez.

Kalan tek elle iş bildirim URL'i — o mağaza ayarı, API'si yok.

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

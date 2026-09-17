# PayTR kurulumu — adım adım

Kod tarafı **tamamen hazır**. Eksik olan yalnızca üç anahtar ve PayTR
panelinde bir adresin kaydedilmesi. Bu belge, girişleri yapan kişinin
karşılaşacağı tuzakları da yazıyor — biri akşamını yiyebilecek türden.

## Önce: neyin hazır olduğu

| Parça | Durum | Yer |
|---|---|---|
| Token üretimi (HMAC-SHA256) | ✅ | `src/lib/payments/paytr.ts` |
| Ödeme başlatma ucu | ✅ | `src/app/api/payments/paytr/create-token/route.ts` |
| Geri çağrı ucu | ✅ | `src/app/api/payments/paytr/callback/route.ts` |
| Geri çağrı hash doğrulaması | ✅ | `verifyPaytrCallbackHash` |
| Geri çağrının middleware'den muafiyeti | ✅ | `src/middleware.ts` |
| Tek işlemde ödeme kapatma | ✅ | `finalize_paytr_payment` (göç dosyası) |
| Başarılı / başarısız dönüş sayfaları | ✅ | `/odeme/basarili`, `/odeme/basarisiz` |
| Butonun kendiliğinden açılması | ✅ | `isPaytrConfigured()` → `checkoutEnabled` |

Yani üç anahtar tanımlandığı an fiyat sayfasındaki **"Yakında" butonu
"Satın al"a dönüyor**; kod değişikliği gerekmiyor, yeniden dağıtım yeterli.

## Kısayol: tek betik

Panelde tıklamak yerine, giriş yaptıktan sonra tek komut:

```powershell
npx vercel login          # cortexplus55 erişimi olan hesapla — TEK giriş adımı
.\scripts\setup-paytr.ps1
```

Betik üç değeri terminalde **gizli** olarak soruyor (yazarken ekranda
görünmüyor), Vercel'e Production ortamına yazıyor, yeniden dağıtıyor ve fiyat
sayfasındaki butonun "Satın al"a döndüğünü kontrol ediyor. Değerler yalnızca o
terminalde yaşıyor: sohbete, bir dosyaya ya da ekran görüntüsüne uğramıyor.

Göç dosyaları için de ayrı bir betik var:

```powershell
.\scripts\setup-supabase.ps1     # giriş + link (bir kez)
.\scripts\apply-migrations.ps1   # ne olacağını gösterir, onay ister
```

> Bu iki betik yazıldı ama **çalıştırılarak denenmedi** — geliştirme ortamında
> PowerShell yok. Sözdizimi statik olarak doğrulandı; ilk çalıştırmada bir şey
> takılırsa aşağıdaki elle adımlar her zaman geçerli.

---

## 1. PayTR panelinden alınacak üç değer

> Bu menü yolları PayTR'nin kendi geliştirici dokümanından doğrulandı
> (`dev.paytr.com`, 16 Eylül 2026). Belgenin ilk sürümünde yol yanlış
> yazılmıştı.

**Mağaza Paneli → Destek & Kurulum → Entegrasyon Bilgileri**

| Vercel'deki ad | PayTR'deki karşılığı |
|---|---|
| `PAYTR_MERCHANT_ID` | merchant_id |
| `PAYTR_MERCHANT_KEY` | merchant_key |
| `PAYTR_MERCHANT_SALT` | merchant_salt |

⚠️ Bu ekranı **yalnızca ana kullanıcı ve teknik kullanıcı** görebiliyor. Alt
kullanıcıyla giriş yaptıysanız sayfa açılmaz.

Üç değer de gizli. Vercel'de "Sensitive" işaretleyin; ekran görüntüsü almayın,
sohbete yapıştırmayın.

## 2. PayTR paneline kaydedilecek adres

**Destek & Kurulum → Ayarlar → Bildirim URL Ayarları**

Oraya tam olarak:

```
https://cortexplus.app/api/payments/paytr/callback
```

Bu adres olmadan ödeme alınır ama **kredi yüklenmez**: para çeker, kullanıcı
hiçbir şey almaz. Kurulumun en kritik tek alanı bu.

### Kodumuz PayTR'nin beklediğini yapıyor mu — doğrulandı

| PayTR'nin şartı | Bizde |
|---|---|
| Bildirim sayfası **yalnızca `OK`** dönmeli, HTML olmamalı | ✅ `new Response("OK", { status: 200 })` |
| Hash: `merchant_oid + merchant_salt + status + total_amount` | ✅ `verifyPaytrCallbackHash` |
| HMAC-SHA256, anahtar `merchant_key`, sonuç base64 | ✅ aynı |
| Hash tutmazsa işlem sonlandırılmalı | ✅ `INVALID` dönüyor |

## 3. Vercel'e girilecek değişkenler

`cortexplus55` → `burhancortexplus-app` → Settings → Environment Variables.
Ortam: **Production** (isterseniz Preview de).

```
PAYTR_MERCHANT_ID      = <Mağaza No>
PAYTR_MERCHANT_KEY     = <Mağaza Parola>
PAYTR_MERCHANT_SALT    = <Gizli Anahtar>
PAYTR_TEST_MODE        = 1        ← ilk kurulumda 1 bırakın
```

Sonra **Redeploy**. Ortam değişkenleri yalnızca yeni dağıtımda okunuyor;
kaydetmek tek başına yetmiyor.

## ⚠️ Akşamınızı yiyecek tuzak

`PAYTR_TEST_MODE` **varsayılanı `1`** — yani hiç tanımlamasanız bile sistem
test kipinde çalışır.

Test kipinde akış **baştan sona çalışıyor**: form açılıyor, ödeme "başarılı"
dönüyor, geri çağrı geliyor, kredi yükleniyor, bildirim gidiyor. Tek fark:
**gerçek para çekilmiyor.**

Yani kurulumu yapan kişi ödeme almaya başladığını sanır. Hata sessizdir.

Bunu görünür kılmak için yönetim panelinde uyarı var:
**`/admin/sistem`** → "PayTR TEST kipinde. ... gerçek para çekilmiyor."

Canlıya geçmek için Vercel'de:

```
PAYTR_TEST_MODE = 0
```

ve yeniden dağıtım. Panel o zaman "PayTR canlı kipte" diyecek.

`PAYTR_TEST_MODE` dışındaki isteğe bağlı değişkenler (`PAYTR_DEBUG_ON`,
`PAYTR_NO_INSTALLMENT`, `PAYTR_MAX_INSTALLMENT`) tanımsız bırakılabilir;
üretimde güvenli varsayılanlara düşüyorlar.

**Boş değer bırakmayın.** Vercel'de bir değişkeni oluşturup değerini boş
bırakmak varsayılanı atlamaya yol açıyordu; kod artık boş ve yalnızca
boşluktan oluşan değerleri tanımsız sayıyor, ama yine de boş satır
bırakmamak en temizi.

## 4. Test kipinde ne sınanmalı

`/fiyatlandirma` üzerinden. **Kart numarası aramanıza gerek yok:** iFrame
API'de test kartı bilgileri ödeme formunun üstünde otomatik gösteriliyor
(PayTR dokümanı: "iFrame API ödemelerinde test kart bilgileri otomatik
verilir"). Listedeki kart numaraları Direkt API içindir, bizde kullanılmaz.

Sınanacaklar:

1. Buton **"Satın al"** oldu mu? (olmadıysa üç anahtardan biri eksik ya da
   yeniden dağıtım yapılmadı)
2. Ödeme formu açılıyor mu?
3. Ödeme sonrası `/odeme/basarili` sayfasına dönüyor mu?
4. **Kredi bakiyesi arttı mı?** — artmadıysa geri çağrı adresi PayTR
   panelinde eksik ya da yanlış.
5. Aynı ödeme iki kez işlenmiyor mu? (`finalize_paytr_payment` idempotent;
   `credit_ledger`de `pay_<merchant_oid>` anahtarıyla tek satır olmalı)

Beşinci adım önemli: PayTR başarısız yanıt aldığında geri çağrıyı **yeniden
deniyor**. Kod bunu tek işlemde ve idempotent yapıyor, ama kurulumdan sonra
bir kez gözle doğrulamak gerekiyor.

## 5. Canlıya geçtikten sonra

- `PAYTR_TEST_MODE=0` + yeniden dağıtım
- `/admin/sistem` "canlı kipte" diyor mu?
- İlk gerçek ödemeyi **kendi kartınızla, en küçük paketten** yapın ve kredinin
  yüklendiğini görün. İlk gerçek ödemeyi bir öğrenciye denemek zorunda
  bırakmayın.

## Satıcı bilgileri — vergi levhasından

PayTR mağaza incelemesi ve Mesafeli Sözleşmeler Yönetmeliği satıcının
kimliğini sitede ister. Bilgiler **vergi levhasından** girildi
(`src/lib/legal/seller.ts`):

| Alan | Değer |
|---|---|
| Ad / ünvan | Mukadder Önder (şahıs işletmesi) |
| Adres | Emirefendi Mah. Manas Sk. Tekin Apartmanı No: 7 İç Kapı No: 5, Bafra / Samsun |
| Vergi dairesi | Bafra |
| E-posta | cortexplus@cortexplus.app |
| İşe başlama | 21.05.2026 |

**İki alan bilerek yayınlanmıyor** — ürün sahibinin kararı:

- **Vergi kimlik numarası:** şahıs işletmesinde bu numara T.C. kimlik
  numarasıdır. Türkiye'de pek çok yerde kimlik doğrulamada kullanıldığı için
  herkese açık olması gerçek bir gizlilik riski. Vergi dairesi yazılıyor,
  numara yazılmıyor.
- **Telefon:** kişisel numara yayınlanmak istenmedi; iletişim e-posta
  üzerinden.

Her ikisi de `ACCEPTED_OMISSIONS` altında **gerekçesiyle** duruyor ve
`/admin/sistem` sayfasında görünüyor. `missingSellerFields()` bunları eksik
saymıyor — sebebi şu: liste eksik saysa hukuki sayfaların başında sürekli
kırmızı uyarı dururdu ve uyarı anlamını yitirirdi. Her zaman yanan bir lamba
bilgi vermiyor.

Kabul edilen risk: bir denetimde ya da PayTR incelemesinde eksik sayılabilir.
İş için ayrı bir telefon alınırsa tek satırla eklenir.

## Otomatik yenileme (auto renew) — bugün açılamaz

Kısa cevap: **yetki alınmış olsa bile açılamaz.** Sebep izin değil, mimari:
kullandığımız iFrame API'de kart saklama parametresi yok. Ayrıntı, engel
listesi ve açılma sırası: `cortex-plus/docs/delivery/PAYTR-ABONELIK.md`
→ "Yenileme neden otomatik değil".

Mağazada kart saklama yetkisinin gerçekten olup olmadığı artık
`/admin/sistem` sayfasında yazıyor; anahtarlar Vercel'e girildiği an
kendiliğinden cevaplanıyor.

## Bekçi testler

`tests/unit/paytr-mode.test.ts` — test/canlı kipinin doğru okunduğunu,
panelin uyarıyı gösterdiğini, geri çağrının middleware'den muaf kaldığını ve
hash doğrulamasının yerinde olduğunu tutuyor. Bu dosyanın var olma sebebi
yukarıdaki tuzağın sessiz olması.

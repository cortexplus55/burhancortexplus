# Mağaza uygulaması (Android TWA)

**19 Eylül 2026'da hazırlandı.** Kod tarafı bitti; kalanlar Play Console'da
yapılacak ve bu belge onları anlatıyor.

## Neden TWA, neden yerel uygulama değil

TWA = Trusted Web Activity. Mağazadaki uygulama, bu siteyi kendi kabuğunda
açan ince bir paket; ayrı bir Android uygulaması yazılmıyor, ekranlar
kopyalanmıyor, iki kod tabanı oluşmuyor.

**Astra da böyle yapmış.** Android paket kimlikleri `co.astra_ai.app.twa` —
sondaki `twa` bunu açıkça söylüyor. Yani "mağazada uygulaması var" farkı,
bizim için aylık bir mobil geliştirme işi değil.

Kazanç yalnızca mağazada bulunmak da değil:

| | Tarayıcı sekmesi | TWA |
|---|---|---|
| Ana ekran ikonu | kullanıcı elle ekler | kurulumla gelir |
| Bildirim izni | çoğu tarayıcıda zor | uygulama izni olarak sorulur |
| Adres çubuğu | var | **yok** (asset links doğrulanırsa) |
| Mağazada aranabilirlik | yok | var |

## Kodda hazır olanlar

- **PWA bildirimi** (`src/app/manifest.ts`) — `id`, `scope`, `orientation`,
  `categories` ve ayrı bir **maskable** simge girdisi var. Maskeli girdi şart:
  Android simgeyi daire/kare/damla biçiminde kırpıyor ve `any` işaretli bir
  simge kırpıldığında kenarları kesiliyor.
- **Simgeler** — `/icon/192` ve `/icon/512` canlıda üretiliyor
  (`src/app/icon.tsx`).
- **Digital Asset Links** — `/.well-known/assetlinks.json`
  (`src/app/api/assetlinks/route.ts`). Yapılandırma girilene kadar boş dizi
  dönüyor.

## Sizin yapacaklarınız

### 1. Play Console hesabı
Tek seferlik 25 USD. Hesap doğrulaması birkaç gün sürebiliyor; en uzun
bekleme buradan çıkıyor, önce başlatın.

### 2. Paketi üret

```bash
npx @bubblewrap/cli init --manifest https://cortexplus.app/manifest.webmanifest
npx @bubblewrap/cli build
```

Paket adı soracak. Önerilen: **`app.cortexplus.twa`**. Bu ad **sonradan
değişmiyor** — yayınlandıktan sonra değiştirmek yeni bir uygulama demek,
yorumlar ve indirmeler sıfırlanır.

Bubblewrap bir yükleme anahtarı (`android.keystore`) üretiyor. **Onu
kaybederseniz aynı uygulamayı bir daha güncelleyemezsiniz.** Yedekleyin.

### 3. Yükleyin ve iki parmak izini alın

Üretilen `.aab` dosyasını Play Console'a yükleyin. Sonra:

**Play Console → Test and release → Setup → App signing**

Orada **iki** SHA-256 parmak izi görünüyor ve en sık yapılan hata birini
unutmak:

| Parmak izi | Neyi imzalıyor |
|---|---|
| **App signing key certificate** | Mağazadan inen sürümü (Google'ın anahtarı) |
| **Upload key certificate** | Sizin yüklediğiniz dosyayı |

**İkisi de gerekiyor.** Yalnızca yükleme anahtarını girerseniz yerelde test
ettiğiniz sürüm adres çubuğusuz açılır, mağazadan indiren kullanıcı ise
adres çubuğuyla görür — ve bu, indiren herkesin gördüğü hâldir.

### 4. Vercel'e iki değişken girin

`vercel.com/cortexplus55/burhancortexplus-app` → Settings → Environment
Variables:

```
ANDROID_PACKAGE_NAME       app.cortexplus.twa
ANDROID_CERT_FINGERPRINTS  AA:BB:...:FF,11:22:...:99
```

Virgülle ayrılmış, boşluk önemsiz. Girdikten sonra **Redeploy** gerekiyor —
değişkenler derleme anında değil çalışma anında okunuyor ama Vercel yeni
değişkenleri yalnızca yeni dağıtıma veriyor.

### 5. Doğrulayın

```bash
curl -s https://cortexplus.app/.well-known/assetlinks.json
```

Boş dizi `[]` dönüyorsa değişkenler yerine geçmemiş demektir.

Google'ın kendi aracı da var:

```
https://developers.google.com/digital-asset-links/tools/generator
```

Son kontrol: uygulamayı telefona kurun ve açın. **Üstte adres çubuğu
görünmüyorsa** doğrulama geçmiş demektir. Görünüyorsa parmak izlerinden biri
eksik ya da yanlış — 3. adıma dönün.

## Bilinen tuzaklar

- **İlk açılışta adres çubuğu görünebilir.** Android doğrulamayı arka planda
  yapıyor; uygulamayı kapatıp açmak genelde çözüyor. Israr ediyorsa parmak
  izi yanlıştır.
- **`assetlinks.json` yönlendirme ile geliyor.** Nokta ile başlayan klasör
  App Router'da yol olmuyor; `next.config.ts` içindeki `rewrites()` onu
  `/api/assetlinks`'e bağlıyor. Yolu değiştirirseniz doğrulama sessizce
  bozulur.
- **iOS'ta karşılığı yok.** Apple TWA benzeri bir sarmalayıcıyı kabul
  etmiyor; App Store için gerçek bir uygulama kabuğu gerekiyor. Bu belge
  yalnızca Android'i kapsıyor.

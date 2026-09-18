# Açılış kapısı — müşteri almadan önce geçilmesi gereken eşik

18 Eylül 2026'da yazıldı. Bu belge **iş listesi değil, kapı**: aşağıdaki
maddeler doğrulanmadan ilk müşteri alınmaz. Maddelerin nasıl yapılacağı
[SENIN-YAPACAKLARIN.md](./SENIN-YAPACAKLARIN.md) ve
[PAYTR-KURULUM.md](./PAYTR-KURULUM.md)'de; burada yalnızca **kapının şartı ve
o şartın nasıl ölçüldüğü** var. İkisini tekrarlamıyorum, çünkü bir prosedürün
iki kopyası zamanla ayrışır.

Her şartın yanında onu ölçen komut var. Bu bilinçli: bu projede iki kez
"yazıldı ama yayında değil" hatası yaşandı (dört hukuki sayfa dalda kaldı,
sonra göç dosyaları veritabanına uygulanmadı). Göz kararı yetmiyor.

> **Ölçülebilir şartların hepsi tek komutta:**
> ```bash
> cd cortex-plus
> node scripts/acilis-kapisi.mjs        # dışarıdan ölçülenler
> node scripts/acilis-kapisi.mjs --db   # göç dosyalarının kanıt nesneleri de
> ```
> Betik kapıyı **açmıyor**: 1. ve 3. madde (PayTR'nin canlı kipte olduğu ve
> gerçek kartla prova) dışarıdan ölçülemez, betik bunları listeleyip geçiyor.
> Aşağıdaki tek tek komutlar duruyor — biri şüpheli çıktığında elle
> bakabilmek için.

---

## 1. Ödeme gerçekten para çekiyor mu

**Şart:** `/admin/sistem` → PayTR satırı **"canlı kipte"** diyor.

Dışarıdan ölçülemez — bu tek madde panelden bakmayı gerektiriyor. Sebebi
önemli: "Satın al" düğmesi, üç anahtar tanımlı olduğu an test kipinde de
canlı kipte de **birebir aynı** görünür. Test kipinde akış baştan sona
çalışır, abonelik açılır, kredi yüklenir; yalnızca para gelmez.

Yani bu maddeyi atlamak "belki çalışmıyordur" riski değil, **ürünü sessizce
bedava dağıtmak** demek.

## 2. Göç dosyaları canlı veritabanında

**Şart:** `.\scripts\apply-migrations.ps1` bekleyen dosya göstermiyor.

Dışarıdan dolaylı ölçülebilir — satılan plan satırları veritabanından
geliyor, yani fiyat sayfası veritabanının aynası:

```bash
curl -s https://cortexplus.app/fiyatlandirma \
  | python3 -c "import sys,re; t=re.sub(r'<[^>]+>','',sys.stdin.read()); print(' '.join(sorted(set(re.findall(r'₺\s?[0-9.]+', t)))))"
```

| Görünmesi gereken | Hangi göç dosyasını kanıtlar |
|---|---|
| `₺599` `₺1.999` | taban (eski) |
| `₺349` | `20260914130000_weekly_plan` |
| `₺129` `₺329` `₺749` | `20260915090000_credit_packs` |

> **`grep '₺[0-9]'` bu sayfada ÇALIŞMAZ ve sessizce yanlış cevap verir.**
> React `₺` ile sayının arasına bir `<!-- -->` yorumu koyuyor (`₺{value}`
> JSX'inin metin ayırıcısı), yani ham HTML'de `₺<!-- -->129` duruyor. Etiketleri
> ayıklamayan her komut paketleri göremez ve "göç uygulanmamış" der. 18 Eylül
> 2026'da tam olarak bu oldu: kısmi uygulama sanıldı, oysa hepsi yerindeydi.
> Yukarıdaki sürüm etiketleri temizlediği için doğru sonucu veriyor.

> **Kredi paketleri artık vitrinde yalnızca aboneye görünüyor.** Dolayısıyla
> `₺129`/`₺329`/`₺749` herkese açık fiyat sayfasında **görünmemesi normaldir**
> ve göç dosyası hakkında hiçbir şey söylemez. Paket göçünü doğrulamanın tek
> güvenilir yolu `apply-migrations.ps1`; bu sayfa yalnızca kademe planlarının
> aynası.

> **Sıra kuralı — `20260914130000` tek başına uygulanmaz.** O dosya hem
> haftalık plan satırını ekliyor hem `credit_reserve`'ü değiştiriyor ve
> değişen hâli cüzdana `period_kind = 'weekly'` yazıyor. Bunu kabul eden
> CHECK kısıtı ise bir sonraki dosyada: `20260915100000`. Arada kalınırsa
> haftalık abonenin kredi penceresi 7 gün yerine 30 gün damgalanır (ödediğinin
> ~4 katı kota) ve pencere yenilenirken kısıt ihlali hata verir.

## 3. Gerçek kartla bir alım ve bir iade

**Şart:** Kendi kartınla en ucuz paketi aldın, kredinin yüklendiğini gördün,
sonra PayTR panelinden iade ettin ve iadenin işlediğini gördün.

Test kipi bunu kanıtlamaz: farklı uç, farklı 3D akışı, farklı banka cevabı.
Ayrıca `/iptal-iade` müşteriye "haklı durumda karta iade" sözü veriyor ve o
sözü tutacak olan sensin — iadeyi panelde nerede yaptığını **ilk kez gerçek
bir müşteri talebinde** öğrenmek istemezsin.

Bu prova yapılmazsa ilk ödeyen müşteri senin testin olur.

## 4. Kayıt zinciri uçtan uca çalışıyor

**Şart:** Hiç kullanılmamış bir e-postayla kayıt → doğrulama postası geldi →
`/kayit/tamamla` açıldı.

## 5. Ölçüm açık

**Şart:** PostHog anahtarı canlı pakette.

```bash
curl -s https://cortexplus.app/ \
  | grep -oE '/_next/static/chunks/app/layout-[^"]+\.js' | head -1 \
  | xargs -I{} curl -s "https://cortexplus.app{}" \
  | grep -oE 'phc_[A-Za-z0-9_]{15,}' | head -1
```

Bir çıktı verirse ölçüm açık. `analytics.tsx` layout'ta durduğu için anahtar
o parçaya derleniyor.

> Ana sayfanın **HTML'ine bakmak işe yaramaz** — `NEXT_PUBLIC_*` değerleri
> HTML'e değil JS paketine giriyor. Bu belgenin bir önceki kuşağı o hatayı
> yaptı; cevap tesadüfen doğruydu ama yöntem sonsuza kadar "kurulu değil"
> derdi.

Açılış günü ölçüm yoksa kaç kişinin geldiğini, nerede düştüğünü, ödeme
sayfasında mı takıldığını öğrenemezsin — ve o gün geriye dönük kurtarılamaz.

## 6. Kamuya açık sayfaların hepsi ayakta

```bash
curl -s https://cortexplus.app/sitemap.xml | grep -oE '<loc>[^<]+</loc>' \
  | sed 's/<[^>]*>//g' \
  | while read u; do echo "$(curl -s -o /dev/null -w '%{http_code}' "$u" </dev/null)  $u"; done
```

> İçteki `curl`'e `</dev/null` şart. Yoksa `curl` stdin'i tüketir, `while read`
> geri kalan adresleri hiç görmez ve süpürme tek satırda sessizce biter. Bu
> belgenin ilk sürümünde iki komut da bu yüzden boş dönüyordu; komutlar
> yazıldıktan sonra çalıştırılıp düzeltildi.

**18 Eylül 2026'da ölçüldü: 14 URL, hepsi 200.**

---

## Kapının dışında kalanlar — bilinçli

| Konu | Neden kapıda değil |
|---|---|
| Otomatik yenileme | Mimari olarak kapalı, yetki meselesi değil: iFrame API'de kart saklama parametresi yok (`AGENTS.md`). Açılışı bekletmez. |
| SMTP testi, mikrofon denemesi | Bozuk olsalar bile para akışını durdurmuyor; açılıştan sonra da kapatılabilir. |
| Kredi paketleri | Satışa açılması iyi olur ama abonelik tek başına satılabilir durumda. |

---

## 18 Eylül 2026 denetiminde para yolunda bulunanlar

Zincir baştan sona okundu (`create-token` → PayTR → `callback` →
`finalize_paytr_payment`). **Kodda düzeltilecek bir hata çıkmadı.** Sağlam
bulunan ve bilerek böyle olan yerler:

- **Tutar her zaman veritabanından** okunuyor, istemcinin gönderdiği değere
  hiç bakılmıyor.
- **Sözleşme onayı sunucuda** doğrulanıyor (`legalAccepted: z.literal(true)`)
  ve zamanı, IP'si, hangi belgeler olduğu denetim kaydına yazılıyor. Mesafeli
  Sözleşmeler Yönetmeliği m.5 bunu istiyor; yalnızca arayüzde tutmak yetmezdi,
  istek doğrudan da atılabilir.
- **Geri çağrı imzası** `timingSafeEqual` ile doğrulanıyor, tutmazsa `INVALID`.
- **Aynı ödemenin iki kez işlenmesine karşı üç katman** var: işlem içi
  advisory lock, `payload_hash` üzerinde tekillik, ve `payments.status = 'paid'`
  kontrolü.
- **Veritabanı hatasında `RETRY`** dönülüyor; PayTR bildirimi yeniden gönderiyor
  ve fonksiyon işlemsel olduğu için tekrar güvenli.
- **Kredi paketi adlandırma tuzağı** zaten düşünülmüş: paket adında "plus",
  "sigma" ya da "premium" geçerse ödeme abonelik sayılır ve öğrenci 129 TL'ye
  premium olurdu. Paketler bu yüzden "Ek Kredi" adlı ve `is_premium = false`.

Bilerek yapılmayan tek şey **tutar doğrulaması**: geri çağrıdaki tutar
`payments.amount_try` ile karşılaştırılmıyor. Sahtecilik riski değil — hash
merchant key ile imzalı, uydurma tutarlı bildirim zaten `INVALID` dönüyor.
Eşitlik kontrolü **taksitli ödemeyi kırardı**, çünkü PayTR'nin gönderdiği
`total_amount` taksitte `payment_amount`'tan büyük olur. Bir gün eklenecekse
doğru kural `total_amount >= amount_try`.

Güvenlik turunda: hizmet anahtarını standart guard olmadan kullanan tek uç
telefon yükleme (`/api/uploads/phone/[token]`), o da token'la kimlikleniyor ve
süre sonu, brute-force sinyali, hız sınırı ve kota kontrolü taşıyor. Yönetim
sayfalarının 14'ü `requireAdmin` kullanıyor; `robots.txt` `/admin`, `/api` ve
`/auth`'u kapatıyor.

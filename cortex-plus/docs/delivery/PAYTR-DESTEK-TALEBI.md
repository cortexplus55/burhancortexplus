# PayTR'ye sorulacaklar — otomatik yenileme (abonelik)

**Karar 17 Eylül 2026'da park edildi:** Direkt API'ye geçip PCI yükümlülüğünü
almak mı, hatırlatmalı yenilemede kalmak mı — bu, PayTR'nin yazılı cevabından
sonra verilecek. Bu belge o talebi hazır tutuyor.

## Nereden gönderilecek

- **Birincil:** PayTR Mağaza Paneli → **Destek Merkezi** (destek talebi).
  Yazılı cevap panelde kalıyor; "kim ne demişti" tartışması olmuyor.
- **İkincil:** +90 232 335 05 55 (hafta içi ve Cumartesi 09:00–22:00,
  Pazar 09:00–18:00). Telefonda alınan cevap **yazıya dökülmeden karar
  verilmesin** — bu konuda daha önce "yetki alındı sanıyorum" ile gerçek
  durum ayrışmıştı.

⚠️ Talepte **merchant_key ve merchant_salt yazılmaz.** Mağaza numarası
yeterli; PayTR zaten hangi mağaza olduğunu görüyor.

---

## Kopyalanacak metin

> Merhaba,
>
> cortexplus.app mağazamız (Mağaza No: `<yeni mağaza no>`) için abonelik
> ürünleri satıyoruz ve dönem sonunda **otomatik yenileme** yapmak
> istiyoruz. Bugün **iFrame API** ile tek seferlik ödeme alıyoruz.
> Dokümanı okuduk; dört noktada yazılı teyidinizi rica ediyoruz:
>
> 1. **iFrame API ile kart saklama mümkün mü?** `/odeme/api/get-token`
>    parametre listesinde `store_card` ve `utoken` görünmüyor. iFrame API
>    üzerinden kart saklama (ve dolayısıyla tekrarlayan tahsilat) **hiç**
>    desteklenmiyor mu, yoksa dokümanda yazmayan bir yolu var mı?
>
> 2. **Direkt API tek yol mu?** Kayıtlı Kart Tekrarlayan Ödeme servisi için
>    Direkt API entegrasyonu zorunlu mu? Kart verisini kendi sunucumuzdan
>    geçirmeden (PayTR'nin barındırdığı bir form / iFrame üzerinden kart
>    saklayarak) abonelik yenilemenin desteklenen bir yolu var mı?
>
> 3. **Direkt API'de PCI beklentiniz ne?** Direkt API'ye geçersek kart
>    numarası ve CVV bizim sunucumuzdan geçecek. Bu durumda mağazamızdan
>    hangi PCI-DSS belgesini / SAQ seviyesini istiyorsunuz ve sizin
>    tarafınızda ek bir onay süreci var mı?
>
> 4. **Mağazamızda hangi yetkiler tanımlı?** `Non3D` (güvenli olmayan
>    işlem) ve `recurring_payment` yetkileri bu mağazaya **şu an tanımlı
>    mı**? Tanımlı değilse talep süreci ve tipik süresi nedir?
>
> Şu an sözleşme metinlerimizde abonelik için "otomatik olarak yenilenmez"
> yazıyor ve bunu ancak teknik olarak gerçekten yapabildiğimizde
> değiştireceğiz. Bu yüzden yazılı cevabınız bizim için karar belgesi.
>
> Teşekkürler.

---

## Cevap gelince ne değişecek

| Cevap | Sonuç |
|---|---|
| iFrame ile kart saklama **mümkün** | En iyi hâl. PCI'a girmeden otomatik yenileme yazılır: `store_card` akışı + `utoken`/`ctoken` saklama + cron'da tahsilat. |
| Yalnızca **Direkt API** | Karar ürün sahibine döner: PCI yükümlülüğü + ödeme formunu kendimiz barındırmak, otomatik yenilemeye değer mi? |
| Non3D / `recurring_payment` **tanımlı** | "Yetki alındı" doğrulanmış olur; engel yalnızca mimari kalır. `/admin/sistem` yoklaması da bunu teyit etmeli. |
| Non3D **tanımlı değil** | Talep açılır; bu arada hatırlatmalı yenileme devam eder. |

Hangi cevap gelirse gelsin **sıra değişmiyor**: önce teknik yetenek, en son
sözleşme metni ve `AUTO_RENEW_SUPPORTED`. Tersi yapılırsa sözleşme
tutulamayan bir söz verir — abonelik sessizce biter, vaat edilen tahsilat hiç
olmaz.

Bağlam ve engel listesi: `PAYTR-ABONELIK.md` → "Yenileme neden otomatik
değil". Kodda tek kaynak: `src/lib/payments/paytr-capability.ts`.

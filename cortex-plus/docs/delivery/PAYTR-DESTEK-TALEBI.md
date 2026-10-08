# PayTR'ye sorulacaklar — otomatik yenileme (abonelik)

**Karar 17 Eylül 2026'da park edildi:** Direkt API'ye geçip PCI yükümlülüğünü
almak mı, hatırlatmalı yenilemede kalmak mı — bu, PayTR'nin yazılı cevabından
sonra verilecek. Bu belge o talebi hazır tutuyor.

**Gönderildi: 3 Ekim 2026.** Mağaza Paneli → Destek & Kurulum → Destek;
Ana Başlık "Teknik Destek / Yazılım Hataları", Alt Başlık "Entegrasyon"
("Direkt API Talebi" bilerek seçilmedi — geçiş başvurusu gibi okunurdu).
Mağaza No 747272. Kutu 2000 karakterle sınırlı; aşağıdaki metin dört soru
aynen kalarak giriş ve kapanışta kısaltıldı (1299 karakter). Cevap panelde
"Destek Talepleriniz" altında ve hesabın kayıtlı e-postasına gelir — o adres
şu an kişisel bir Gmail; operasyon adresine (`cortexplus@cortexplus.app`)
çekilmesi ürün sahibinin kararı.

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

---

## PayTR'nin cevabı (5 Ekim 2026, panelde "Destek Talepleriniz")

Özet, kendi sözlerimizle:

| Soru | Cevap |
|---|---|
| 1. iFrame ile kart saklama | Yok. Abonelik yapısı **Direkt API + Non3D yetkisiyle** sunuluyor. |
| 2. Direkt API tek yol mu | Evet. Ayrıca hazır "her ay otomatik çek" sistemi **yok**: biz istek gönderdiğimizde kayıtlı karttan çekim yapılır, zamanlayıcıyı biz yazarız. Ödeme sayfası, taksit oranları ve iFrame'in verdiği her şey de bizim tarafta yazılır. |
| 3. PCI beklentisi | Cevaplanmadı. |
| 4. Tanımlı yetkiler | Açıkça söylenmedi; Direkt API + Non3D'ye geçiş ilgili birimlerin **onayına** bağlı, talep incelenip olumlu ya da olumsuz dönülüyor. |

Ek uyarı: 3D'siz işlemde kartın izinsiz kullanıldığı itirazında **ispat yükü
bizde**; riskler firmaya ait. Bağlantılar: `dev.paytr.com/direkt-api/kart-saklama-api/kayitli-karttan-odeme`,
`.../kayitli-kart-tekrarlayan-odeme`.

## Ürün sahibinin kararı ve ikinci talep (8 Ekim 2026)

Karar: **Direkt API'ye başvuruluyor.** Talep aynı gün gönderildi (Teknik Destek
/ Yazılım Hataları → **Direkt API Talebi**). İçeriği:

- Mağaza 747272 için Direkt API + Non3D yetkisi isteniyor.
- Plan: **ilk ödeme 3D Secure ile** alınıp kart o sırada saklanır; yalnız
  dönem sonu yenilemeleri "Kayıtlı Kart Tekrarlayan Ödeme" ile yapılır.
  Yenileme isteğini bizim zamanlayıcımız gönderir.
- 3D'siz işlemin riskleri (itirazda ispat yükü) yazılı olarak kabul edildi.
- İki soru yeniden soruldu: hangi PCI-DSS belgesi / SAQ seviyesi isteniyor;
  ilk ödeme 3D, yenilemeler Non3D olabilir mi.

**Onay gelmeden hiçbir şey değişmiyor:** iFrame ödemesi, hatırlatmalı elle
yenileme, sözleşmedeki "otomatik olarak yenilenmez" ve `AUTO_RENEW_SUPPORTED =
false` aynen kalıyor. Onay gelirse sıra: PCI belgesi → Direkt API ödeme sayfası
ve kart saklama → yenileme zamanlayıcısı (Hobby cron kotasına dikkat: mevcut
günlük cron'un içine) → en son sözleşme metni ve `AUTO_RENEW_SUPPORTED`.

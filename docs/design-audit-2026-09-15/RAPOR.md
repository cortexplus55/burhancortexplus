# Tasarım denetimi — misafir katmanı (15 Eylül 2026)

## Ne ölçüldü, ne ölçülemedi

**Ölçülen:** her iki ürünün de **misafir** (girişsiz) yüzeyleri. Gerçek
tarayıcıyla, 1440px ve 390px genişlikte, tam sayfa kareler alınarak.

**Ölçülemeyen:** referans ürünün uygulama içi ekranları. Girişsiz açıldığında
SPA boş render ediyor ve elimizde o ürüne ait hesap yok. Kendi giriş gerektiren
sayfalarımız da test hesabı olmadığı için karşılaştırmaya girmedi.

Yani aşağıdaki hiçbir satır "muhtemelen böyledir" değil; hepsi ölçüm. Ama
kapsam **yalnızca iniş/pazarlama katmanı**.

## İki yanlış alarm — düzeltildi

İlk çekimde `/fiyatlandirma` ve `/kayit` bomboş siyah çıktı. Üçer kez tekrar
ölçüldü: **ikisi de sorunsuz açılıyor**. İlk kare, proxy CA'sı tarayıcıya yeni
tanıtıldığı için soğuk başlamış ve sayfa oturmadan alınmış.

Mobil tam-sayfa karesinde de sayfanın yarısı boş görünüyordu. Gerçek kullanıcı
gibi kaydırılınca içerik yerindeydi: tam sayfa çekimi kaydırmayla tetiklenen
beliriş animasyonlarını çalıştırmıyor.

Bu iki satır burada duruyor çünkü ikisi de "yayında sayfa çökmüş" diye rapor
edilebilirdi ve ikisi de yanlış olurdu.

## Ölçülen fark

| | Cortex (önce) | Referans |
|---|---|---|
| Ürün görseli | **0 görsel, 0 büyük SVG** | **30 görsel + 4 SVG** |
| Ana sayfa boyu (1440px) | 5.174px | 20.047px |
| Metin bloğu | 56 | 126 |
| Bölüm / başlık | 9 / 34 | 9 / 33 |
| 120px üstü boşluk | %20 | %35 |

**Boşluk bizim sorunumuz değildi** — referansta daha fazla. Yapı da benziyordu:
aynı sayıda bölüm, neredeyse aynı sayıda başlık. Fark tek bir şeydeydi: onların
boşluklarında ürün ekranları var, bizimkiler gerçekten boştu. Tek medyamız
hero'daki stok video, yani ürünle ilgisi olmayan bir görüntüydü.

## Yapılanlar

1. **Ürün kareleri eklendi.** Canlı `/ornek` akışından, ürünün kendi
   arayüzünden dört kare: konu haritası, podcast, test, sözlü. Çizim ya da
   temsilî görsel değil — öğrencinin kayıttan sonra göreceği ekranın aynısı.
   WebP, 16–45kb. Ana sayfa 5.174 → 6.431px, görsel sayısı 0 → 4.

   Kareler koyu zeminde koyu duruyor; çerçevesiz bırakılınca sayfaya karışıp
   kayboluyorlardı. Her karenin kendi kenarlığı ve yükseltisi var.

2. **Fiyat kartları yan yana geldi.** Kap `max-w-md` (448px) idi: 1440px'lik
   ekranda iki kart dar bir sütunda alt alta, iki yan bomboş. Kademeler ancak
   yan yana kıyaslanabiliyor. Başlık, dönem düğmesi ve alt notlar dar kaldı —
   onlar okunacak metin, kıyaslanacak kart değil. Tek kart kalırsa ızgara tek
   sütuna düşüyor, yoksa sağ yarı boş kalıyordu.

3. **Başıboş kapatma düğmesi kaldırıldı.** `/fiyatlandirma`'da havada duran
   bir × vardı: üstte menü, altta footer, ortada kapatılacak pencere yok.
   Modalden sızmış gibi duruyordu ve bastığında öğrenciyi habersizce ana
   sayfaya atıyordu. Artık yalnızca dönülecek belirli bir yer varken
   (`returnTo` / `closeHref`) çiziliyor.

4. **Emoji ikonlar gitti.** On beş ders kartının dördü bayrak emojisiydi
   (🇬🇧 🇩🇪 🇪🇸 🇫🇷). Bayrak emojileri Windows'ta hiç çizilmiyor — yerine iki
   harfli bir kutu çıkıyor. Diğerleri de her işletim sisteminde başka üslupla
   geliyordu. Lucide setine geçildi; her kartın kendi vurgu rengi var.

   Dört dilin ikonu bilerek aynı: hepsi aynı türde iş. Ayrımı ders adı ve renk
   yapıyor — uydurma bir ayrım, ayrımsızlıktan kötüdür.

## Dokunulmayanlar

- **Fiyat butonlarındaki "Yakında".** PayTR anahtarları girilene kadar böyle
  kalıyor; ürün sahibi bunu kendisi halledecek.
- **Haftalık paketin fiyat sayfasında görünmemesi.** Göç dosyası
  (`20260914130000`) henüz uygulanmadı.
- **Ana sayfadaki tek plan kartı.** İlk bakışta "yalnız kalmış" görünüyordu;
  koda bakınca sekmeli bir seçici olduğu ve ortalandığı görüldü. Bilinçli
  tasarım, sorun değil.

## Kanıt

`kanit/` altında üç kare: önceki ana sayfamız, sonraki ana sayfamız ve
referansın ana sayfası. Diğer 19 kare ve ölçüm betikleri repoya alınmadı —
11MB kalıcı yük olurdu; sayılar bu belgede duruyor.

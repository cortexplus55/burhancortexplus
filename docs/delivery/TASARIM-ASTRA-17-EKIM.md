# Astra ile tasarım farkı — 17 Ekim 2026

İki site aynı ekran genişliğinde (1536 px) yan yana açıldı; yazı tipi, boyut, ağırlık, harf
aralığı, renk, köşe ve genişlik sayfa kodundan ölçüldü. Astra'da kredi harcatan hiçbir şeye
basılmadı (ders ekranı bu yüzden açılmadı; sonucu kayıtlı bir test incelendi).

## Ürün sahibinin kararları

| Konu | Karar |
|---|---|
| Yazı tipleri | **Astra'nın birebir aynısı**: Figtree (metin), JetBrains Mono (küçük etiketler), Jersey 10 (karşılama), Caveat (el yazısı). Dördü de Google Fonts, serbest lisans. |
| Renk | **Astra paleti birebir**: zemin #0d0d0d, yüzey #141414 / #1f1f1f, çerçeve #242424 / #303030, eylem mavisi #4353f3; sarı (#fdb300) yalnız marka ve "hedef puan" gibi özel anlarda |
| Hazırlık sayfası | Geniş ekranda iki sütun + üç boyutlu disk düğümler |
| Görseller | Bize özgü üç boyutlu simge seti (~20 görsel, yapay zekâyla bir kez üretilir) |

## Ölçülen farklar

| Alan | Astra | Cortex (17 Ekim öncesi) |
|---|---|---|
| Yazı tipleri | Figtree + JetBrains Mono + Jersey 10 + Caveat | Yalnız Figtree; eşaralıklı etiket sistemin yazı tipine (Consolas) düşüyor; "hedef puan" Segoe Print (yalnız Windows); uygulama içinde 38 yerde DM Serif |
| Başlık | 600 ağırlık, -0.02em (40 px'te -0.8 px) | 700 ağırlık, normal aralık |
| Yazı ölçeği | display 56/700, heading-xl 40/600, heading-s 28, title-l 20, title-m 18, body 14, label 15/13/11 (500, +0.01em), button 16/13 (600), mono 15/13/11/9 (500) | Tutarsız (13.6, 14.4, 16.8 gibi ara değerler) |
| Renk | Nötr gri + tek mavi; seçili menü gri dolgu | Altın sarısı seçili menüde, seçim çerçevelerinde, profilde |
| Kart | İki tonlu (koyu üst #0d0d0d, açık alt şerit #1f1f1f), çerçeve #2c2c30, köşe 20 / kutular 24 | Tek ton #1a1a1a, şeffaf beyaz çerçeve, köşe 17.6–20 |
| Genişlik | Sınavlar listesi 768 px, kart 360 px | 896 px, kart 422 px |
| Hazırlık sayfası | Sol sabit bilgi kartı (etiket, 40 px başlık, hazırlık %, kart içinde sekmeler, Ders/Düello/Paylaş) + sağda yol | Tek sütun (telefon düzeni) |
| Yol düğümleri | Aynı biçimde üç boyutlu parlak diskler; sıradakinin üstünde ışıklı bayrak | Düz, karışık biçimler (altıgen, daire, kare) |
| Görseller | Özel 3B çizimler (roket, altın madalya, kategori simgeleri, profil logosu) | Düz çizgi simgeler |
| Test sonucu | 128 px "3/7", üstten ışıklı zemin, doğruluk + süre, "Dersi tekrarla", geri bildirim çipleri | — ("Sonuçları gör" hatası, aşağıda) |
| Ana sayfa | Ders seçici mesaj kutusuna bitişik sekme; tek yüzey kutu | Ayrı çip; kutu içinde ikinci çerçeve |
| 404 | Eğlenceli "4×0≠4" çizimi | Düz kart |

**İşlevsel hata:** bitmiş testte "Sonuçları gör" sonucu göstermiyor, etkinliği baştan kuruyor
("Bu konuya ne kadar aşinasın?"). Astra önceki sonucu açıyor.

## Plan (her adım ayrı değişiklik paketi; yayından sonra yan yana ekran görüntüsü)

1. **Temel** — dört yazı tipi, Astra renk skalası, yazı ölçeği ve köşe değerleri `tokens.css`'te;
   etiketler JetBrains Mono, "hedef puan" Caveat, karşılama Jersey 10, kabukta tırnaklı başlık yok.
2. **Altın sarısından çıkış** — seçili menü, seçim çerçeveleri ve düğmeler nötr/mavi.
3. **Kabuk** — üst menüde simgeler ve nötr seçili sekme, sade sağ üst köşe, mesaj kutusuna bitişik ders sekmesi.
4. **Liste ve kartlar** — 768 px genişlik, iki tonlu kartlar, 24 px kutular, çerçeveler, başlık ağırlıkları.
5. **Hazırlık sayfası** — geniş ekranda iki sütun, 3B disk düğümler, ışıklı bayrak.
6. **Sonuç ekranı** — büyük skor, ışıklı zemin, doğruluk ve süre, "Dersi tekrarla"; "Sonuçları gör" hatası.
7. **3B simge seti** — ~20 görsel: sınav kutuları, araçlar, davet madalyası, yıldız, seri, boş durumlar, 404.
8. **Ayrıntılar** — 404 sayfası, "Kaldığın yer açılıyor" yükleme ekranı, "Daha fazla" penceresi, profil.

Astra'nın yazı ölçeği ve renk değerleri `tokens.css`'te (`--t-*`, `--c-gray-*`, `.dark`). Bekçi:
`tests/unit/astra-design-system.test.ts`.

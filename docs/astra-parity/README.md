# Astra parite dosyaları — ARŞİV

**Kapanış tarihi:** 2026-09-04
**Durum:** tarihsel kayıt. Bu klasörde yapılacak iş listesi yok.

---

## Karar

**Astra paritesi artık kuzey yıldızı değil.**

Astra bir referans olarak kalıyor: rakibin bir sorunu nasıl çözdüğünü görmek
faydalı. Ama "Astra'da var, bizde yok" cümlesi tek başına yapılacak iş gerekçesi
sayılmıyor. Bir özellik ancak Cortex Plus öğrencisine bir şey öğrettiği için
yazılıyor — başka bir üründe bulunduğu için değil.

Kararın somut sonucu `13a175e`: paritenin en görünür maddelerinden biri olan
"Uygulamalar" bölümü, yazıldıktan bir gün sonra bilerek geri alındı. 34
simülasyon, 5 mini oyun, günün bulmacaları, liderlik tablosu ve AI uygulama
üreteci üründen çıktı; yerine 12 araçlık `/araclar` merkezi geldi. Mağaza
vitrini (puan, oynanma, öne çıkanlar) bir eğitim ürününde ölçtüğü şeyi
öğrenmeye çeviremiyordu.

## Bu dosyalar nasıl okunur

| Sütun | Güvenilirlik |
|---|---|
| **Astra'da gözlemlenen** | Geçerli. Tarayıcıda görülüp not edilmiş, kanıtı `evidence/` altında. |
| **"Bizde yok" / "bizde var"** | **Bayat.** Yazıldığı saatteki koda bakıyor; o günden beri hem eklendi hem silindi. |
| **"Kapatıldı ✓" tabloları** | **Bayat.** Kapatılan maddelerin bir kısmı sonradan kaldırıldı. |

Bizim tarafımıza dair her satır, kullanılmadan önce koddan doğrulanmalı.

## Dosyalar

| Dosya | Ne zaman, neye karşı yazıldı |
|---|---|
| `DELTA.md` | En eski. **Yanlış kod tabanına** karşı yazıldı (`burhan55600-pixel/cortex-plus`, GitHub'dan silinmiş repo). Bizim tarafla ilgili iddiaları büyük ölçüde hatalı. |
| `DELTA-LIVE.md` | 2026-09-03 öğlen, doğru repoya karşı. Aynı günün akşamı büyük kısmı geçersiz kaldı. |
| `DELTA-2026-09-03-AKSAM.md` | En yeni analiz. Başında 2026-09-04 düzeltme notu var. |
| `TIER_MATRIX.md` | Astra'nın ücretsiz/premium katman farkları. Astra tarafı geçerli. |
| `LOCAL_INVENTORY.eski-repo.md` | Emekli repo envanteri. Yalnızca arkeoloji. |
| `evidence/` | Ham gözlem. Astra ekranlarının o günkü hâli — en uzun ömürlü kısım. |

## Ne hâlâ yapılacak iş?

Parite dosyaları değil. Açık işler `docs/delivery/LAUNCH-SEQUENCE.md` ve
`docs/delivery/TESLIM.md` içinde; ürün yönü `docs/product/` altında.

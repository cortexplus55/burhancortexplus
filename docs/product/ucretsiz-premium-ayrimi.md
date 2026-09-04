# Ücretsiz / Plus ayrımı — Astra karşılaştırması ve plan

**Tarih:** 2026-09-04
**Durum:** Astra'nın her iki katmanı da gözlemlendi. Uygulama kararı bekliyor.

---

## 1. Astra'da ücretsiz ile Plus arasındaki fark

Aynı hesapla önce Plus, sonra ücretsiz oturum açılarak ekran ekran
karşılaştırıldı. Tahmin yok, hepsi gözlem.

### Ana ekran

| | Ücretsiz | Plus |
|---|---|---|
| Üst çubuk | **"Satın al ✦"** düğmesi | Düğme yok |
| Üst bant | **Canlı geri sayımlı kampanya**: "FIRSAT YAKINDA BİTİYOR · Yıllık planı seç ve %67 tasarruf et" + saat/dk/sn sayacı | Yok |
| Sohbet kutusu | Dar; **yanında kalıcı yükseltme kartı** ("Astra AI Plus'a Yükselt" · "Daha Hızlı Öğren") | Ortada ve geniş, kart yok |

### Profil

| | Ücretsiz | Plus |
|---|---|---|
| İsim | Düz | Yanında **altın ✦ rozeti** |
| Plan satırı | **"Temel · Ücretsiz plan"** + "Daha Hızlı Öğren" düğmesi | Satır yok |

### Kullanım limitleri

| | Ücretsiz | Plus |
|---|---|---|
| Plan adı | **"Astra AI Free"** | **"Astra AI Plus – Aylık limit"** |
| Sıfırlanma | **Her gün 03:00** ("5 Eyl 2026 03:00 tarihinde sıfırlanır") | **Ayda bir** ("24 Eyl 2026 21:20") |
| Gösterim | Yüzde ("%0 kullanıldı") | Yüzde ("%27 kullanıldı") |
| Ek kota alma | **Yok** | **"Ek paket satın al"** |
| Davet çarpanı | Var — 3 kat / 400 kat, 0/3 davet | Aynı |

### Satın alma ekranı — Plus'ın vaat listesi

Başlığı önemli: **"Ücretsiz plandaki her şey ve:"**

1. **1300 kat daha fazla günlük AI kullanımı**
2. 2 kat daha hızlı yanıtlar
3. Daha yüksek yükleme limitleri
4. 1,4 kat daha akıllı yapay zeka modeli
5. Testler, kartlar ve podcast'ler
6. Deneme ve sözlü sınavlar
7. Ders kitabından herhangi bir soruyu fotoğrafla
8. Sınıflarda arkadaşlarınla çalış
9. Notlarını yükselt ya da tam para iadesi al
10. Dezavantajlı öğrencilere ücretsiz erişim desteği
11. Odaklanma Modu

Sigma (üst paket): "Plus'taki her şey ve: 8 kat fazla kullanım · öncelikli
hız · en akıllı model · yeni özelliklere erken erişim".

Ayrıca: **"Ebeveynden ödeme iste"** düğmesi ve **"Astra AI neden ücretsiz
değil?"** bağlantısı.

---

## 2. Çıkan asıl sonuç

**Astra özellik kilitlemiyor, kota kısıyor.**

Listedeki "testler, kartlar, podcast, deneme, sözlü sınav, fotoğrafla soru"
maddeleri özellik kilidi gibi duruyor ama başlık "ücretsiz plandaki her şey
ve" diyor ve manşet madde **"1300 kat daha fazla günlük kullanım"**. Yani
ücretsiz kullanıcı her şeye dokunabiliyor; sadece günlük hakkı çok küçük ve
her gece 03:00'te yenileniyor.

Bu bizim için iyi haber: modelimiz zaten kredi tabanlı, yani aynı mantık.
Kilit yazmak yerine **kotayı doğru ayarlamak** yetiyor.

---

## 3. Bizde bugün ne var

### Plus'ın gerçekten açtığı şeyler

| Ne | Nerede |
|---|---|
| Sunucuda üretilen ses (podcast, ders) | `api/learning/speech`, `api/learning/podcast/audio` |
| Ses tanıma (sözlü sınav) | `api/learning/oral/transcribe` |
| Sohbette "gelişmiş model" seçeneği | `lib/ai/model-router.ts` |
| Deneme üretiminde otomatik gelişmiş model | Aynı dosya |
| Daha yüksek kota | `credit_wallets.period_allowance` |

Premium kontrolü yapan toplam **üç** API rotası var.

### Düzeltilmesi gereken çelişki

`PLUS_BENEFITS` listesi (`components/parity/astra-subscription-cards.tsx`)
"deneme sınavı, quiz, flashcard, doküman kaynaklı yanıtlar" Plus'a ait diyor;
dördü de ücretsizde açık. Astra bunu "ücretsiz plandaki her şey **ve**" diye
çözmüş — biz de aynısını yapabiliriz, ama o zaman listenin geri kalanı gerçek
olmalı.

### Maliyet notu

Fotoğraftan çözüm ücretsiz kullanıcıda da **her zaman gelişmiş modele**
gidiyor (`model-router.ts`, `hasImage` dalı) ve hiçbir ek sınırı yok. En
pahalı işlemimiz bu.

---

## 4. Uygulanacaklar

### A. Kota modeli (Astra'nın mantığı)

- Ücretsiz: **günlük** kota, her gece sabit saatte sıfırlanır
- Plus: **aylık** kota + "Ek paket satın al"
- İkisinde de yüzde göstergesi ve sıfırlanma tarihi — **bizde zaten var**
- Eksik olan: ücretsizde günlük / Plus'ta aylık ayrımı ve ek paket satışı

### B. Ekran farkları

| Ekran | Yapılacak |
|---|---|
| Üst çubuk | Ücretsizde "Satın al" düğmesi — **var**, kalsın |
| Sohbet kutusu yanı | Ücretsizde kalıcı yükseltme kartı — **yok**, eklenecek |
| Profil | "Temel · Ücretsiz plan" satırı + yükseltme düğmesi — **yok**, eklenecek |
| Profil | Plus'ta isim yanında altın rozet — **var** (`ap-sor-logo-badge`), profile de taşınacak |
| Limitler | Ücretsizde günlük, Plus'ta aylık + ek paket — kısmen var |

### C. Yazılacak metin

`PLUS_BENEFITS` "Ücretsiz plandaki her şey ve:" başlığıyla yeniden yazılacak
ve yalnızca gerçekten Plus'a ait olanlar sayılacak: daha yüksek günlük
kullanım, gelişmiş model, sunucu sesiyle podcast ve sözlü sınav, daha yüksek
yükleme limiti.

### D. Kasıtlı olarak almadıklarımız

- **Geri sayımlı kampanya bandı.** Sahte aciliyet; sayaç bitince yenileniyor.
  Öğrenciye baskı kurmak istemiyoruz.
- **"1300 kat" gibi sayılar.** Ölçülebilir değil.
- **Odaklanma Modu, para iadesi garantisi.** Ürün kararı, ayrı iş.

> "Ebeveynden ödeme iste" fikri iyi ve bizim kitleye uygun — ayrı değerlendir.

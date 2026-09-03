# Astra AI — Gerçek katman modeli (gözlemlenmiş, 2026-09-03)

İki hesapla doğrulandı: **Temel (Free)** ve **Astra AI Plus**.

---

## EN ÖNEMLİ BULGU: Astra **özellik kilitlemiyor, hacim kilitliyor**

Ücretsiz hesapla test edildi:

| Özellik | Free'de erişilebilir mi? |
|---|---|
| Sınav hazırlığı oluşturma | ✅ Evet (2 adet mevcuttu) |
| Okul akışı — 70 paylaşılmış hazırlık, 317 üye | ✅ Evet, tam açık |
| Çalışma yolu + düğüm haritası | ✅ Evet |
| **Podcast üretimi (4:36 dk, iki sunuculu)** | ✅ **Evet — üretildi** |
| 11 içerik formatı seçicisi | ✅ Hepsi görünür, kilit ikonu yok |
| Sohbet araçları (Çiz, Matematik klavyesi, Çözücü, Ruh hali) | ✅ Hepsi açık |
| Uygulama mağazası + günlük bulmacalar | ✅ Evet |
| Referans programı (3 kat / 400 kat) | ✅ Evet |
| **"+ Uygulama oluştur"** | ❌ **Yok** (yalnızca Plus'ta) |
| **"Ek paket satın al"** | ❌ Yok (yalnızca Plus'ta) |

### Ölçülen kota
**Tek bir podcast üretimi: %0 → %100.**
Yani ücretsiz günlük kota ≈ **günde bir anlamlı AI üretimi**.

| | Free | Plus |
|---|---|---|
| Etiket | "Astra AI Free" | "Astra AI Plus – **Aylık limit**" |
| Sıfırlama | **Günlük** — "3 Eyl 2026 **03:00**" | **Aylık** — "24 Eyl 2026 21:20" |
| Ölçüm | Yüzde | Yüzde |
| Top-up | Yok | "Ek paket satın al" |
| Pazarlama iddiası | — | "1300 kat daha fazla günlük AI kullanımı" |

### Stratejik okuma
Kullanıcı ücretsiz olarak **tam kaliteli ürünü** bir kez tadıyor — kırpılmış
sürüm değil, gerçeğinin aynısı. Sonra ya 24 saat bekliyor ya ödüyor.
Bu, özellik kilitlemekten çok daha güçlü bir dönüşüm modeli: reddedilen şey
"özellik" değil, "devam etmek".

Pazarlama sayfası "Testler, kartlar ve podcast'ler"i Plus özelliği gibi
gösteriyor — pratikte podcast free'de de üretilebiliyor, sadece günlük kotanın
tamamını yiyor. **İddia = hacim, kilit değil.**

---

## Katmanlar

| | Temel (Free) | Plus | Sigma |
|---|---|---|---|
| Fiyat | ₺0 | ₺770/ay · yıllık ₺321/ay (%58) | ₺2.567/ay |
| Kota | Günlük, ~1 üretim | Aylık, "1300 kat" | "Plus'a göre 8 kat" · rozet "10400X" |
| Model | Standart | "1,4 kat daha akıllı" | "En akıllı" |
| Hız | Standart | "2 kat daha hızlı yanıtlar" | "Yoğun zamanlarda öncelikli" |
| Uygulama oluşturma | ❌ | ✅ | ✅ |
| Ek paket | ❌ | ✅ | ✅ |
| Erken erişim | ❌ | ❌ | ✅ "Yeni özelliklere erken erişim" |
| Garanti | ❌ | "Notlarını yükselt ya da tam para iadesi" | Aynı |

---

## 11 içerik formatı (ders tipi seçici: "Sonraki ders")

**Öğren:** Akıllı Metin (önerilen) · **Podcast** · **Video** · Hafıza kartları ·
Bilgi boşlukları
**Pratik Yap:** Alıştırma · Test · Doğru/Yanlış · Tekrar
**Sınav:** Yazılı Deneme Sınavı ("Soruları cevapla ve not al") ·
**Sözlü Deneme Sınavı** ("Yapay zeka ile gerçek zamanlı konuş ve not al")

### Podcast alt formatları (5 adet)
| Format | Süre | Açıklama |
|---|---|---|
| 💬 Diyalog (önerilen) | ~5 dk | "İki sunucu konuyu birlikte keşfediyor" |
| ⚡️ Özet | ~1 dk | "Sınav öncesi hızlı özet" |
| ❓ Soru-Cevap | ~7 dk | "Bir sunucu soruyor, diğeri cevaplıyor" |
| 🗣️ Basit anlatım | ~5 dk | "Tek sunucu, daha basit dil, daha yavaş tempo" |
| 📚 Derinlemesine İnceleme | ~10 dk | "Örnekler ve bağlamla birlikte tam konu" |

### Üretilen podcast kalitesi (gözlemlendi)
4:36 dk Türkçe, iki ayrı sunucu sesi, doğal diyalog (gülüşme dahil),
pedagojik olarak sağlam (birim çember → pergel, lazer ışını, dönme dolabı
benzetmeleri). Oynatıcı: küre animasyonu, ±15 sn atlama,
**kelime kelime senkronlu karaoke transkript**, "Tam transkript" butonu.

---

## Sıralı konu kilidi (paywall değil, ilerleme kilidi)
Konu seçicide 9 konudan yalnızca 1'i açık ("1. seviye", %7 ilerleme halkası),
2–9 **asma kilitli**. Duolingo tarzı zorunlu sıra.

---

## AI sohbet yanıt yapısı
Düz markdown değil — yapılandırılmış bileşenler:
- **LaTeX** ile render edilen formüller
- **📖 tanım kartı** (çerçeveli, vurgulu terim kutusu)
- **"Günlük Hayattan Örnek"** bloğu (hız göstergesi benzetmesi)
- Sonda soru + **öneri çipleri**: "Örnek çözelim" · "Anlamadım tekrar anlat" ·
  "📈 Hız formülüyle nasıl buluruz?"

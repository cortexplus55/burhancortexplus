# Astra — Öğrenme uygulamaları & kota modeli (premium hesap, 2026-09-03)

## "Uygulamalar" sekmesi = tam bir uygulama mağazası
Üst: **Ara** + **"+ Uygulama oluştur"** (kullanıcı kendi uygulamasını üretiyor)

### Bölümler
1. **En çok oynananlar** — numaralı top-10, oynanma sayılarıyla
   1. Denklemi Tahmin Et (44k) · 2. Hanoi Kulesi (27k) · 3. Hücre Oluştur (26k)
   4. Atom Oluştur (18k) · 5. İnsan Vücudu Atlası (17k) · 6. Mayın Tarlası (16k)
   7. Sudoku 6×6 (14k) · 8. Güneş Sistemi (13k) · 9. Nonogram (13k)
   10. Mantık Kapıları (12k)
2. **Laboratuvardaki yeniler** — kart: ders rozeti · YENİ rozeti ·
   **⭐ puan (4.3–5.0)** · **👀 oynanma** · başlık · açıklama
   Örnekler: Borular, Hashi, Özyineleme Gezgini, Sözsüz ispatlar,
   Faiz Laboratuvarı, Dönel Cisimler, Atlas, Vektörler, Renk Modelleri,
   Fonksiyon Analizi
3. **Öne çıkanlar** — tip rozetleri: `TOOL`, `SİMÜLASYON`
4. **Bugünün bulmacaları** — "0/8 çözüldü" · her bulmaca için
   **Liderlik Tablosu** + oyuncu süreleri (1:57.8, 41.9s, 4.5s…) ·
   çözülmemişler için "İlk çözen sen ol — süren burada görünecek."
5. **En yüksek puanlılar**

**Bizde:** `lab-apps.ts` ile 18 statik simülasyon, `/uygulamalar/lab/[id]`.
Puan yok, oynanma sayısı yok, liderlik tablosu yok, günlük bulmaca yok,
kategori/rozet yok, kullanıcı uygulaması oluşturma yok.

---

## Profil sayfası
- Avatar · isim + **altın ✨ Plus rozeti** (tier göstergesi)
- "Giresun Ünv.tıp Fakültesi · 16 · TR" (okul · yaş · ülke)
- **Streak widget:** "0 Mevcut streak | 1 En uzun streak" +
  haftalık alev ikonları (Pzt–Paz), bugün vurgulu
- Kartlar: **Aktivitelerim** ("Öğrenme ilerlemeni takip et") ·
  **Takvimim** ("Yaklaşan etkinlikleri gör", rozet: 3)
- Menü: Ayarlar · **Kullanım** · **Abonelikler** · Geçmiş konuşmalar ·
  Yardım ve destek · **Uygulamayı indir** · Astra AI nedir? · Çıkış yap

---

## "Kullanım limitleri" — GERÇEK KOTA MODELİ

### Referans programı (viral döngü)
Rozet: **"0/3 davet kullanıldı"** (max 3 davet)
> "Arkadaşlarını davet et, kullanım hakkını katla —
> Yeni bir arkadaşın kaydolduğunda **ikiniz de 3 kat günlük kullanım hakkı**
> kazanırsınız. O da **abone olursa seninki 400 kata** çıkar."

Butonlar: "Bağlantıyı kopyala" · "Nasıl çalışır?"

### Abonelik limiti
- **"Astra AI Plus – Aylık limit"**
- "24 Eyl 2026 21:20 tarihinde sıfırlanır" (tam tarih-saat)
- İlerleme çubuğu: **"%27 kullanıldı"** — **yüzde**, kredi adedi değil
- "Daha fazlasına mı ihtiyacın var? Kullanımını artır" →
  **"Ek paket satın al"** (abonelik üstü top-up ürünü)

**Bizde:** `credit_wallets` + `credit_ledger` + 10 action_code ile
**mutlak kredi** modeli. Yüzde göstergesi yok, sıfırlama tarihi yok,
referans programı yok, top-up paketi yok.

# Ücretsiz / Plus ayrımı — durum ve karar bekleyenler

**Tarih:** 2026-09-04
**Durum:** Karar bekliyor. Astra'nın ücretsiz katmanı görülemedi.

---

## 1. Bugün gerçekte ne oluyor

Kodda ölçüldü, tahmin değil.

### Plus'ın gerçekten açtığı şeyler

| Ne | Nerede |
|---|---|
| Sunucuda üretilen ses (podcast, ders anlatımı) | `api/learning/speech`, `api/learning/podcast/audio` — 402 `premium_required` |
| Ses tanıma (sözlü sınav) | `api/learning/oral/transcribe` — 402 `premium_required` |
| Sohbette "gelişmiş model" seçeneği | `lib/ai/model-router.ts` — `userSelectedAdvanced && isPremium` |
| Deneme üretim/değerlendirmede otomatik gelişmiş model | Aynı dosya; ücretsiz yalnızca `difficulty === "hard"` ise alıyor |
| Daha yüksek kota | `credit_wallets.period_allowance` |

**Toplamı bu kadar.** Premium kontrolü yapan yalnızca üç API rotası var.

### Ücretsiz kullanıcının da yaptıkları

- Deneme sınavı üretimi ve analizi
- Quiz, flashcard, çalışma planı
- Doküman yükleme ve kaynaklı yanıtlar
- **Fotoğraftan çözüm** — üstelik her zaman gelişmiş modele gidiyor
  (`model-router.ts`: `if (input.hasImage) return ADVANCED`), yani en pahalı
  işlemimizin ücretsiz katmanda hiçbir sınırı yok

---

## 2. Düzeltilmesi gereken çelişki

`components/parity/astra-subscription-cards.tsx` içindeki `PLUS_BENEFITS`
listesi Plus'ın şunları verdiğini söylüyor:

- "Deneme sınavı üretimi ve analiz"
- "Quiz, flashcard ve çalışma planı"
- "Dokümanlarından kaynaklı yanıtlar"

**Üçü de ücretsiz katmanda açık.** Fiyatlandırma sayfası satılmayan bir şeyi
satıyor. Bu metin canlıda duruyor ve ayrım kararı verilir verilmez
düzeltilmeli — hangi yöne düzeltileceği karara bağlı.

---

## 3. Astra'da gözlemlenen (premium hesapla)

| Ekran | İçerik |
|---|---|
| Profil | İsmin yanında altın **+** rozeti |
| Kullanım limitleri | "Astra AI Plus – Aylık limit" · sıfırlanma tarih-saati · yüzdelik çubuk ("%27 kullanıldı") |
| Aynı ekran | **"Ek paket satın al"** — abonelik üstü ek kota |
| Davet kartı | "0/3 davet kullanıldı" · yeni kayıtta 3 kat · davet edilen abone olursa 400 kat |
| Abonelikler | "Astra AI Plus" rozeti · paket bitiş tarihi · "Yükseltme paketi" · fatura listesi |

Bunların hepsinin karşılığı **bizde zaten var**. Premium tarafta ciddi bir
fark yok; fark ücretsiz tarafta ve orası görülemedi.

---

## 4. Neden görülemedi

Astra'da ücretsiz bir hesapla oturum açmak gerekiyor. Giriş ekranı şunu
diyor:

> Giriş yap veya **yeni bir hesap oluştur**. Ücretsiz.
> Devam ederek Kullanım Şartları ve Gizlilik Politikası'nı kabul etmiş olursun.

Aynı düğme ya giriş yapıyor ya hesap açıyor; hangisi olacağı önceden belli
değil. Ajan hesap açmıyor ve kullanıcı adına şart kabul etmiyor, o yüzden
burada durdu.

**Açmak için (bilgisayar başında, tek tık):**

1. `app.astra-ai.co/login`
2. "Google hesabı ile devam et" → `burhan55600@gmail.com`
3. Giriş olduysa haber ver; ajan ücretsiz ekranları inceleyip bu dosyayı
   günceller.

> Not: 2026-09-04'te "Deneme" premium hesabından çıkış yapıldı (ücretsiz
> hesaba geçebilmek için). O hesaba tekrar girmek gerekiyor.

---

## 5. Karara hazır öneri (onay bekliyor)

Seçilen mekanik: **bir kez denet, sonra kilitle.** Tablo maliyet mantığıyla
kuruldu — pahalı olan kilitleniyor, ucuz olan açık kalıyor.

| Özellik | Ücretsiz | Plus |
|---|---|---|
| Sohbet (standart model) | Açık | Açık, yüksek kota |
| Gelişmiş model sohbeti | 1 kez dene → kilit | Açık |
| Fotoğraftan çözüm | 1 kez dene → kilit | Açık |
| Podcast / sesli ders | 1 kez dene → kilit | Açık |
| Sözlü sınav (ses tanıma) | 1 kez dene → kilit | Açık |
| Deneme sınavı üretimi | Standart model | Gelişmiş model + detaylı analiz |
| Quiz, flashcard, plan | Açık | Açık, yüksek kota |
| Doküman yükleme | 1 doküman | Sınırsız |

### Uygulanacak ekranlar (kullanıcı seçimi)

- Sohbet kutusu — "gelişmiş model" ve mikrofon; şu an basınca sessizce
  çalışmıyor ya da anlaşılmaz hata veriyor
- Stüdyolar — sunucu sesi zaten kapalı ama önceden belli değil, kullanıcı
  üretmeye çalışıp duvara çarpıyor
- Sınav hazırlığı — model farkı hiçbir yerde söylenmiyor
- Limitler ve profil — ücretsizde neyin eksik olduğu net değil

### Yazılması gereken altyapı

"Bir kez dene" hakkı için kullanım sayacı gerekiyor: özellik başına, hesap
başına, tek kullanımlık. `credit_ledger` bunu taşımıyor; ayrı bir tablo ya
da `profiles` üzerinde bir alan gerekecek.

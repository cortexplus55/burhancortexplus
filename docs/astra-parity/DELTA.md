# Astra AI ↔ Cortex Plus — Fark Analizi

**Tarih:** 2026-09-03 · **Yöntem:** `/site-parity-audit`
**Kapsam:** guest · free (Temel) · premium (Astra AI Plus) — **üçü de gözlemlendi**

> Her satır ya `evidence/` altındaki bir artefakta ya da repodaki bir dosyaya
> dayanır. Doğrulanmamış hiçbir madde bu tabloya girmez — onlar §7'de.

---

## 0. Tek cümlelik özet

Astra bir **"sınav hazırlığı" nesnesi** etrafında kurulmuş; **sosyal**, **sesli**,
**oyunlaştırılmış** bir öğrenme sistemi. Cortex Plus ise aynı yetenekleri
**birbirinden bağımsız araç sayfaları** olarak sunan bir AI araç kutusu.
Teknik altyapımız (55 tablo, 17 API, SSE streaming, RAG, kredi sistemi, admin
paneli) sağlam — eksik olan **ürün mimarisi**.

---

## 1. P0 — Ürünün kalbindeki mimari fark

### 1.1 "Sınav Hazırlığı" = ürünün merkezi nesnesi

Astra'da her şey tek bir nesnenin içinde yaşar:

```
Sınav Hazırlığı (exam-prep)
├── kaynaklar (yüklenen materyal)
├── konular (AI'ın çıkardığı · düzenlenebilir · "N kaynak" atıflı)
├── çalışma yolu (7 fazlı düğüm haritası)
├── ilerleme %   ├── sınav tarihi   ├── hazırlık puanı %
├── sahip + okul + görüntülenme sayısı
└── PAYLAŞIM (link + QR kod)
```

Bizde `exam_preps` tablosu **var** ama:
- şeması yalnızca `user_id, exam_type, target_score`
- **UI'da hiç kullanılmıyor** (grep: 0 sonuç)
- eşdeğerlerimiz 5 ayrı bağımsız sayfa: `/quizler`, `/flashcardlar`,
  `/deneme-sinavlari`, `/calisma-plani`, `/dokumanlar`

**Kanıt:** `evidence/premium/exam-prep-creation.md` · `LOCAL_INVENTORY.md`

---

### 1.2 7 fazlı pedagojik program ↔ bizde düz görev listesi

| Faz | İçerik |
|---|---|
| 1. Bugün başla | Çalışma Yolu oluşturma · Giriş Dersi (5 dk) · **Tanı Testi** |
| 2. Öğren ve Pratik Yap | **Podcast Dinle** · AI öğretmenle Soru-Cevap · Testler ve Doğru/Yanlış · **Sözlü Deneme Sınavı** |
| 3. **Aralıklı Tekrar** | "Öğrendiklerini tekrar et" (spaced repetition) |
| 4. Bilgi boşluklarını kapat | Zayıf nokta tespiti · Odaklı pratik |
| 5. Yazılı Deneme Sınavı | "Gerçek sınav simülasyonu, **yapay zeka yardımı yok**" |
| 6. Sınav günü | Kartlarla son tekrar · Son zayıf nokta kontrolü |
| 7. Hazırsın 😎 | — |

Üstte **geri sayım kartı** ("SINAVA KADAR 10 gün · 13 Eylül Pazar") ve
**hazırlık puanı projeksiyonu** (😰 "Bugün: Hazır değilsin" → 🥳 "13 Eyl: Hazırsın").

Bizde `/calisma-plani` → `study_plan_tasks` düz görev listesi.
Tanı testi yok · aralıklı tekrar yok · hazırlık puanı yok · faz mimarisi yok.

---

### 1.3 Sosyal katman — tamamen yok

**Ölçek kanıtı (ücretsiz hesapta gözlemlendi):** İstanbul Üniversitesi okul
akışında **~317 üye** ve **70 paylaşılmış sınav hazırlığı** var — gerçek
öğrenci içeriği (YDS/YÖKDİL kelime listeleri, ders notları, muafiyet sınavı
örnekleri), görüntülenme sayaçları ve **"POPÜLER"** rozetiyle.
Bir öğrenci okuluna kaydolduğu anda 70 hazır materyale erişiyor.
**Bu, hiçbir AI özelliğinin kopyalayamayacağı bir ağ etkisi** — ve
ücretsiz katmana tamamen açık, yani paywall'ın önünde tutuluyor.

| Astra | Bizde |
|---|---|
| Onboarding'de **"Okulundaki sınav hazırlıklarına katıl" (ÖNERİLEN)** | — |
| Ana ekranda **"Okulum" / "Astra'dan"** akış sekmeleri | — |
| Okul kartı: üye avatarları (E, B, +3) · "Sınav hazırlıkları · 2" · dönem/ders filtreleri | — |
| Her hazırlıkta **görüntülenme sayısı** + "Senin" rozeti | — |
| **"Sınıf arkadaşlarınla paylaş"** → link kopyala + **QR kod** | — |
| Gizlilik güvencesi: "kimse senin sonuçlarını görmeyecek" | — |
| Takvimde **"Tümü / Etkinliklerim / Sınıf"** paylaşımlı görünüm | — |

Bizde `classrooms` var ama **öğretmen yönetimli**. Öğrenciden öğrenciye paylaşım,
okul kapsamlı keşif, ortak materyal havuzu yok. `share`/`paylas` grep: 0.

**Bu Astra'nın viral büyüme motoru.** Kopyalanmadan ürün eşdeğer olmaz.

---

### 1.4 Kota modeli: yüzde + çarpanlı referans ↔ mutlak kredi

| | Astra | Cortex Plus |
|---|---|---|
| Birim | **Yüzde** — "%27 kullanıldı" | Kredi adedi (`credit_ledger`) |
| Sıfırlama | Tam tarih-saat: "24 Eyl 2026 21:20" | — |
| Katman | Free / **Plus** / **Sigma** | Free / Plus |
| Fiyat | Plus ₺770/ay · yıllık ₺321/ay (%58) · Sigma ₺2.567/ay | — |
| **Referans** | **"0/3 davet"** · davet eden ve edilen **3 kat günlük kota** · davet edilen abone olursa **400 kat** | **Yok** |
| Top-up | **"Ek paket satın al"** | — |
| Pazarlama dili | Çarpan ("1300 kat", "8 kat", "10400X") | Mutlak sayı |
| Garanti | "Notlarını yükselt ya da **tam para iadesi**" | Yok |

**Kanıt:** `evidence/premium/apps-and-quota.md` · `evidence/guest/pay-tiers.md`

---

### 1.5 Onboarding: 14 adım / giriş öncesi ↔ 3 select / giriş sonrası

| | Astra | Cortex Plus |
|---|---|---|
| Adım | **14** | 1 sayfa, 3 select |
| Hesap ne zaman | **En sonda** (13 adım emekten sonra) | En başta |
| Toplanan sinyal | rol · **ses tercihi** · niyet · ad · yaş + veli izni · kanal · **sınav tarihi** · oluştur/**katıl** · ders · hedef % · endişe · **materyal (zorunlu)** | sınıf · ders · hedef |

**Kanıt:** `evidence/guest/onboarding-funnel.md`

---

### 1.6 Paywall felsefesi: **hacim kilidi ↔ bizde özellik kilidi**

İki hesapla ölçüldü. Ücretsiz hesap **tam kaliteli ürünü** kullanabiliyor:
sınav hazırlığı oluşturma, okul akışının tamamı (70 paylaşılmış hazırlık),
11 içerik formatının hepsi, sohbet araçları (Çiz, Matematik klavyesi, Çözücü,
Ruh hali), uygulama mağazası, referans programı — **kilit ikonu yok**.
Hatta **4:36 dakikalık iki sunuculu podcast'i ücretsiz hesap üretti.**

Ölçülen kota: **tek podcast üretimi %0 → %100.**
Yani ücretsiz kota ≈ **günde bir anlamlı üretim**, her gün 03:00'te sıfırlanıyor.

Free'de gerçekten kapalı olan yalnızca ikisi: **"+ Uygulama oluştur"** ve
**"Ek paket satın al"**.

| | Astra | Cortex Plus |
|---|---|---|
| Reddedilen şey | **"Devam etmek"** | **"Özellik"** |
| Free deneyimi | Premium'un aynısı, günde 1 kez | `UpgradeSheet` ile kilitli kartlar |
| Sıfırlama | Günlük 03:00 | — |

Pazarlama sayfası podcast'i Plus özelliği gibi gösteriyor; pratikte iddia
**hacim**, kilit değil. Bu, özellik kilitlemekten çok daha güçlü bir dönüşüm
modeli — kullanıcı ürünün gerçeğini tadıyor, sonra ya bekliyor ya ödüyor.

**Kanıt:** `TIER_MATRIX.md`, `evidence/free/free-tier-and-school-network.md`

---

## 2. P1 — Görünür özellik boşlukları

| # | Özellik | Astra'da gözlemlenen | Bizde |
|---|---|---|---|
| 2.1 | **Sesli AI öğretmen** | Onboarding ses karuseli (default "Neil") · sohbette **"Konuş"** canlı ses modu · derste **"Sesli mod: Yazmak yerine konuş"** | Yok (`voice`/`tts`/`realtime` grep: 0) |
| 2.2 | **Sözlü sınav** | Ders tipi seçicisinde: "Yapay zeka ile **gerçek zamanlı konuş** ve not al" → "Sözlü sınavı ayarla" | Yok |
| 2.3 | **Podcast üretimi** | **Üretildi ve dinlendi**: 4:36 dk, iki sunuculu Türkçe diyalog · **5 alt format** (Diyalog ~5dk / Özet ~1dk / Soru-Cevap ~7dk / Basit anlatım ~5dk / Derinlemesine ~10dk) · oynatıcıda ±15sn + **kelime senkronlu karaoke transkript** | Yok (`podcast` grep: 0) |
| 2.3b | **Video dersi** | Ders tipi seçicisinde "Video" formatı | Yok |
| 2.3c | **11 içerik formatı** | Öğren: Akıllı Metin · Podcast · Video · Hafıza kartları · Bilgi boşlukları · Pratik: Alıştırma · Test · Doğru/Yanlış · Tekrar · Sınav: Yazılı + Sözlü | 4 tip (quiz, flashcard, deneme, plan) |
| 2.3d | **Sıralı konu kilidi** | 9 konudan 1'i açık ("1. seviye", %7 halka), 2–9 asma kilitli — Duolingo tarzı zorunlu ilerleme | Yok |
| 2.3e | **Yapılandırılmış AI yanıtı** | LaTeX · **📖 tanım kartı** · **"Günlük Hayattan Örnek"** bloğu · sonda **öneri çipleri** ("Örnek çözelim", "Anlamadım tekrar anlat") | Düz markdown |
| 2.4 | **Çizim girdisi** | Composer → "Çiz — Düşüncelerini çiz" | Yok |
| 2.5 | **Matematik klavyesi** | Composer → "Sembol ve denklemleri gir" | Yok |
| 2.6 | **Ruh hali uyarlaması** | Composer'da "Bugünkü ruh hali 😐" · her derste 6 seviyeli soru → *"Öğretmen kendini nasıl hissettiğine göre uyum sağlayacak"* | Yok |
| 2.7 | **Ön bilgi kalibrasyonu** | Her derste "Bu konuya ne kadar aşinasın?" 🌱→🍎 5 seviye → zorluk ayarı | Yok |
| 2.8 | **QR ile telefondan yükleme** | Materyal adımında QR kod | Yok |
| 2.9 | **Panodan metin** | "Kopyalanan metni yapıştır" + min. içerik doğrulaması | Yok |
| 2.10 | **Uygulama mağazası** | ⭐ puan (4.3–5.0) · oynanma (44k) · kategori · top-10 · **günlük bulmacalar + liderlik tabloları** | 18 statik sim, metrik yok |
| 2.11 | **AI ile uygulama üretme** | "+ Uygulama oluştur" → sohbetle simülasyon/oyun/bulmaca üret ve paylaş | Yok |
| 2.12 | **Kullanıcıya açık RAG kontrolü** | "Yalnızca dosyalarına bağlı kalmamı ister misin?" + *"halüsinasyonlar olmadan"* güven kartı | RAG var, kontrol UI'ı yok |
| 2.13 | **Kaynak atıfı** | Her konuda "**1 kaynak**" rozeti | Yok |
| 2.14 | **Şeffaf üretim ekranı** | 5 aşamalı canlı kontrol listesi + 3B nokta küresi animasyonu | Basit spinner |
| 2.15 | **Sohbet içi widget kartları** | AI mesajlarında checkbox listesi · numaralı seçenek · güven kartı · konu listesi · **👍/👎** | Düz markdown |
| 2.16 | **Odaklanma Modu** | "Dikkat dağıtan uygulamaları engelleyen" (Plus) | Yok |
| 2.17 | **Native mobil uygulama** | iOS `id6751030141` + Android `co.astra_ai.app.twa` | Sadece PWA manifest |
| 2.18 | **Apple ile giriş** | Google + Apple + e-posta | Google + e-posta/şifre |
| 2.19 | **Şifresiz 6 haneli kod** | "Altı haneli erişim kodu" | Şifreli + reset akışları |
| 2.20 | **Takvim** | Etkinlik ekle · Tümü/Etkinliklerim/**Sınıf** · "Yaklaşan" listesi | Yok |
| 2.21 | **Ders kapsamlı sohbet** | Composer'da "Matematik ⌄" ders seçici | Yok |
| 2.22 | **Emoji'li sohbet başlıkları** | "Türev ve Kuralları Çalışması 📐" | Kontrol edilmeli |
| 2.23 | **Aboneliği duraklatma** | Yardım: "duraklatabilir veya iptal edebilirim" | Salt okunur `/odemeler` |
| 2.24 | **İçerik üretici programı** | Ayrı alan `ugc.astra-ai.co` — başvuru · ödemeli test aşaması · topluluk | `/yaratici-program` tek sayfa |
| 2.25 | **Özel ders ekleme** | "Dersini ekle" | Sabit liste |
| 2.26 | **Streak widget** | Profilde "Mevcut / En uzun streak" + haftalık alev ikonları | `user_streaks` var, widget kontrol edilmeli |

---

## 3. Ders deneyimi kalite farkı

Astra'nın giriş dersi, öğrencinin **kendi materyalinden** çıkarılan konuyu
**gerçek dünya bağlamıyla** ve **Sokratik** olarak açıyor:

> *"Bir drone, doğrusal bir pist boyunca ilerlemektedir… f(t) = t² + 2t …
> Drone uçuşunun tam 3. saniyesindeki anlık hızı nedir? …
> Giriş dersini birlikte adım adım inceleyelim. **Aklına ilk ne geliyor?**"*

- Matematik **LaTeX** ile render
- **Cevabı vermiyor**, soruyla başlatıyor
- Üstte "GİRİŞ DERSİ" rozeti · "Konuşmayı atla" seçeneği

Bizde `/ogretmen` genel amaçlı bir sohbet penceresi — ders nesnesi, rozet,
materyal bağı, Sokratik açılış kalıbı yok.

**Kanıt:** `evidence/premium/lesson-experience.md`

---

## 4. Bizde olup Astra'da olmayanlar (fazlalıklarımız)

Bunlar eksik değil — bilinçli ayrışma noktaları olabilir:

- **Veli rolü tam akışlı:** `/veli`, `/veli/plus`, `/veli/sor`,
  `parent_student_links`, **öğrenci → veliden ödeme isteme** (`parent_payment_requests`)
- **Öğretmen paneli:** sınıf · öğrenci · ödev · quiz · rapor (5 alt sayfa)
- **Admin paneli:** 14 sayfa — kredi kuralları, prompt versiyonlama, maliyet
  takibi, feature flag, audit log, öğretmen başvuruları
- **Sanal laboratuvar:** periyodik tablo · kuvvet-hareket · grafik çizici
- **KVKK uyumu:** `/kvkk` · `data_deletion_requests` · `consent_records`
- **PayTR** yerel ödeme entegrasyonu
- **Şeffaf kredi cüzdanı:** `/krediler` · ledger · rezervasyon

---

## 5. Önerilen yol haritası

**Faz 1 — Ürün mimarisini düzelt (P0, çoğu yeniden düzenleme)**
1. `exam_preps`'i gerçek nesneye çevir: materyal bağı · sınav tarihi ·
   konular (kaynak atıflı) · ilerleme · hazırlık puanı
2. Mevcut 5 aracı bu nesnenin **içine** taşı — yeni AI yeteneği gerekmiyor
3. Onboarding'i giriş öncesine al, materyal toplamayı zorunlu kıl

**Faz 2 — Sosyal katman (P0, büyüme motoru)**
4. Paylaşılabilir sınav hazırlığı: link + QR + görüntülenme sayacı
5. Okul kapsamlı akış (`schools` tablosu zaten var)
6. Referans programı → kota çarpanı

**Faz 3 — Ses (P1, en büyük teknik yatırım)**
7. TTS ile ders anlatımı → 8. Sesli sohbet → 9. Sözlü sınav + notlandırma

**Faz 4 — Cila (ucuz, etkisi yüksek)**
10. Ruh hali + ön bilgi kalibrasyonu
11. Sohbet içi widget kartları · şeffaf üretim ekranı · çizim + matematik klavyesi
12. Uygulama mağazası metrikleri (puan · oynanma · liderlik tablosu)

**Ayrıca — paywall stratejisini değiştir (kod değil, politika)**
Bugün `UpgradeSheet` ile **özellik kilitliyoruz**. Astra **hacim kilitliyor**:
ücretsiz kullanıcı ürünün tamamını günde bir kez kullanıyor.
`credit_rules` altyapımız bunu zaten destekliyor — tek gereken günlük
sıfırlanan tek bir bütçe ve kilitli kartların kaldırılması.
Bu, yeni özellik yazmadan dönüşümü artırabilecek en ucuz hamle.

---

## 6. Test edilmeyenler (güvenlik sınırı)

`observe-only` — UI görüldü, onay adımında duruldu:
- Ödeme / abonelik satın alma (plan seçim modalı açıldı ve kapatıldı)
- "Ek paket satın al"
- Paylaşım linkinin gerçekten gönderilmesi
- Abonelik iptal / duraklatma

---

## 7. HENÜZ DOĞRULANMADI

- [ ] Plus ↔ Sigma davranış farkı (Sigma hesabı gerekir)
- [ ] Sözlü sınav akışı (mikrofon izni gerekir)
- [ ] "Video" formatının çıktısı
- [ ] "Aktivitelerim" panelinin içeriği
- [ ] Bildirim ve e-posta akışları
- [ ] Öğretmen ve Ebeveyn rollerinin girişli akışları
      (yalnızca öğrenci rolüyle girildi)

> **Not:** Önceki `docs/astra-audit/` çalışmasındaki satırların çoğu
> `cortex_doc` / `infer` etiketliydi — yani gözlemlenmemişti. Bu rapordaki
> §1–§4 **gözlemlenmiştir**; §7 açıkça gözlemlenmemiştir.

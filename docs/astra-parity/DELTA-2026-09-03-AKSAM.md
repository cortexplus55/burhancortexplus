# Astra AI ↔ Cortex Plus — Güncel Fark Analizi

> ## ⚠️ 2026-09-04 düzeltmesi — bu dosya bir iş listesi DEĞİL
>
> Aşağıdaki **Bölüm 6** beş maddeyi "kapatıldı ✓" diye anlatıyor. O maddelerin
> dördü aynı gece `13a175e` ile **üründen kaldırıldı**: günün bulmacaları,
> liderlik tablosu, AI uygulama üreteci ve 34 simülasyon. "Uygulamalar" bölümü
> tümüyle kalktı, yerine 12 araçlık `/araclar` merkezi geldi.
>
> Ayrıca ürün kararı değişti: **Astra paritesi artık kuzey yıldızı değil.**
> Astra bir referans; "Astra'da var, bizde yok" tek başına yapılacak iş
> gerekçesi sayılmıyor. Ayrıntı: [README.md](./README.md).
>
> Dosya tarihsel kayıt olarak duruyor — Astra gözlemleri hâlâ geçerli, bizim
> tarafımıza dair her satır koddan doğrulanmadan kullanılmamalı.


**Tarih:** 2026-09-03 akşam
**Karşılaştırılan:** `app.astra-ai.co/tr-TR` (premium oturum) ↔ `cortexplus.app`
**Kod tabanı:** `cortexplus55/burhancortexplus` @ `a5b4a53`
**Veritabanı:** Supabase `dgjfyewgrukglsehyntc`

> Bu dosya `DELTA-LIVE.md`'nin yerini alır. `DELTA-LIVE.md` bugün öğlen yazıldı;
> öğleden sonraki commit'ler içindeki maddelerin çoğunu kapattı. Aşağıdaki her
> satır ya canlı DB'ye atılmış bir sorguya ya da repodaki bir dosya/satıra dayanır.

---

## 0. Altyapı yer tespiti (doğrulandı)

| Katman | Canlı olan | Ölü olan |
|---|---|---|
| GitHub | `cortexplus55/burhancortexplus`, `main` @ `a5b4a53` | `burhan55600-pixel/cortex-plus` (GitHub'dan silinmiş) |
| Vercel | `burhancortexplus-app` — `prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A` | — |
| Supabase | `dgjfyewgrukglsehyntc` | `gwqonggqzvavljguiryx` ("retired") |
| Çalışma klasörü | `Masaüstü\Cortex-Plus-Dev\` | `Masaüstü\CORTEX PLUS Aİ CURSOR\` (arşiv) |

**Senkron durumu:** `git log origin/main..main` ve tersi **boş** — yerel ve uzak aynı.
**Deploy durumu:** canlı ana sayfa HTML'i en son commit'in eklediği `/ornek`
bağlantısını içeriyor → `a5b4a53` yayında.

### Migration'lar canlıya uygulanmış mı? — EVET

Anon key ile PostgREST'e atılan varlık sorguları:

| Nesne | Sonuç |
|---|---|
| `study_session_moods`, `calendar_events`, `lab_app_plays`, `lab_app_ratings` | 200 — var |
| `lesson_audio` (PK `hash`) | 200 — var |
| `exam_preps`: `school_id`, `visibility`, `view_count`, `forked_from`, `readiness_score`, `document_id` | hepsi var |
| `credit_wallets`: `period_allowance`, `period_ends_at`, `period_kind` | hepsi var |
| RPC `school_feed`, `school_summary`, `lab_app_stats` | var |
| RPC `increment_prep_view` | var (204) |
| Storage bucket `lesson-audio` | migration `20260903210000` içinde, tablo geldiğine göre bucket da geldi |

**Şema kayması yok.** Bu, yayın için en kritik kontroldü.

---

## 1. Skill entegrasyonu — zaten tamam

`.claude/skills/clone-website/SKILL.md`, upstream
`JCodesMore/ai-website-cloner-template` ile **byte-byte aynı** (527 satır, `diff` boş).
Upstream'in son commit'i `92872bc` (2026-08-14); bizim kopya daha sonra senkronlandı.
Upstream **tek** skill yayınlıyor — çekilecek yeni bir şey yok.

`site-parity-audit` bize özgü ek; upstream'de yok.

---

## 2. `DELTA-LIVE.md`'den bu yana KAPANAN maddeler

Bunlar birkaç saat önce "eksik" yazılmıştı, artık kodda var:

| Madde | Kanıt |
|---|---|
| **Sunucu tarafı TTS** (en büyük P0) | `src/lib/ai/speech.ts:52` → `openai.audio.speech.create`; MP3 önbelleği `lib/learning/audio-cache.ts`; `lesson_audio` tablosu + `lesson-audio` bucket |
| **Okul ağı** | `school_id`/`visibility`/`view_count`/`forked_from` kolonları, `school_feed()` + `school_summary()` RPC'leri, `components/parity/school-feed-view.tsx` |
| **Ruh hali uyarlaması** | `study_session_moods` tablosu; CHECK kısıtı Astra'nın 6 ruh halini birebir taşıyor (`ready, curious, calm, neutral, low_energy, stressed`) |
| **Ön bilgi kalibrasyonu** | `familiarity` kolonu; 5 seviye (`new, heard, basics, good, confident`) = Astra'nın 🌱→🍎 ölçeği |
| **Hazırlık puanı** | `exam_preps.readiness_score` (0–100 CHECK) |
| **Yüzde kota + sıfırlama + ek paket** | `credit_wallets.period_*`; `src/lib/credits/period.ts`; `/krediler` sayfasında `%N kullanıldı`, `… tarihinde sıfırlanır`, `Ek paket satın al` |
| **Takvim** | `calendar_events` tablosu, `/api/calendar`, `components/parity/calendar-view.tsx` |
| **Uygulama metrikleri** | `lab_app_plays` + `lab_app_ratings` + `lab_app_stats()`; lab envanteri 18 → **30** uygulama; kategori sekmeleri (Mini oyun / Simülasyon / Araçlar) |
| **QR kod** | `src/lib/qr.ts` — sunucuda üretiliyor, davet kodu dış servise gitmiyor |
| **Kaynağa bağlılık (RAG)** | `exam_preps.document_id`, `match_document_chunks()` |
| **Aralıklı tekrar** | `lib/learning/exam-prep-plan.ts` |

Ayrıca Astra'yı hedefleyen **40 adet `components/parity/*` bileşeni** mevcut.

---

## 3. HÂLÂ AÇIK olan farklar

### P0 — "+ Uygulama oluştur" sahte

Astra'da bu, sohbetle **paylaşılabilir bir simülasyon/mini oyun üreten** bir AI akışı:

> "Fikrini anlat, ben de onu paylaşabileceğin küçük ve etkileşimli bir uygulamaya
> dönüştüreyim: simülasyon, mini oyun, görselleştirme veya bulmaca."

Bizde `uygulamalar-lab-client.tsx:118` — buton `/quizler`'e `<Link>`:

```tsx
<Link href="/quizler" className="ap-lab-create">
  + Uygulama oluştur
</Link>
```

Etiket vaat ettiğini yapmıyor. Ya akış yazılmalı ya etiket düzeltilmeli.

### P1 — Doğrulanmış eksikler (kod taramasında 0 dosya)

| Özellik | Astra'da gözlemlenen | Bizde |
|---|---|---|
| **Liderlik tablosu** | Bulmaca başına sıralama + oyuncu süreleri (1:57.8, 41.9s…) | yok |
| **Günün bulmacaları** | "0/8 çözüldü", çözülmemişe "İlk çözen sen ol" | yok |
| **Referans ödül mekaniği** | "0/3 davet kullanıldı" · yeni kayıtta **ikisine de 3 kat** · davet edilen abone olursa **400 kat** | `referral_code`/`referred_by` kolonları var, **ödül mantığı yok** |
| **Kelime senkronlu transkript** | Podcast oynatıcıda kelime kelime takip | yok |

#### Düzeltme — matematik klavyesi eksik değildi

İlk taramada `math.?keyboard|matematik klavye` kalıbıyla arayıp "0 dosya"
gördüm ve eksik yazdım. **Yanlış negatifti:** `chat-panel.tsx` zaten 19 sembol
+ 3 LaTeX kısayolu (`lim`, `∫`, `f′`) sunan bir şerit tanımlıyordu.

Gerçek fark daha darmış. Astra'nın klavyesi bu oturumda açılıp incelendi:

| | Astra | Bizde (düzeltme öncesi) |
|---|---|---|
| Yapı | 4 kategori sekmesi | tek düz şerit |
| Tuş | ~30'luk ızgara × 4 sekme | 22 |
| İmleç | ← → ile ifadenin ortasına dönme | yok |
| Geri silme | ⌫ tuşu | yok |
| Rakamlar | ayrı vurgulu satır (0–9) | yok |

Astra kategorileri: `+ − × ÷` (rakam, kök, üs, kesir) · `f(x) e / log ln`
(log, mutlak değer, küme parantezi, a–s harfleri) · `sin cos / tan cot`
(ters trigonometrik + 22 Yunan harfi) · `lim dx / ∫ Σ ∞` (limit, binom,
vektör, küme sembolleri).

**Kapatıldı** — `components/parity/math-keyboard.tsx`.

### P2 — Masaüstü kabuğu (bu oturumda ilk kez gözlemlendi)

Önceki kanıtların tamamı **mobil** görünümdü. Masaüstünde Astra farklı:

- Alt navigasyon yok; **üst-ortada 3'lü pill sekme**: `Sor · Sınav hazırlığı · Öğrenme uygulamaları`
- Sağ üst: 🔥 streak rozeti · `⋮⋮ Daha fazla` · avatar
- Hazırlık kartındaki ilerleme çubuğunda **amber "hedef puan" işareti** — çubuğun
  üzerinde etiketli bir tik; ilerleme yeşil dolgu (`0%`, `7%`)
- Okul bloğu: okul adı → "Üniversite / fakülte, 5. dönem" → **üye avatar yığını
  (B E B +3)** → "Sınav hazırlıkları · 2" → `5. dönem ⌄` + `Tüm dersler ⌄`
  filtreleri → kartlarda sahip avatarı, ders etiketi, başlık,
  **"4 görüntülenme"**, **"✓ Senin"** rozeti
- Uygulamalar sayfasında **kategori kutucukları**: Mini oyunlar 11 · Simülasyonlar 34 ·
  Araçlar 7 · Uygulamalarınız 0 — yani Astra'da **52 uygulama**, bizde 30

Bizim masaüstü kabuğumuzun bununla ne kadar örtüştüğü **doğrulanmadı** (aşağıya bak).

---

## 4. DOĞRULANMADI — engel ve nedeni

| Konu | Durum | Neden |
|---|---|---|
| cortexplus.app'in girişli ekranlarının görsel karşılaştırması | **BLOCKED** | Ajanın şifreyle oturum açma yetkisi yok; `cortexplus.app/giris` formu tarayıcı şifre yöneticisiyle dolu ama "Giriş yap"a basmak kimlik doğrulamaktır |
| Buton tepkileri / animasyon eşleşmesi | **BLOCKED** | Aynı neden |
| Astra ücretsiz katman farkları (bu oturumda) | **BLOCKED** | Chrome'da açık oturum premium hesap; ücretsiz hesaba geçmek çıkış+giriş gerektirir |

Astra tarafı sorun değildi: Chrome'da **zaten açık premium oturum** vardı
("Deneme", altın **+** rozeti, Giresun Ünv. Tıp Fakültesi) — hiçbir şifre girilmedi.

---

## 5. Kaynak notu

- Astra premium gözlemleri: bu oturumda `app.astra-ai.co/tr-TR`, `/lab`,
  `/exam-preps`, profil ve "Kullanım limitleri" diyaloğu
- Kota modeli birebir teyit: "Astra AI Plus – Aylık limit ·
  24 Eyl 2026 21:20 tarihinde sıfırlanır · %27 kullanıldı · Ek paket satın al"
- Önceki detaylı mobil kanıtlar: `docs/astra-parity/evidence/premium/*.md` — geçerli
- `DELTA.md` (yanlış repo) ve `DELTA-LIVE.md` (bugün öğlen) artık **tarihsel kayıt**

---

## 6. Bu oturumda kapatılanlar (2026-09-03 akşam)

Bölüm 3'teki açık maddelerin **hepsi** yazıldı. Şema canlıya uygulandı;
kod henüz push edilmedi.

| Madde | Ne yapıldı | Kanıt |
|---|---|---|
| **Referans ödülü** | 3 kat / 400 kat çarpanı kota yenilemesine bağlandı | `20260904000000_referral_rewards.sql` · canlı DB'de `referral_tiers` = 3/3/400 |
| **Matematik klavyesi** | Düz şerit → 4 kategorili, ⌫ ve ← → imleçli klavye | `math-keyboard.tsx` · tarayıcıda doğrulandı |
| **Günün bulmacaları** | Hanoi, Nonogram 5×5, Sudoku 6×6 — günün tohumuyla, herkese aynı tahta | `puzzle-logic.ts` · 12 birim testi |
| **Liderlik tablosu** | Gün + bulmaca başına sıralama, süreyi **sunucu** ölçüyor | `20260904010000_daily_puzzles.sql` · `puzzle-session.ts` |
| **Kelime senkronlu transkript** | Cümlenin ölçülen süresi kelimelere paylaştırılıyor | `podcast-script.ts → wordTimings` · 9 birim testi |
| **AI uygulama üreteci** | Sohbetle tek dosyalık mini uygulama; okulla paylaşılabiliyor | `/api/lab/generate` · `user-app.ts` · 10 birim testi |

Ayrıca podcast atlama süresi Astra ile eşitlendi: ±10 sn → **±15 sn**.

### Karar: bulmacalar neden sıfırdan yazıldı

Liderlik tablosunu mevcut 30 lab uygulamasının üstüne kurmak mümkün değildi:
hiçbirinde **kazanma koşulu yok**, hepsi keşif/simülasyon. Süre ölçülecek bir
"çözüm" olayı olmadan tablo hiç dolmayacak, yani sahte bir özellik olacaktı.
Bu yüzden önce gerçek bulmacalar yazıldı.

### Güvenlik: üretilen uygulamalar

`user_apps.html` modelin ürettiği ve **başka kullanıcıların da açtığı** bir belge.
İzolasyon iddia değil, ölçüldü — kaçmayı deneyen bir test uygulaması çalıştırıldı:

| Deneme | Sonuç |
|---|---|
| `parent.document` | ENGELLENDİ |
| `localStorage` | ENGELLENDİ |
| `document.cookie` | ENGELLENDİ |
| `location.origin` | `null` (opak kaynak) |
| `fetch("https://…")` | ENGELLENDİ |

İki katman: `sandbox="allow-scripts"` — `allow-same-origin` **kasıtlı olarak
yok** (ikisi birlikte verilirse iframe kendi sandbox'ını kaldırır) — ve
`default-src 'none'` CSP'si. Bunlar gevşetilirse her üretilen uygulama hesap
ele geçirme yüzeyi olur.

### Maliyet uyarısı — karar sizin

400 çarpanı ücretsiz katmanın günlük 6 birimlik bütçesini **2400'e** çıkarır.
Astra'nın ilan ettiği sayı bu, ama OpenAI faturası bizde. Sayı koda gömülü
değil, `referral_tiers` tablosunda:

```sql
UPDATE public.referral_tiers SET multiplier = 20 WHERE status = 'subscribed';
```

### Doğrulama durumu

- `npm run typecheck` · `npm run lint` · `npm run build` — temiz
- `npx vitest run` — **204 test, 26 dosya, hepsi geçti** (31'i bu oturumda yazıldı)
- Tarayıcıda doğrulandı: matematik klavyesi, Hanoi (7 hamlede çözüm → geri
  çağırma), nonogram/sudoku ızgaraları, sandbox izolasyonu
- **Doğrulanmadı:** girişli ekranların Astra ile yan yana görsel karşılaştırması

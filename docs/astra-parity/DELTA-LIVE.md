# Astra AI ↔ Cortex Plus (CANLI) — Düzeltilmiş Fark Analizi

**Tarih:** 2026-09-03
**Kod tabanı:** `cortexplus55/burhancortexplus` (canlı, `cortexplus.app`'i yayınlayan)
**Veritabanı:** Supabase `dgjfyewgrukglsehyntc` — "Cortex Plus", main PRODUCTION

---

## 0. Bu dosya neden var

`DELTA.md` yanlış kod tabanına karşı yazıldı. O analiz yerel çalışma kopyasını
(`burhan55600-pixel/cortex-plus`) inceledi; oysa canlı ürün başka bir repodan
yayınlanıyor ve **çok daha gelişmiş**. `DELTA.md`'nin Astra gözlemleri geçerli,
ama "bizde yok" sütununun büyük kısmı yanlış.

Doğrulama zinciri:
- `cortexplus.app/giris` istemci paketi → `dgjfyewgrukglsehyntc.supabase.co`
- Yerel `.env.local` + `supabase/config.toml` → `gwqonggqzvavljguiryx`
  (Vercel deploy notlarında **"retired"** olarak geçiyor)
- Vercel projesi `burhancortexplus-app` → repo `cortexplus55/burhancortexplus`

---

## 1. `DELTA.md`'de yanlış olan maddeler

Aşağıdakiler canlı üründe **zaten var**:

| `DELTA.md` iddiası | Canlı repodaki gerçek |
|---|---|
| "Sınav Hazırlığı nesnesi yok" | **Var** — `/api/learning/exam-prep/*` altında 12 rota, 1335 satır |
| "Düğüm haritası yok" | **Var** — `/deneme-sinavlari/[prepId]/dugum/[nodeId]`, `node/route.ts` 336 satır |
| "Konular yok" | **Var** — `exam_prep_topics` (11 satır veri), `/konu`, `select-topic`, `topic` rotaları |
| "Ders nesnesi yok" | **Var** — `exam_prep_lessons`, `/ders/[lessonId]`, `lesson/route.ts` 145 satır |
| "Tanı/giriş yok" | **Var** — `/tanisma`, `exam_prep_intro_attempts`, `intro/route.ts` 167 satır |
| "Deneme sınavı nesne içinde değil" | **Var** — `/deneme/[examId]`, `/incele`, `mock-exam/route.ts` |
| "Paylaşım yok" | **Var** — `/siniflar/[id]` (196 satır), `classroom-share-prep`, `join-class` |
| "Referans programı yok" | **Var** — `/davet` |
| "QR ile telefondan yükleme yok" | **Kısmen var** — `/yukle/[token]`, `/api/uploads/phone-session` (token'lı el değiştirme; QR üretimi yok) |
| "Podcast yok" | **Kısmen var** — `/studio/podcast`, senaryo üretimi + tarayıcı sesiyle okuma |
| "Sesli sohbet / sözlü sınav yok" | **Kısmen var** — `exam-voice-tutor`, `oral-studio`, tarayıcı Web Speech API |
| "Tasarım dili şablon" | Canlı repo zaten **koyu + amber** (`--primary: 42 91% 51%`) |

---

## 2. Canlı şema (gözlemlenmiş)

| Tablo | Satır | Kolonlar |
|---|---|---|
| `exam_preps` | 2 | id, user_id, exam_type, target_score, created_at, study_plan_id, **classroom_id**, exam_date, **active_topic_id**, intro_completed_at, … |
| `exam_prep_topics` | 11 | — |
| `exam_prep_nodes` | 14 | id, exam_prep_id, kind, title, **day_index**, sort_order, status, created_at |
| `exam_prep_node_attempts` | 4 | id, node_id, exam_prep_id, user_id, topic_id, difficulty… |
| `exam_prep_lessons` | 1 | id, exam_prep_id, title, content_md, conversation_id, created_at… |
| `exam_prep_sessions` | 1 | id, exam_prep_id, user_id, conversation_id, lesson_id… |
| `exam_prep_intro_attempts` | 1 | id, exam_prep_id, user_id, topic_id, payload, score… |

Yapısal not: çalışma yolu **`day_index` ile güne bağlı** planlanıyor — Astra'nın
"günlük çalışma planı" mantığına yakın. Paylaşım `classroom_id` üzerinden;
okul kapsamı yok.

---

## 3. GERÇEK farklar (kod okunarak doğrulandı)

### P0 — Ses: üretilmiş ses yok, tarayıcı sesi var

Canlı ürün `window.speechSynthesis` ve `webkitSpeechRecognition` kullanıyor
(`lib/learning/studio-speech.ts`). Yani ses **var** ama:

| | Astra | Cortex Plus (canlı) |
|---|---|---|
| Kaynak | Sunucuda üretilmiş ses dosyası | Tarayıcının yerleşik sesi |
| Podcast | 4:36 dk, **iki ayrı sunucu sesi**, doğal diyalog (gülüşme dahil) | Senaryo metni + tek sistem sesiyle okuma |
| Oynatıcı | ±15 sn atlama, ilerleme çubuğu, **kelime senkronlu transkript** | Oynat/durdur |
| Format | 5 alt format (Diyalog/Özet/Soru-Cevap/Basit/Derinlemesine) | Tek format |
| Türkçe ses kalitesi | Tutarlı | İşletim sistemine bağlı, çoğu cihazda robotik |

`MediaRecorder` / `getUserMedia` grep: **0 dosya** → ses kaydı yok, yalnızca
tarayıcı STT'si. Sunucu tarafı TTS/STT (`audio/speech`, `whisper`): **0**.

### P0 — Okul ağı yok

Astra'nın asıl savunma hattı: bir öğrenci okuluna kayıt olduğu anda o okulun
paylaşılmış hazırlıklarına erişiyor (İstanbul Üniversitesi'nde **~317 üye,
70 hazırlık** gözlemlendi; görüntülenme sayaçları, POPÜLER rozeti,
dönem/ders filtreleri).

Canlı üründe paylaşım **sınıf bazlı** (`classroom_id`) — öğretmenin ya da
öğrencinin kurduğu kapalı sınıf. Okul kapsamlı keşif, `school_id` bağı,
görüntülenme sayacı, popülerlik sıralaması yok.

### P1 — Doğrulanmış eksikler

| Özellik | Astra | Canlı Cortex Plus |
|---|---|---|
| **Ruh hali uyarlaması** | Her derste 6 seviyeli soru, ton buna göre | `mood` grep: **0 dosya** |
| **Ön bilgi kalibrasyonu** | 🌱→🍎 5 seviye, zorluk ayarı | `familiarity` grep: **0 dosya** |
| **Hazırlık puanı** | Yüzde + projeksiyon (😰→🥳) | `readiness` grep: **0 dosya** |
| **QR kod** | Materyal adımında tarama | `qrcode` grep: **0 dosya** (token'lı link var, QR yok) |
| **Kullanım limitleri sayfası** | Yüzde + sıfırlama tarihi + top-up | `/limitler` yalnızca `/krediler`'in takma adı |
| **Takvim** | Etkinlik ekleme, Tümü/Etkinliklerim/**Sınıf** filtresi | `/takvimim` → `/calisma-plani?tab=takvim` yönlendirmesi |
| **Uygulama mağazası metrikleri** | ⭐ puan, oynanma, liderlik tablosu, günlük bulmaca | `/uygulamalar` var, metrik yok |
| **AI ile uygulama üretme** | Sohbetle simülasyon/oyun üret ve paylaş | Yok |

### P1 — Kota modeli farkı (Astra'da ölçüldü)

Astra: **yüzde** göstergesi + sıfırlama tarih-saati + çarpanlı referans
(3 kat / 400 kat, max 3 davet) + "Ek paket satın al".
Ücretsiz katman **günde ~1 üretim** (tek podcast: %0 → %100), her gün 03:00'te sıfırlanır.

Canlı Cortex Plus: mutlak kredi (`credit_rules`, `credit_ledger`).
`/davet` var ama Astra'nın çarpan mekaniği doğrulanmadı.

---

## 4. Doğrulanmamış — sonraki adımda bakılacak

- `/davet` referans ödülünün gerçek mekaniği (kota çarpanı mı, başka bir şey mi)
- `/siniflar` paylaşımının derinliği (davet, görünürlük, ilerleme gizliliği)
- Canlı `exam_preps`'in 11. kolonu
- RLS politikalarının kapsamı
- Onboarding akışının canlı repodaki hâli (`/onboarding`, `/kayit`)
- 25 migration dosyası ile canlı şema arasındaki fark

---

## 5. Yöntem notu

`DELTA.md` bundan sonra **tarihsel kayıt** olarak durur; canlı ürün için
referans bu dosyadır. Aynı hatayı tekrarlamamak için doğrulama sırası:

1. Canlı sitenin istemci paketinden Supabase ref'ini oku
2. Vercel'de hangi projenin hangi repoyu deploy ettiğini teyit et
3. Ancak ondan sonra kod ve şema karşılaştır

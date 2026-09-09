# PDF öğrenme — Aşama 9 (9 Eylül 2026)

Amaç: **Çalışma yolu ve sonuç arayüzü** — net birincil adım, yükleme/hata boş sayfa değil, tercihler oturumlar arası kalır.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §11.  
Önceki: [PDF-LEARNING-STAGE8-2026-09-09.md](./PDF-LEARNING-STAGE8-2026-09-09.md).

**Durum:** Kod + birim test. Bayrak `pdf_learning_v2` kapalıyken legacy trail / tek ilerleme metresi; v2 UI yalnızca bayrak açıkken.

---

## 1. Ne geldi

### Ekranlar (§11 listesi)

| # | Ekran | Durum |
|---|---|---|
| 1 | PDF yükleme + işlem durumu | Cilalandı — `DocumentUpload` durum metni + v2’de harita yönlendirmesi; liste harita etiketi / hata / “Sınav hazırlığı başlat” |
| 2 | Konu haritası + kapsam | Mevcut `TopicMapEditor` + CTA → `/deneme-sinavlari/olustur?documentId=` |
| 3 | Tarih / süre / tercihler | Create intake + **post-create** `ExamPrepSettingsPanel` (PATCH settings); tercihler DB’de kalır |
| 4 | Başlangıç ölçümü | Mevcut `ExamIntroQuiz` (Aşama 3) |
| 5 | Günlük çalışma yolu | `ExamPrepHome` gün grupları + “Bugün” kartı + kaçırılan gün uyarısı |
| 6 | Ders + etkinlik | Mevcut `ExamNodeSession` + resume metni + sonuç linkleri |
| 7 | Konu bazlı sonuçlar | `/degerlendirme` konu panosu |
| 8 | Yanlışlar + tekrarlar | `/tekrarlar` ← `exam_prep_misconceptions` |
| 9 | Program yeniden planlama | “Kaçırılan günleri yeniden dağıt” + kaydet/yenile (`redistributeRemainingSchedule`) |
| 10 | Sınav öncesi genel değerlendirme | `/degerlendirme` üç metre + karar özeti |

### API

| Uç | |
|---|---|
| `PATCH /api/learning/exam-prep/settings` | Tercih / tarih / süre; isteğe bağlı plan yenileme |
| `POST /api/learning/exam-prep/reschedule` | Kalan oturumları yeniden dağıt; `done` düğümler korunur |

Saf yardımcılar: `exam-prep-ui-path.ts`, `exam-prep-reschedule-apply.ts`.

### Tercih → üretim

Node üretiminde (bayrak ON) `learning_preferences` stile/tempo ipucu olarak prompt’a girer.

### Test

`tests/unit/exam-prep-ui-stage9.test.ts` — gün gruplama, kaçırılan gün, prefs parse, insert filtresi.

---

## 2. Bayrak

Varsayılan **OFF**. Açıkken Stage 2–9 birlikte. Kapat = eski trail + ayarlar/tekrar/değerlendirme yönlendirmeleri kapalı.

---

## 3. Rollback

Bayrağı kapat. Yeni sayfalar bayrak kapalıyken home’a redirect. Additive şema yok.

---

## 4. Bilinçli boşluklar

| Madde | Not |
|---|---|
| Canlı harita progress poll | İşlem bitince durum; websocket yok |
| Yanılgı “çözüldü” | Tabloda resolved kolonu yok; liste + tekrar düğümü |
| Cross-device prefs UI cache | DB kaynak; localStorage yok |
| Aşama 10 kalite matrisi | Ayrı aşama |

---

## 5. Manuel doğrulama (9 Eylül 2026)

1. Production Ready: `d163d83` / `dpl_BxzjXJ9K1oZTCCcibruvEmVeCi8c` → cortexplus.app.
2. Bayrak geçici ON.
3. Prep `Stage4 Trigonometri Plan`: günlük yol (Bugün + takvim günleri), tercihler/yeniden dağıt, **Yanlışlar (3)**, üç metre, primary CTA.
4. `/tekrarlar`: 3 yanılgı + formül metinleri (`√2/2`, `90°`); `/degerlendirme`: üç gösterge + “Önce zayıf noktaları kapat”.
5. `/dokumanlar`: “Harita hazır” + “Sınav hazırlığı başlat”; düğüm resume: “Kaldığın yer açılıyor…” açıklamalı.
6. Dar viewport (~390): overview + resume ekranı okunaklı.
7. Bayrak **OFF**: legacy trail + tek “Çalışma ilerlemen”; v2 linkleri yok (`enabled=false` doğrulandı).

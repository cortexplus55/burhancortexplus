# PDF öğrenme — Aşama 4 (8 Eylül 2026)

Amaç: Sınav tarihine / günlük süreye / konu kapsamına göre **gerçek** çalışma dağılımı.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md).  
Önceki: [PDF-LEARNING-STAGE3-2026-09-08.md](./PDF-LEARNING-STAGE3-2026-09-08.md).

**Durum:** Kod + additive migration. Bayrak `pdf_learning_v2` kapalıyken legacy `buildExamPlan` aynen kalır.

---

## 1. Ne geldi

### Saf plan motoru

`src/lib/learning/exam-schedule-v2.ts`

| Girdi | Kullanım |
|---|---|
| Gün sayısı | Çalışma penceresi |
| `dailyMinutes` | Günlük bütçe |
| `studyDays` | Haftanın hangi günleri |
| PDF konu haritası | Kapsam + sayfalar + önkoşul + hedef |
| Tanı / öz-bildirim | Yük katsayısı (weak/hard ↑, solid ↓) |
| Hedef puan | İleride öncelik; şimdilik saklanır |

Çıktı oturumları: `topic` + `objective` + `sourcePages` + `durationMinutes` + `role` (`learn`/`practice`/`review`/`mock`) + `calendarDate`.

Davranış:

- Önkoşul sırası (topolojik)
- Yük tahmini vs uygun süre; sığmazsa **dürüst** seçenekler (`increase_daily_time`, `prioritize_topics`, `cut_scope`, `extend_days`) — uydurma sığdırma yok
- Son çalışma gününe yeni `learn` yığılmaz; `mock` son günde
- `redistributeRemainingSchedule`: tamamlanan oturumların takvimini korur, kalanı yeniden dağıtır

### Şema (Supabase `dgjfyewgrukglsehyntc`)

Migration: `20260908200000_pdf_learning_stage4_schedule.sql` (`pdf_learning_stage4_schedule`)

| Nesne | |
|---|---|
| `exam_preps.schedule_v2` | jsonb özet (fits, cuts, options, sessions…) |
| `exam_prep_nodes.session_meta` | jsonb oturum meta |

### Runtime

`POST /api/learning/exam-prep/create` — bayrak + topic map varken `buildExamScheduleV2` → node draft’ları RPC’ye; legacy yol bayrak kapalıyken değişmez.

UI: hazırlık sayfasında plan özeti; node satırında süre / sayfa; oluşturma toast’ında sığmama uyarısı.

### Test

`tests/unit/exam-schedule-v2.test.ts` — prereq, fit/cut, 3/7/14 farkı, redistribute, node mapping.

---

## 2. Bayrak

Varsayılan **OFF** önerilir. Açıkken Stage 2–4 yolları birlikte çalışır. Kapat = legacy plan motoru.

---

## 3. Rollback

Bayrağı kapat. Additive kolonlara dokunma. Önceki Ready deploy.

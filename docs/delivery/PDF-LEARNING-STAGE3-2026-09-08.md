# PDF öğrenme — Aşama 3 (8 Eylül 2026)

Amaç: Öğrencinin başlangıç düzeyini ölçmek — intake profili + konu haritasına bağlı kısa tanı; öz-bildirim ile ölçülen seviye ayrı.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md).  
Önceki: [PDF-LEARNING-STAGE2-2026-09-08.md](./PDF-LEARNING-STAGE2-2026-09-08.md).

**Durum:** Kod + canlı additive migration uygulandı. Bayrak **varsayılan kapalı** (`pdf_learning_v2`). Aşama 4+ plan dağılımı yok.

---

## 1. Ne geldi

### Şema (Supabase `dgjfyewgrukglsehyntc`)

Migration: `cortex-plus/supabase/migrations/20260908190000_pdf_learning_stage3_diagnostic.sql` (MCP `apply_migration`: `pdf_learning_stage3_diagnostic`).

| Nesne | İçerik |
|---|---|
| `exam_preps` + | `daily_minutes`, `study_days`, `hard_topics_self`, `learning_preferences` |
| `exam_prep_topics` + | `document_topic_node_id`, `measured_level`, `diagnostic_status`, `diagnostic_evidence` |
| `exam_prep_diagnostic_summaries` | Prep başına özet: overall measured, evidence, topic_results |

`exam_prep_topics.familiarity` = **öz-bildirim** (zor konular → `heard`).  
`measured_level` = **ölçülen** başlangıç (`unknown` \| `weak` \| `emerging` \| `solid`). Birbirinin üzerine yazılmaz.

### Runtime (bayrak açıkken)

| Yol | Davranış |
|---|---|
| `POST …/intake` | `documentId` + hazır topic map → `intakeMode: "v2"`, konu önerileri. `probeOnly: true` → AI/kredi yok. |
| `POST …/create` | Profil alanlarını kaydeder; topic map ana konularını prep topic’lere bağlar. |
| `POST …/intro` | Ana konuların hepsinden hafif örnekleme (beceri döngüsü: tanım→kavram→uygulama→yanılgı→çok adım). Okunamayan sayfalı konular `unreadable` / `unknown`. Sonuçta evidence + özet kaydı. |
| Bayrak kapalı | Eski intake / 5 soruluk tek-konu tanışma — değişmedi. |

Kaynak sınırı: tanı üretiminde `documents_only` (veya belgedeki mod) → `loadSourceContext` genel bilgiyle sessiz doldurmaz.

### UI

- Oluşturma: v2’de günlük süre, çalışma günleri, zor konular (öz-bildirim), öğrenme tercihi.
- Tanışma sonucu: başlangıç etiketi, konu bazlı ölçüm, **hangi cevaplar seviyeyi belirledi** listesi; öz-bildirim ayrı satır.

### Test

`tests/unit/diagnostic.test.ts` — planlama, skor, evidence, unreadable → unknown.

---

## 2. Tamamlanma kriteri

| Kriter | Durum |
|---|---|
| Hedef sınav + tarih, süre/gün, zor konular, tercihler (düzenlenebilir alanlar) | **Met** (kaydedilir; düzenleme UI Aşama 9’a bırakılabilir) |
| Kısa tanı ana konuların hepsini örnekler | **Met** (bayrak + topic map) |
| Öz-bildirim ≠ ölçülen | **Met** |
| Tanım / kavram / uygulama / çok adım / yanılgı (hafif) | **Met** (skill plan + prompt) |
| Az soru → ustalık iddiası yok; ölçülmeyen = unknown | **Met** (kopya + seviye tavanı “başlangıç”) |
| Hangi cevaplar seviyeyi belirledi gösterilir | **Met** (UI + `exam_prep_diagnostic_summaries`) |

---

## 3. Bayrak

Hâlâ **OFF önerilir** ta ki Stage 1–3 kodu production Ready olana kadar. Açmak: admin feature flags → PDF öğrenme v2. Kapatmak = kill-switch; legacy intro/create çalışır.

---

## 4. Manuel doğrulama

1. Bayrak kapalı: `/deneme-sinavlari/olustur` eskisi gibi; ekstra profil yok; tanışma 5 soru.
2. Bayrak aç + Stage 2 topic map’li belge seç → profil alanları; create sonrası tanışmada “Başlangıç tanısı”.
3. Sonucu bitir → evidence listesi + konu `measured` / `unreadable`.
4. DB: `familiarity` (öz-bildirim) ile `measured_level` farklı kalır; `exam_prep_diagnostic_summaries` satırı oluşur.
5. Yerel: `cd cortex-plus && npm test -- --run tests/unit/diagnostic.test.ts`

---

## 5. Rollback

Bayrağı kapat. DB additive — drop etme. Önceki Ready deploy.

---

## 6. Aşama 4’e hazır mı?

Evet, veri kancaları hazır: `daily_minutes`, `study_days`, `measured_level`, topic map bağları. Aşama 4 bunlarla gün/konu dağılımını yazmalı; Stage 3’te plan motoru değiştirilmedi (`buildExamPlan` aynı).

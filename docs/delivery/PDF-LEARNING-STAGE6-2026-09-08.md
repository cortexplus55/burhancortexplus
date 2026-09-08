# PDF öğrenme — Aşama 6 (8 Eylül 2026)

Amaç: **Program ilerlemesi ≠ konu hâkimiyeti ≠ sınava hazırlık tahmini**.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §8.  
Önceki: [PDF-LEARNING-STAGE5-2026-09-08.md](./PDF-LEARNING-STAGE5-2026-09-08.md).

**Durum:** Kod + additive migration. Bayrak `pdf_learning_v2` kapalıyken legacy tek “Çalışma ilerlemen” kalır.

---

## 1. Ne geldi

### Saf motor

`src/lib/learning/learning-tracking.ts`

| Gösterge | Anlam |
|---|---|
| Program ilerlemesi | Planlanan düğümlerin `done` oranı |
| Konu hâkimiyeti | Ölçülen kanıttan güven; ölçülmemiş = 0 güven |
| Sınava hazırlık tahmini | Ölçülen başarı + kapsam + mock + misconceptions; tamamlamak ≠ %100 |

Kurallar:

- Her cevap → `topic_key` + `learning_objective`
- İlk deneme / tekrar ayrımı (`attempt_ordinal`, `is_first_attempt`)
- İpucu yardımlı / bağımsız başarı (`hint_assisted`, `independent_success`)
- Yanlış türleri Stage 5 `exam_prep_misconceptions` ile; sonraki etkinlikte gaps/spaced tercihi
- Uzun süre çalışılmayan ölçülen konular `weakOrStaleTopicKeys` ile yeniden sonda
- **Kabul:** Tüm etkinlikler yanlışlarla bitse bile `claimFullyReady=false` ve hazırlık ≤ %25; “%100 Hazırsın” yok

### Kalıcılık

`learning-tracking-persist.ts` — complete sonrası (yalnızca bayrak açık):

- `exam_prep_answer_evidence` satırları
- `exam_prep_topic_mastery` upsert
- `exam_preps.learning_tracking` jsonb özet
- `readiness_score` kolonuna yalnızca **program** % yazılır (hazırlık iddiası değil)

### Şema

Migration: `20260908220000_pdf_learning_stage6_tracking.sql`

| Nesne | |
|---|---|
| `exam_prep_node_attempts.attempt_ordinal` | 1 = ilk |
| `exam_prep_node_attempts.answer_meta` | ipucu meta |
| `exam_preps.learning_tracking` | üç gösterge özeti |
| `exam_prep_answer_evidence` | cevap kanıtı |
| `exam_prep_topic_mastery` | konu ustalığı |

RLS: kullanıcı kendi satırını SELECT eder; yazma service role (API).

### UI

Hazırlık özeti (`ExamPrepHome`): bayrak açıkken üç ayrı metre. Sonuç ekranı: oturum skoru ≠ hazırlık notu.

### Test

`tests/unit/learning-tracking.test.ts` — anti-%100, unmeasured confidence 0, first/hint, next bias, stale.

---

## 2. Bayrak

Varsayılan **OFF**. Açıkken Stage 2–6 birlikte. Kapat = legacy ilerleme metni.

---

## 3. Rollback

Bayrağı kapat. Additive tablolara dokunma. Önceki Ready deploy.

---

## 4. Manuel doğrulama

(Commit sonrası doldurulur: üç gösterge + yanlışlarla bitişte hazırlık ≠ %100 + bayrak OFF.)

---

## 5. Bilinçli boşluklar

| Madde | Not |
|---|---|
| Quiz ipucu düğmesi | Oral’da “İpucu göster”; quiz reveal hâlâ cevap sonrası |
| Tam aralıklı tekrar motoru | Stale hook + bias; SM-2 yok |
| Aşama 7 doğrulama kapısı | Yapılmadı |

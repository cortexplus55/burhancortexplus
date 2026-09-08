# PDF öğrenme — Aşama 7 (9 Eylül 2026)

Amaç: **Ortak doğrulama katmanını sağlamlaştırma** — üretim kalite kapısı; şema + bağımsız kontroller + eğitim doğruluğu.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §9.  
Önceki: [PDF-LEARNING-STAGE6-2026-09-08.md](./PDF-LEARNING-STAGE6-2026-09-08.md).

**Durum:** Kod + additive migration. Bayrak `pdf_learning_v2` kapalıyken legacy gate (önceki `verifyEducationalContent`) kalır; v2 profili yalnızca bayrak açık yollarda.

---

## 1. Ne geldi

### Sıralı boru hattı

`src/lib/learning/validation-pipeline.ts`

| Aşama | Tür | Ne yapar |
|---|---|---|
| 1. structural | bağımsız | JSON, zorunlu alan, öğe sayısı, boş içerik, şık formatı |
| 2. source | bağımsız | kaynak alıntısı / sayfa id; documents_only için boş kaynak reddi |
| 3. domain | bağımsız | basit hesap eşitliği, tekrar şık, kaba birim çelişkisi |
| 4. pedagogy | bağımsız | Stage 5 teaching-standards validator çıktıları |
| 5. repair | LLM | sınırlı düzeltme (mevcut quality-gate) |
| 6. recheck | LLM + bağımsız | onarım **otomatik kabul edilmez**; taze review + bağımsız yeniden kontrol |
| 7. safe outcome | politika | başarısız içerik gösterilmez; net hata + retry |

Önemli sınır: İkinci AI çağrısı tek başına doğruluk garantisi değildir; ucuz bağımsız kontroller tercih edilir.

### Üretim entegrasyonu

| Parça | Davranış |
|---|---|
| `generateJson` | `validationProfile: "v2"` → sıralı boru + metrik + fail-closed; tek rezervasyon altında draft retry + isteğe bağlı independent-only kabul |
| `quality-gate` | `independent` + `failClosedOnUnavailable`; onarım sonrası recheck |
| `exam-quiz-generate` | tek `generateJson` (çift kredi yok); Stage 5 pedagogy + Stage 7 source |
| `exam-prep/node` | tüm v2 türleri `validationProfile: "v2"` + kaynak bağımsız kontrol |
| `exam-prep/lesson` | çift `generateJson` kaldırıldı; tek rezervasyon + fail closed |
| `diagnostic-generate` | dışarıdaki 2–3 kez çağrı kaldırıldı (çift ücret riski) |

Bayrak **kapalı**: eski `full`/`schema` davranışı; Stage 7 metrikleri v2 yollarında yazılır.

### Kredi

- Aynı kullanıcı işlemi için draft/repair/independent-accept **tek** `credit_reserve` (aynı reservation).
- Doğrulama servisi down (`validator_unavailable`) → 503, içerik yok, refund.
- Independent-only son çare yalnızca LLM review reddinden sonra; validator down iken **kullanılmaz**.

### Metrikler

Migration: `20260909010000_pdf_learning_stage7_validation.sql` → `ai_validation_events`

Alanlar: `action_code`, `activity_kind`, `outcome`, `failed_stage`, `failure_codes`, `generation_ms`, `validation_ms`, `stages_ms`, `repair_attempted`, `recheck_passed` — **prompt/taslak/PII yok**. Yapılandırılmış log: `ai_validation_event`.

### Test

`tests/unit/validation-pipeline.test.ts` — sıra, fail-fast, math, recheck no auto-accept.  
`tests/unit/quality-gate.test.ts` — onarım recheck + validator unavailable fail-closed.

---

## 2. Bayrak

Varsayılan **OFF**. Açıkken Stage 2–7 birlikte. Kapat = legacy üretim/gate.

---

## 3. Rollback

Bayrağı kapat. Additive `ai_validation_events` tablosuna dokunma. Önceki Ready deploy.

---

## 4. Manuel doğrulama (9 Eylül 2026)

1. Production `d03eabf` Ready (`dpl_HCB5E1WNsL9kAL72ptNmtgaDuDmA` → cortexplus.app). İlk `900a8b3` lint (prefer-const) ile ERROR; düzeltme sonrası Ready.
2. Bayrak geçici açıldı.
3. Stage4 Trigonometri Plan → Quiz düğümü: **200 / içerik geldi** — “Soru 1 / 5”, birim çember sinüs sorusu + A–D şıklar; boş ungated ekran yok.
4. `ai_validation_events`: `QUIZ_GENERATE` / `quiz` / `outcome=accepted` / `generation_ms≈6928` / `validation_ms≈1307` / `repair_attempted=false`.
5. Bayrak tekrar **OFF** (`enabled=false` doğrulandı).

---

## 5. Bilinçli boşluklar (tam §9’a göre)

| Madde | Not |
|---|---|
| Tam kaynak-iddia eşleştirme (embedding/citation entailment) | Heuristik sayfa + excerpt; semantik claim check yok |
| Dilbilgisi / tarih kuralları | Domain’de yalnızca kaba math/unit; tam NLP yok |
| Admin metrik paneli | Tablo + log var; UI dashboard yok |
| Aşama 8 idempotency/resume | Bilinçli olarak yapılmadı |

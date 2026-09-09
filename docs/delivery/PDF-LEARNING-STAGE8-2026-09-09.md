# PDF öğrenme — Aşama 8 (9 Eylül 2026)

Amaç: **Kayıt, kesinti ve tekrar deneme güvenliği** — çift ücret yok; yarıda kalan deneme güvenli devam.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §10.  
Önceki: [PDF-LEARNING-STAGE7-2026-09-09.md](./PDF-LEARNING-STAGE7-2026-09-09.md).

**Durum:** Kod + additive migration. Bayrak `pdf_learning_v2` kapalıyken legacy start/complete (önceki davranış); v2 yolları yalnızca bayrak açıkken.

---

## 1. Ne geldi

### Durumlar ve kimlikler

| Kavram | Nerede |
|---|---|
| `generation_id` | Her içerik üretimi için unique UUID |
| `client_request_id` | İstemci start anahtarı (sessionStorage) |
| `complete_request_id` | İstemci complete anahtarı |
| `content_version` | Cevap kaydı optimistic lock |
| Status | `creating` → `active` (ready) → `completed` / `failed` |

Migration: `20260909020000_pdf_learning_stage8_idempotency.sql`  
Tablo: `exam_prep_generation_jobs` (in-flight + credit key).  
RPC: `save_exam_prep_node_answers` (generation + version guard).

### API (`/api/learning/exam-prep/node`, bayrak ON)

| Action | Davranış |
|---|---|
| `start` + aynı `clientRequestId` | Aynı attempt/payload; **ikinci charge yok** |
| `start` (aktif attempt var, key yok) | Resume (yeniden üretmez) |
| `resume` | Aktif attempt + kaydedilmiş cevaplar + cursor |
| `save` | Cevapları yaz; stale generation/version → 409 |
| `complete` | Kaydedilmiş + gönderilen cevapları birleştir; çift complete → stored score; stale generation → 409 |

Kredi: `exam_node_start_{user}_{node}_{clientRequestId}` → `generateJson` / `generateExamQuiz` aynı rezervasyon.

### İstemci

`ExamNodeSession` + `resumeEnabled` (sayfa bayraktan):

- Mount’ta `resume`
- Stabil `clientRequestId` (sessionStorage)
- Cevap değişince debounced `save`
- Start/complete in-flight debounce
- Complete öncesi son save; `completeRequestId` sabit

### Saf yardımcılar

`src/lib/learning/attempt-lifecycle.ts` — merge, stale guard, state map.  
`attempt-lifecycle-persist.ts` — DB.

### Test

- `tests/unit/attempt-lifecycle.test.ts`
- `tests/unit/exam-node-stage8-idempotency.test.ts` — çift start, çift complete, resume, son cevabın skora girmesi

---

## 2. Bayrak

Varsayılan **OFF**. Açıkken Stage 2–8 birlikte. Kapat = legacy node yolu (idempotency client alanları yok sayılır / resume kapalı).

---

## 3. Rollback

Bayrağı kapat. Additive kolon/tabloya dokunma. Önceki Ready deploy.

---

## 4. Manuel doğrulama (9 Eylül 2026)

1. Production Ready: `d07e97c` / `dpl_BckSmtsiULCqynuFtZRL4ZXgS9gX` → cortexplus.app (önceki `da0e167` prefer-const ERROR).
2. Bayrak geçici açıldı.
3. Stage4 Trigonometri Plan → Quiz düğümü: yenilemeden önce cevap C (90°) kaydedildi (`content_version=2`, `answers.0=90°`); yenileme sonrası **"Kaldığın yer açılıyor…"** → aynı soru, **C seçili** (yeniden ücret yok).
4. Aynı attempt için çift `complete` (aynı `completeRequestId`): 1. yanıt `score=2/5`; 2. yanıt `idempotent:true` + aynı skor.
5. Bayrak tekrar **OFF** (`enabled=false` doğrulandı).

---

## 5. Bilinçli boşluklar

| Madde | Not |
|---|---|
| Intro / lesson / mock-exam aynı lifecycle | Node odaklı; diğer yüzeyler sonraki dilim |
| Stüdyo (`/api/learning/quiz/generate` vb.) | Hâlâ ayrı credit key (Aşama 1 borcu) |
| Cross-device resume | sessionStorage cihaz-yerel; DB attempt yine resume API ile açılır |
| Aşama 9 UI cilası | Minimal “Kaldığın yer açılıyor”; tam sonuç UI ayrı |

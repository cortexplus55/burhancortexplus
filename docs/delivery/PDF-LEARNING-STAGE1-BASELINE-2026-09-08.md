# PDF öğrenme — Aşama 1 baseline (8 Eylül 2026)

Amaç: mevcut sistemi güvenilir baseline yapmak. Aşama 2–10 uygulanmadı.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md).  
Önceki rollback notu: [LEARNING-ROLLBACK.md](./LEARNING-ROLLBACK.md).

---

## 1. Hedef doğrulama — PASS

| Hedef | Kanıt | Sonuç |
|---|---|---|
| Canlı site | `cortexplus.app` alias → production deploy `dpl_DksgQkwW2xmnPunKWrZCv4MRyuVK` | PASS |
| GitHub | `cortexplus55/burhancortexplus`, main SHA `6d657c92f386089fcf80b8f1a8a4a6e79e13b3b5` | PASS |
| Vercel | scope `cortexplus55` (`team_7fZJmWjbQtKXSDwCZCA4s7Ym`) → `burhancortexplus-app` (`prj_fBxyWhMERs4pZUq9sJMaVa9Gt29A`); Git link aynı repo | PASS |
| Supabase | proje `Cortex Plus` ref `dgjfyewgrukglsehyntc`, `ACTIVE_HEALTHY`, URL `https://dgjfyewgrukglsehyntc.supabase.co` | PASS |
| Canlı istemci | `/giris` chunk `app/giris/page-7db7d171d37ce9f4.js` içinde `dgjfyewgrukglsehyntc` | PASS |
| Yerel repo | `origin` aynı GitHub; HEAD = production SHA | PASS |

Yanlış proje deploy riski bu tur için **kapalı**. Yerel `vercel` CLI hâlâ yanlış hesapta olabilir; deploy için `git push origin main` + panel/MCP doğrulaması tercih edilir (`AGENTS.md`).

### Üretim sürümü

- Commit: `6d657c9` — *fix: stop study generation when selected source is unavailable*
- Deployment: Ready, Production, aliases: `cortexplus.app`, `www.cortexplus.app`, …
- Inspector: `https://vercel.com/cortexplus55/burhancortexplus-app/DksgQkwW2xmnPunKWrZCv4MRyuVK`
- Rollback adayları (READY): `6d657c9` ve bir önceki `e6e7b1e` (`dpl_5U2TuitqBLHHbf3em5hqG1qKM9nR`)

---

## 2. Üretim DB — PDF / sınav hazırlığı ile ilgili

### Applied migrations (PDF/öğrenme için kritik olanlar)

Son uygulama: `20260907211748_atomic_exam_prep_graph` (`create_exam_prep_graph`, `complete_exam_prep_node` canlıda mevcut).

Öncekilerden ilgili: `plus_parity_exam_flow`, `exam_prep_*`, `node_calibration_and_readiness`, `prep_source_grounding`, `lesson_audio`, `mistake_notebook`, belgeler/RAG (`init`, `storage`, `rag_and_policies`).

### Canlı satır özeti (8 Eylül 2026)

| Tablo / nesne | Sayı / durum |
|---|---|
| `exam_preps` | 3 |
| `exam_prep_nodes` | 42 |
| `exam_prep_node_attempts` | 21 |
| `exam_prep_topics` | 21 |
| `documents` completed | 2 |
| `document_chunks` / embeddings | 57 / 57 |
| `feature_flags` | **0 satır** |
| Atomic RPCs | `create_exam_prep_graph`, `complete_exam_prep_node` |

### Feature flag durumu

Tablo ve admin UI (`/admin/feature-flags`) var; bilinen UI anahtarları: `rag_sources`, `paytr_live`.  
**Runtime kodda `feature_flags` okunmuyor** — panel toggle’ı şu an kill-switch değil. PDF öğrenme için ayrı anahtar yok.

---

## 3. Uçtan uca yol haritası

### Ana öğrenci akışı (PDF → plan → içerik → cevap → puan)

```
/dokumanlar  →  POST /api/documents/upload  →  POST /api/documents/process
     → documents + pages/chunks/embeddings (RAG)
/deneme-sinavlari (veya sinav-hazirligi)  →  ExamCreateChat
     → POST /api/learning/exam-prep/intake   (AI draft; kredi)
     → POST /api/learning/exam-prep/create  (RPC create_exam_prep_graph; kredi yok)
/deneme-sinavlari/[prepId]/tanisma
     → POST /api/learning/exam-prep/intro start|complete
/deneme-sinavlari/[prepId]/dugum/[nodeId]
     → POST /api/learning/exam-prep/node start  (üretim + attempt yaz)
     → POST /api/learning/exam-prep/node complete (skor + RPC complete_exam_prep_node)
Opsiyonel: lesson, mock-exam, coach, voice, feedback
```

### Yol A — Belge yükleme ve işleme

| | |
|---|---|
| **UI** | `document-upload.tsx`, `/dokumanlar`, chat ekleri |
| **API** | `POST /api/documents/upload`, `POST /api/documents/process`, `GET /api/documents` |
| **Lib** | `store-upload.ts`, `rag/pipeline` (`processDocument`) |
| **Kredi** | Process: `DOCUMENT_PAGE_PROCESS` (2 kredi), idempotency `document_process_{id}`; upload ücretsiz (kota byte) |
| **Hata/retry** | Process fail → `credit_refund`; UI `document-retry-button` aynı process endpoint’i; completed ise no-op |
| **Kalıcılık** | `documents`, `document_pages`, `document_chunks`, `document_embeddings`, `processing_jobs` |

### Yol B — Hazırlık oluşturma

| | |
|---|---|
| **UI** | `exam-create-chat.tsx` → `/deneme-sinavlari` |
| **API** | `intake` (generateJson `STUDY_PLAN_GENERATE`), `create` → `insertExamPrepGraph` |
| **Plan** | `buildExamPlan(days)` — gün sayısına göre sabit düğüm şablonu; PDF konu haritası değil |
| **Kredi** | Intake ücretli; create ücretsiz (yalnız DB) |
| **Hata** | Create tek RPC; kısmi insert yok. Eski `ensurePrepNodes` ayrı insert yolu hâlâ legacy prep’ler için var |
| **Kalıcılık** | `exam_preps` (+ `document_id`), `exam_prep_topics`, `study_plans`/`study_plan_tasks`, `exam_prep_nodes` |

### Yol C — Tanışma (intro quiz)

| | |
|---|---|
| **API** | `POST /api/learning/exam-prep/intro` |
| **Üretim** | `generateExamQuiz` + `loadSourceContext` (seçili belge zorunlu bağ) |
| **Kredi** | `QUIZ_GENERATE` (2) |
| **Complete** | `exam_prep_intro_attempts` + `exam_preps.intro_completed_at` (atomic RPC değil) |
| **Hata** | Kaynak yok/hata → `source_unavailable` (üretim yok) |

### Yol D — Düğüm etkinliği (asıl çalışma)

| | |
|---|---|
| **API** | `POST /api/learning/exam-prep/node` `start` / `complete` |
| **Üretim** | kind’e göre quiz / TF / cards / oral / podcast (`generateNodePayload`) |
| **Kaynak** | `loadSourceContext`; seçili `document_id` boş/hata → üretim yok |
| **Kredi** | start: kind → `QUIZ_GENERATE` / `FLASHCARD_GENERATE` / `STUDY_PLAN_GENERATE`; oral complete ayrıca `PRACTICE_EXAM_GRADE` |
| **Complete** | `complete_exam_prep_node` RPC; `attemptId` zorunlu tercih |
| **Kalıcılık** | `exam_prep_node_attempts.payload`, skor; node status unlock; topic familiarity; `study_session_moods` |

### Yol E — Konu dersi / deneme

| | |
|---|---|
| **Lesson** | `POST /api/learning/exam-prep/lesson` → `exam_prep_lessons`; `STUDY_PLAN_GENERATE`; fail olsa bile fallback markdown yazılabilir (kredi refund generateJson içinde, satır yine insert) |
| **Mock** | `POST /api/learning/exam-prep/mock-exam` → `practice_exams` + questions; `PRACTICE_EXAM_GENERATE` (4) |

### Yan yollar (stüdyo — aynı iş, ayrı API)

`/api/learning/quiz|flashcards|true-false|oral|podcast|exam|study-plan/generate` — sınav hazırlığı grafından bağımsız stüdyo üretimi. Aynı `generateJson` / kredi kuralları.

---

## 4. Kredi, hata, retry, yazma davranışları

### Ortak AI yolu (`lib/ai/generate.ts`)

1. `credit_reserve` + yeni UUID idempotency key (**her çağrı yeni key** → kullanıcı retry = yeniden ücret riski)
2. Model çağrısı + `verifyEducationalContent`
3. Parse fail / verification fail / provider hata → `credit_refund`
4. Başarı → `credit_commit` + `ai_usage_events` (üretim + doğrulama modelleri)

### Canlı kredi kuralları (öğrenme ile ilgili)

| action_code | maliyet |
|---|---|
| DOCUMENT_PAGE_PROCESS | 2 |
| QUIZ_GENERATE | 2 |
| FLASHCARD_GENERATE | 2 |
| STUDY_PLAN_GENERATE | 2 |
| PRACTICE_EXAM_GENERATE | 4 |
| PRACTICE_EXAM_GRADE | 3 |
| AI_CHAT_STANDARD | 1 |

### Riskler (Aşama 1 kaydı)

1. **Retry çift ücret:** Node/intro/intake yeniden `start` → yeni rezervasyon; başarılı eski attempt yanına yeni active attempt.
2. **Lesson fallback yazımı:** AI fail sonrası yine `exam_prep_lessons` satırı (içerik “henüz üretilemedi”).
3. **Intro complete atomik değil:** attempt + prep update ayrı; orta hata tutarsızlık riski (node complete RPC ile düzeltilmiş; intro değil).
4. **Voice mode:** node start kaynak aramasını atlar (`EMPTY_SOURCE_CONTEXT`) — PDF grounding bypass.
5. **ensurePrepNodes:** RPC dışı legacy node insert; yeni create yolu kullanmaz ama eski prep açılışında çalışabilir.
6. **Supabase panel “No backups”:** veri dönüştüren migration öncesi doğrulanmış yedek şart ([LEARNING-ROLLBACK.md](./LEARNING-ROLLBACK.md)).

---

## 5. Çift / paralel üretim yolları

| İş | Yol 1 (exam-prep) | Yol 2 (stüdyo / diğer) |
|---|---|---|
| Çoktan seçmeli | `exam-prep/node` + `exam-prep/intro` → `generateExamQuiz` | `/api/learning/quiz/generate` (kendi credit_reserve) |
| Doğru/yanlış | `node` kind `true_false` | `/api/learning/true-false/generate` |
| Flashcard | `node` flashcards/spaced | `/api/learning/flashcards/generate` |
| Sözlü | `node` oral (+ grade) | `/api/learning/oral/generate` + `oral/grade` |
| Podcast | `node` podcast | `/api/learning/podcast/generate` |
| Deneme | `exam-prep/mock-exam` | `/api/learning/exam/generate` |
| Plan metni | `intake` + `lesson` (`STUDY_PLAN_GENERATE`) | `/api/learning/study-plan/generate` |
| PDF sohbette | RAG process + exam-prep source | `/api/ai/chat` belge indirme / uzun sohbet |

Aşama 2+’ta tek “PDF öğrenme motoru”na yakınsama önerilir; stüdyo bilinçli ayrı yüzey olarak kalabilir.

---

## 6. Geçiş planı — mevcut öğrenci prep’lerini koruma

İlkeler:

1. **Mevcut tabloları silme / rename etme.** Yeni infra sütun veya yan tablolar ekler (`pdf_topic_maps` vb. Aşama 2).
2. **`exam_preps.id` ve `document_id` sabit kalır.** UI URL’leri (`/deneme-sinavlari/[prepId]/…`) kırılmaz.
3. **Okuma yolu:** Eski prep’ler `buildExamPlan` düğümleriyle çalışmaya devam; yeni konu haritası yoksa mevcut `exam_prep_topics.label` listesi kullanılır.
4. **Yazma yolu:** Yeni create hâlâ `create_exam_prep_graph` RPC; schema genişlemesi additive + default NULL.
5. **Backfill isteğe bağlı ve offline:** PDF topic map sonradan job ile doldurulur; zorunlu değil.
6. **App deploy sırası:** Önce DB additive migration, sonra kod; kod eski satırları okuyabilmeli.
7. **Rollback:** Vercel’de önceki Ready production’a dön (`e6e7b1e` veya bilinen iyi SHA). Yeni RPC’ler yerinde kalır (geriye uyumlu). Tablo drop yok. Ayrıntı: [LEARNING-ROLLBACK.md](./LEARNING-ROLLBACK.md).

Öğrenci etkisi: Açık prep’ler, denemeler, attempt payload’ları bozulmadan okunur; yalnızca yeni özellik bayraklıysa yeni UI/üretim devreye girer.

---

## 7. Feature-flag / kill-switch önerisi (uygulanmadı — Aşama 1 dokümantasyon)

**Neden şimdi kod yok:** `feature_flags` runtime’da hiç okunmuyor; yarım bayrak yanlış güvenlik hissi verir. Kill-switch Aşama 2 koduyla birlikte, okuma helper + tek giriş noktası ile eklenmeli.

### Önerilen tasarım

| Anahtar | Varsayılan | Etki (kapalıyken) |
|---|---|---|
| `pdf_learning_v2` | `false` | Yeni konu haritası / kapsam / tanı yolları kapalı; mevcut exam-prep node/intro/create **açık kalır** |
| (opsiyonel) `exam_prep_generation` | `true` | Acil: tüm prep AI üretimini 503 `feature_disabled` — yalnızca gerçek olayda |

### Dosya konumları

| Dosya | Değişiklik |
|---|---|
| `supabase/migrations/…_pdf_learning_flags.sql` | `INSERT INTO feature_flags (key, enabled, description) …` |
| `src/lib/admin/feature-flags.ts` (yeni) | `isFeatureEnabled(service, key)` cache’li okuma |
| `src/app/admin/feature-flags/page.tsx` | `KNOWN` listesine `pdf_learning_v2` |
| `src/app/api/learning/exam-prep/*` | Yalnızca **yeni** v2 endpoint’lerde gate |
| `src/components/parity/exam-create-chat.tsx` | v2 UI parçaları bayrağa bağlı |

Acil rollback = Vercel previous deploy (bayraksız da çalışır). Bayrak, kademeli açılış içindir.

---

## 8. Aşama 1 kabul kriterleri

| Kriter | Durum |
|---|---|
| Kullanıcı eylemi → üretim + kalıcılık haritası | **Tamam** (bu belge §3–5) |
| Yanlış proje riski | **PASS / cleared** (§1) |
| Mevcut prep’ler gelecek işte kullanılabilir plan | **Yazıldı** (§6) |
| Rollback yolu | **Dokümante** (§7 + LEARNING-ROLLBACK); trivial kod gerekmedi |

---

## 9. Boşluklar — Aşama 2’ye hazır olmayanlar

- PDF’ten otomatik konu haritası / sayfa kapsamı yok (`buildExamPlan` şablon).
- Tanı intro quiz’i var ama öğrenme kaydı / mastery tabloları (`mastery_scores` 0 satır) ürün akışına bağlı değil.
- Feature flag runtime yok.
- Supabase automated backup paneli boş görünüyor.
- Stüdyo vs exam-prep çift yollar birleştirilmedi.
- Voice mode kaynak atlıyor.
- Intro complete hâlâ non-atomic.
- Üretim kalite: doğrulama katmanı var (`verifyEducationalContent`) ama konu-kapsam garantisi yok.

**Önerilen sonraki adım:** Aşama 2 — seçili belgeden topic map + coverage + prep bağlama (additive schema + `pdf_learning_v2` bayrağı ile).

---

## 10. Kullanıcıdan beklenen (blocker değil)

- Aşama 2’ye geç onayı.
- İleride veri dönüştüren migration öncesi Supabase yedek doğrulaması.
- Kill-switch’in Aşama 2 ile birlikte uygulanması onayı (bu turda yalnızca öneri).

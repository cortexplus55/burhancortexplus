# PDF öğrenme — Aşama 5 (8 Eylül 2026)

Amaç: Etkinlik türlerine özel **öğretim standardı** (şema + doğrulayıcı + prompt kısıtı).  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §7.  
Önceki: [PDF-LEARNING-STAGE4-2026-09-08.md](./PDF-LEARNING-STAGE4-2026-09-08.md).

**Durum:** Kod + additive migration. Bayrak `pdf_learning_v2` kapalıyken legacy üretim aynen kalır.

---

## 1. Ne geldi

### Paylaşılan sözleşme

`src/lib/learning/teaching-standards.ts`

| Parça | İçerik |
|---|---|
| `teachingActivityForKind` | Node kind → intro_qa / lesson / quiz / true_false / podcast / flashcards / oral / written |
| `parseSessionMeta` + `teachingSessionContext` | Stage 4 `session_meta` (topic, objective, pages, role) → prompt |
| `teachingStandardConstraints` | §7.1–7.7 prompt kısıtları |
| Validators | lesson, quiz, TF, flashcard, podcast, oral — deterministik `string[]` issues |
| `scoreFlashcardsV2` | “Biliyorum” ≠ sınav ustalığı (katılım skoru) |
| `extractMisconceptions` | Yanlış quiz/TF → Stage 6 hook |

### Runtime (bayrak açık)

| Yol | Davranış |
|---|---|
| `POST …/exam-prep/node` | session_meta + kaynak sınırı (`documents_only` varsayılan); tür bazlı şema/validator; doğrulama başarısızsa fail closed; misconception kaydı |
| `POST …/exam-prep/lesson` | v2 ders şeması (hedef → açıklama → örnek → yaygın hata → infoCheck → özet); kaynak yoksa / doğrulanamazsa **placeholder yazılmaz** |
| Quiz üretimi | `learningObjective` zorunlu; multi yalnızca gerçek çoklu doğruda; hepsi/hiçbiri yasak |
| Podcast | Tanım→Neden→Örnek→Hata→Özet; kısa TTS satırları |
| Flashcards | Cevap sızıntısı yok; hard önce; skor masteryClaim=false |
| Oral | Rubrik + expectedPoints; not gerekçesi / eksik hedefler |
| TF | misconceptionTag; belirsiz genelleme reddi |

Bayrak **kapalı**: eski şema/prompt/skor; misconception tablosuna yazılmaz.

### Şema

Migration: `20260908210000_pdf_learning_stage5_teaching.sql` (`exam_prep_misconceptions`)

RLS: kullanıcı kendi satırını SELECT eder. Yazma service role (API) üzerinden.

### Test

`tests/unit/teaching-standards.test.ts` — sözleşme, validator, misconception extract, flashcard skor.

---

## 2. Bayrak

Varsayılan **OFF**. Açıkken Stage 2–5 birlikte. Kapat = legacy üretim.

---

## 3. Rollback

Bayrağı kapat. Additive tabloya dokunma. Önceki Ready deploy.

---

## 4. Manuel doğrulama (8 Eylül 2026 akşam)

1. Production `fbedd83` Ready (`dpl_351SFMKtQUb83jmpk6pkLM15s3td`).
2. Bayrak geçici açıldı → Stage4 Trigonometri Plan hazırlığı.
3. Learn/podcast node: 200 — bölümler Tanım→Neden→Örnek→Yaygın hata→Özet; `teachingStandard=podcast`; kaynak noktaları dolu.
4. Practice/quiz node: 200 — 5 soru, explanation var; `teachingStandard=quiz` (schema fallback sonrası).
5. Topic lesson API: 200 — v2 ders kaydı (`Öğrenme hedefi` / yaygın hata / bilgi kontrolü).
6. Bayrak tekrar **OFF**.

## 5. Kapsam / boşluklar (tam §7’ye göre)

| § | Durum |
|---|---|
| 7.1 Intro Q&A | Prompt + quiz pedagojisi; tam kademeli ipucu UI / çözüm-gösterme döngüsü kısmi |
| 7.2 Lesson | Met (v2 şema + fail closed) |
| 7.3 Quiz | Met (validator + objective) |
| 7.4 True/false | Met (+ misconceptionTag) |
| 7.5 Podcast | Met (yapı + TTS satır); ses başarısızlığında bölüm koruma mevcut oynatıcıya bağlı |
| 7.6 Flashcards | Met (üretim + skor); aralıklı tekrar motoru Stage 6 |
| 7.7 Oral/written | Oral rubrik met; yazılı = sıkı quiz prompt; tam kısmi puan motoru kısmi |

Stage 6 (ustalık / hazırlık metrikleri) bilinçli olarak **yapılmadı** — yalnızca misconception hook.

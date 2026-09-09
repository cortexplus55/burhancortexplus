# PDF öğrenme — Aşama 10 (9 Eylül 2026)

Amaç: **Kalite test matrisi** — belge / ders / öğrenci davranışı / teknik senaryolar; §13 karşılaştırma notları; §15 yayın hazırlığı dürüst kontrol listesi.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md) §12–15.  
Önceki: [PDF-LEARNING-STAGE9-2026-09-09.md](./PDF-LEARNING-STAGE9-2026-09-09.md).

**Durum:** Birim matrisi + probe + sayfa analizi bugfix’leri. Bayrak `pdf_learning_v2` **OFF** bırakılır. Kontrollü yayın (herkese açma) bu aşamanın çıktısı değildir — sonraki izleme adımıdır.

---

## 1. Matris sonuçları

### Belge çeşitleri

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| Metin katmanlı PDF | PASS | `pdf-learning-stage10-quality` + probe `doc/text-pdf` + canlı trig PDF 20 sayfa / 7 konu |
| Taranmış / OCR boşluğu | PASS | Unreadable + `extractionMethod=none`; OCR **yok** (bilinçli limit) |
| Formül/grafik ağır | PASS | Formül ≥4 → “görsel analiz henüz yok” (bugfix: kısa sayfada da) |
| Tablo | PASS | Markdown tablo regex düzeltmesi |
| Uzun belge (~40) | PASS | Fizik fikstürü; kısa TOC/cevap artık unreadable değil |
| Okunamayan sayfalar | PASS | Blank/thin raporlanır; coverage `blocked` if no content |
| Tekrarlayan konular | PASS | Birleşik “Birim çember” |
| Çoklu belge | SKIP | Ürün `exam_preps.document_id` tekil; birim concat simülasyonu var |

### Ders çeşitleri (domain / topic seed)

| Ders | Sonuç |
|---|---|
| Matematik (trig) | PASS |
| Fizik | PASS (`Kuvvet ve hareket`) |
| Kimya | PASS (`Kimyasal tepkimeler` + mol/g unit) |
| Biyoloji | PASS (`Hücre ve enerji` + imkânsız %) |
| Tarih | PASS |
| Coğrafya | PASS |
| Türkçe | PASS |

### Öğrenci davranışları

| Senaryo | Sonuç |
|---|---|
| Doğru | PASS |
| Kısmi | PASS — program %100 ≠ hazırlık %100 |
| Yaygın yanlış | PASS — misconception tag |
| Boş | PASS — skor 0 |
| İlgisiz uzun metin | PASS — uzunluk kapısı ≠ mastery |
| İpucu | PASS — independentSuccess false |
| Yeniden çöz | PASS — isFirstAttempt false |
| Ortada bırak | PASS — resume/reuse helpers |
| Gün kaçırma | PASS — missedIncompleteGroups |
| Sınav tarihi değiştir | PASS — redistributeRemainingSchedule |

### Teknik senaryolar

| Senaryo | Sonuç | Not |
|---|---|---|
| Refresh / cevap birleştirme | PASS | Unit + Stage 8 route |
| Bağlantı kopması / stale gen | PASS | `isStaleWrite` |
| Üretim zaman aşımı | PASS | `isCreatingStale` |
| Çift tıklama / sürüm | PASS | content_version |
| İki sekme aynı deneme | PASS | stale version |
| Yetersiz kredi | PASS (sözleşme) | `insufficient_credits` → 402 |
| Doğrulama servisi fail | PASS | fail-closed structural |
| Mobil / dar görünüm | BROWSER | Stage 9’da ~390 doğrulandı; Stage 10 smoke’da tekrar |
| Eski prep / yeni sürüm | PASS | boş topic indicators legacy progress |
| Üç metre anti-%100 | PASS | unit + browser smoke |

Probe: `node scripts/probe-pdf-learning-stage10.mjs [pdf]` → **19 pass / 0 fail / 1 skip** (trig PDF ile).

Yerel: **50 dosya, 407 test**.

---

## 2. Bu turda düzeltilen bug’lar

| Bug | Düzeltme |
|---|---|
| Kısa TOC / cevap anahtarı `unreadable` sayılıyordu | `classifyPageKind`: cover/toc/answer önce |
| Markdown tabloları tespit edilmiyordu | `TABLE_HINT` hücresel pipe deseni |
| Formül yoğun kısa sayfa “çok kısa” deyip görsel gap kaçırıyordu | Belirsizlik sırası: formül-ağır önce |
| Öğretim sayfası yokken coverage `complete` olabiliyordu | `contentPages === 0` → `blocked` |
| Trig `denklem`/`grafik` seed’leri kimya/coğrafyayı yanlış sınıflıyordu | Bağlamlı pattern; `DOMAIN_SPLITTERS` eklendi |
| Domain: mol/g ve imkânsız % yoktu | `checkImpossiblePercentClaims` + unit genişletme |

---

## 3. §13 — Astra karşılaştırma yöntemi (uydurma yok)

| Kural | Uygulama |
|---|---|
| Aynı PDF, aynı hedef tarih | Trig PDF + mevcut prep gözlemleri (Stage 9 / TRIGONOMETRY karşılaştırması) |
| Parite değil öğrenme kalitesi | Matris Astra ekran listesi istemez |
| Gözlem kaydı | Bu dosya + önceki karşılaştırma notları |
| Yeni Astra “şartı” uydurma | Yok |

---

## 4. §15 — Yayın hazırlığı kontrol listesi

| Madde | Durum | Not |
|---|---|---|
| Özellik bayrağı (`pdf_learning_v2`) | **Met** | Varsayılan OFF; kill-switch |
| Rollback (bayrağı kapat) | **Met** | Additive şema; bayrak OFF = legacy |
| Vercel previous deploy rollback | **Met** | Panelden önceki Ready |
| İzleme (validation events / hatalar) | **Partial** | `ai_validation_events` var; kontrollü yayın dashboard’u yok |
| DB yedek (panel) | **Blocked / borç** | Stage 1: “No backups”; veri dönüştüren migration öncesi yedek şart |
| OCR / vision | **Known limit** | Yok; taranmış → unreadable |
| Çoklu belge / prep | **Known limit** | Tek `document_id` |
| Herkese kontrollü yayın | **Not done** | Aşama 10 sonrası izleme + kademeli açılış |

**Özet:** Launch-ready for **flagged internal QA**; **not** ready for broad student rollout until backup + monitoring + controlled publish plan close.

---

## 5. Bayrak

Smoke sırasında geçici ON → bitince **OFF**. Production’da açık bırakılmaz.

---

## 6. Aşama 10 sonrası kalanlar

1. Kontrollü yayın izleme planı (örnek kullanıcı / hata oranı).
2. Supabase yedek doğrulama.
3. OCR/vision dilimi (ayrı ürün kararı).
4. İsteğe bağlı çoklu belge bağlama.
5. Canlı üretim kalitesinin (model) sürekli örneklemesi — birim matris bunu garanti etmez.

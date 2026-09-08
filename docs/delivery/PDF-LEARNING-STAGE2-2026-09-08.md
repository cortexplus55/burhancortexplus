# PDF öğrenme — Aşama 2 (8 Eylül 2026)

Amaç: PDF’i eksiksiz anlama temeli — sayfa meta, konu haritası, kapsam denetimi, kaynak sınırı, runtime `pdf_learning_v2` bayrağı.  
Plan: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md).  
Baseline: [PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md](./PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md).

**Durum:** Temel dilim uygulandı (kod + canlı migration). Bayrak **varsayılan kapalı**. Aşama 3+ tanı/plan henüz yok.

---

## 1. Ne geldi

### Şema (additive, Supabase `dgjfyewgrukglsehyntc`)

Migration: `cortex-plus/supabase/migrations/20260908152147_pdf_learning_v2.sql` — canlıya MCP `apply_migration` ile uygulandı (`pdf_learning_v2`).

| Nesne | İçerik |
|---|---|
| `document_pages` + | `extraction_ok`, `page_kind`, `headings`, `formulas`, `tables_detected`, `images_detected`, `uncertain_regions`, `extraction_method`, `char_count` |
| `documents` + | `source_boundary_mode` (`documents_only` \| `allow_supporting`), `topic_map_status`, `topic_map_error`, `topic_map_updated_at` |
| `document_topic_nodes` | Konu ağacı: başlık, öğrenme hedefi, önkoşul, tanım/ilişki/örnek/hata/alıştırma, öğrenci notu |
| `document_topic_page_links` | Konu ↔ sayfa |
| `document_coverage_reports` | Kapsam özeti (atlanan / okunamayan / bağlanmayan sayfalar) |
| `feature_flags.pdf_learning_v2` | `enabled=false` satırı |

Mevcut `exam_preps` / `exam_prep_*` / chunk satırlarına dokunulmadı; drop yok.

### Runtime bayrak

- Okuyucu: `src/lib/admin/feature-flags.ts` → `isFeatureEnabled`
- Admin UI: `/admin/feature-flags` KNOWN listesine eklendi
- Gate: yalnızca process sonrası v2 zenginleştirme + `/api/documents/[id]/topic-map` + `/dokumanlar/[id]`

### İşleme yolu

`processDocument` (RAG) klasik sayfa/chunk/embedding yolunu korur. Bayrak **açıksa** tamamlandıktan sonra `runPdfLearningV2`:

1. Sayfa analizi (heuristic: kapak/TOC/cevap/boş/okunamaz, başlık, formül ipuçları)
2. Konu haritası (trigonometri alt konular ayrı izlenebilir; benzer başlık birleştirme)
3. Kapsam raporu (her içerik sayfası ≥1 konu; boşluklar açık)

Bayrak **kapalıysa** v2 çalışmaz; exam-prep / klasik process değişmez. Yeniden işlemede sayfa silinince eski topic satırları da temizlenir (orphan önleme).

### API / UI

| | |
|---|---|
| `GET/PATCH/POST /api/documents/[documentId]/topic-map` | Okuma, düzenleme (başlık/hedef/not/sil + kaynak sınırı), `action: rebuild` |
| `/dokumanlar/[documentId]` | Konu haritası + kapsam + kaynak sınırı editörü |
| `/dokumanlar` | Bayrak açıksa “Konu haritası” linki |

### Test / probe

- `tests/unit/pdf-learning-v2.test.ts` — ~20 sayfalık trigonometri fikstürü, kapsam `complete`
- `tests/unit/feature-flags.test.ts`
- `scripts/probe-pdf-learning-coverage.mjs` — AI/Supabase yok; isteğe bağlı PDF yolu

---

## 2. Bayrağı açma

1. Admin: `https://cortexplus.app/admin/feature-flags` → **PDF öğrenme v2** → Aç  
   veya SQL: `update feature_flags set enabled = true where key = 'pdf_learning_v2';`
2. Kodun production’da bu commit ile deploy edilmiş olması gerekir (bayrak tek başına UI/API getirmez).
3. Öğrenci: hazır belgeyi `/dokumanlar` → yeniden işle **veya** tamamlanmış belge için konu haritası sayfasında “Haritayı yeniden oluştur”.
4. Kapatma = kill-switch: yeni v2 yolları 404/`redirect`; mevcut prep node/intro/create etkilenmez.

---

## 3. Tamamlanma kriterine göre

| Kriter | Durum |
|---|---|
| Sayfa meta (numara, metin, başlık, formül ipucu, başarı, belirsiz bölgeler) | **Kısmi** — text-layer heuristic; OCR/görsel analiz yok |
| Konu haritası yapısı (hedef, önkoşul, sayfa, tanım/örnek/hata/alıştırma) | **Kısmi** — alanlar var; çıkarım heuristic (AI zenginleştirme yok) |
| Kapsam: her öğretim sayfası ≥1 konu; atlanan/okunamayan rapor | **Met (fixture)**; gerçek PDF’lerde text-layer kalitesine bağlı |
| Kaynak sınırı iki mod | **Şema + UI**; üretim (ders/quiz) henüz moda göre dallanmıyor — Aşama 3+ |
| Öğrenci haritayı düzenleyebilsin | **Evet** (temel editör) |
| Sessiz kaynak-sız devamı kötüleştirmemek | **Korundu** — bayrak kapalıyken eski yollar; v2 okunamaz sayfaları raporlar, genel bilgiyle doldurmaz |

**Özet:** Aşama 2 ürün kriteri **kısmen** karşılandı — sağlam temel + bayraklı yol; OCR/görsel ve üretimde kaynak-sınırı zorunluluğu sonraki dilim.

---

## 4. Bilinen boşluklar

- OCR yok (taranmış PDF → `unreadable` / `extraction_method=none`)
- Formül/grafik için vision yok
- Topic map AI ile derinleştirilmiyor (kredi/CI güvenliği)
- Exam-prep create hâlâ `buildExamPlan` gün şablonu — konu haritasına bağlama Aşama 3/4
- Stüdyo vs exam-prep birleştirilmedi (bilinçli)
- `allow_supporting` etiketli üretim yok

---

## 5. Manuel doğrulama (production)

1. Deploy sonrası admin’de `pdf_learning_v2` **kapalı** → `/dokumanlar`’da “Konu haritası” linki yok; exam-prep oluşturma/çalışma eskisi gibi.
2. Bayrağı **aç** → yeni PDF yükle + işle (veya mevcut completed belgede rebuild).
3. `/dokumanlar/[id]`: konular, kapsam özeti, okunamayan sayfalar; başlık düzenle → Kaydet → “Gözden geçirdim”.
4. Kaynak sınırı değiştir; DB’de `documents.source_boundary_mode` güncellensin.
5. Bayrağı kapat → konu haritası URL’si `/dokumanlar`’a yönlensin; açık prep’ler bozulmasın.
6. Yerel: `cd cortex-plus && npm test -- --run tests/unit/pdf-learning-v2.test.ts`  
   Probe: `node scripts/probe-pdf-learning-coverage.mjs`  
   İsteğe bağlı: `node scripts/probe-pdf-learning-coverage.mjs ../tmp/user-trigonometri.pdf`

---

## 6. Rollback

- Acil: bayrağı kapat (kod deploy’lu kalsa bile v2 API/UI susar).
- Deploy: önceki Ready production SHA.
- DB: tablolar additive; drop etme. Eski prep satırları bağımsız.

---

## 7. Önerilen Aşama 3 başlangıcı

Tanı ölçümü: intro/quiz’i `document_topic_nodes` ile hizala; konu bazlı aşinalık kaydı; okunamayan sayfalar tanıya “kapsam dışı / ölçülemedi” olarak girsin. Kaynak sınırı `documents_only` iken tanı ve ders üretiminde `loadSourceContext` + konu sayfa aralığı zorunlu kalsın.

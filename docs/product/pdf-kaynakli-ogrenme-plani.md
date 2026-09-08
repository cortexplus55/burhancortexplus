# Cortex Plus — PDF Kaynaklı Öğrenme Altyapısı ve Kalite Planı

Kaynak: kullanıcı ürün planı (16 bölüm). Kalıcı kopya: 8 Eylül 2026.  
Kuzey yıldızı: Cortex Plus öğrencisine öğretmek. Astra yalnızca karşılaştırma referansıdır; “Astra’da var” tek başına iş gerekçesi değildir (`AGENTS.md`).

İlgili gözlemler: [ASTRA-PDF-OBSERVED-FLOW-2026-09-07.md](../delivery/ASTRA-PDF-OBSERVED-FLOW-2026-09-07.md), [TRIGONOMETRY-PDF-COMPARISON-2026-09-07.md](../delivery/TRIGONOMETRY-PDF-COMPARISON-2026-09-07.md).  
Aşama 1 baseline kaydı: [PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md](../delivery/PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md).

---

## 1. Hedef UX

Öğrenci PDF yükler → sistem belgeyi anlar → konu haritası ve kapsam çıkarır → tanı ölçer → sınav tarihine göre plan üretir → etkinliklerle öğretir → cevaplara göre ilerleme/ustalık/hazırlık izler → kesintiye dayanıklı devam → sonuç ekranı net ayrım gösterir.

## 2. Mevcut boşluklar (plan özeti)

- PDF’ten tam konu haritası / sayfa-kapsam bağlama yok veya zayıf.
- Tanı ve öğrenme kaydı yetersiz ayrışmış olabilir.
- Tarih/süre/konuya göre gerçek dağılım sınırlı.
- Etkinlik türlerine özel öğretim standardı eksik.
- İlerleme ≠ ustalık ≠ hazırlık ayrımı ürün iddiasında netleşmeli.
- Doğrulama, idempotency, resume katmanı güçlendirilmeli.
- UI ve kalite testleri ayrı aşamalar.

## 3. Aşama 1 — Güvenilir baseline

Hedefleri doğrula; üretim sürümü ve DB değişimlerini kaydet; uçtan uca yolları haritala; kredi/hata/retry/yazma davranışlarını çıkar; çift üretim yollarını bul; mevcut prep kayıtlarını koruyan geçiş planı yaz; özellik bayrağı / kill-switch yaklaşımı öner veya hazırla.

**Kabul:** Yol haritası net; yanlış proje riski kapalı; prep’ler korunur; rollback dokümante.

## 4. Aşama 2 — Tam PDF anlama + konu haritası + kapsam

Belge parçaları, konu ağacı, sayfa/bölüm kapsamı, hazırlığa bağlama.

## 5. Aşama 3 — Tanı ölçümü

İlk seviye/aşinalık; zayıf-güçlü konu; kayıt.

## 6. Aşama 4 — Sınav tarihine göre plan

Gün/süre/konu dağılımı; öncelik.

## 7. Aşama 5 — Etkinlik öğretim standartları

Podcast, quiz, doğru/yanlış, flashcard, sözlü, yazılı vb. için içerik sözleşmesi.

## 8. Aşama 6 — Öğrenme takibi

Progress vs mastery vs readiness ayrı metrikler.

## 9. Aşama 7 — Doğrulama katmanı

Üretim kalite kapısı; şema + eğitim doğruluğu.

## 10. Aşama 8 — Idempotency / resume

Çift ücret yok; yarıda kalan üretim/deneme güvenli devam.

## 11. Aşama 9 — UI

Çalışma yolu, sonuç, net etiketler.

## 12. Aşama 10 — Kalite testleri

Aynı PDF uçtan uca; çok ders; kontrollü yayın.

## 13. Astra karşılaştırma yöntemi

Aynı PDF, aynı hedef tarih; gözlem kaydı; parite değil öğrenme kalitesi ölçütü.

## 14. Teslim sırası

Aşama 1 → 2 → … → 10. Önceki aşama kabul edilmeden sonrakine geçilmez.

## 15. Yayın hazırlığı

Bayrak, rollback, izleme, yedek (özellikle veri dönüştüren migration öncesi).

## 16. Cortex avantajları

Öğrenci-only odak; kredi şeffaflığı; kaynak bağlama; kendi belgesinden öğretim; güvenli kayıt (atomic graph).

---

Uygulama durumu takibi ayrıca: [LEARNING-IMPLEMENTATION-STATUS.md](../delivery/LEARNING-IMPLEMENTATION-STATUS.md).

# Öğrenme altyapısı uygulama ve kabul kaydı

Başlangıç: 8 Eylül 2026. Kullanıcı bütün aşamaların uygulanmasını ve yalnızca doğrulanan madde için “Madde N sorunsuz halledildi” denmesini istedi.

Kalıcı ürün planı: [pdf-kaynakli-ogrenme-plani.md](../product/pdf-kaynakli-ogrenme-plani.md).  
Aşama 1 baseline kaydı (8 Eylül 2026 akşam): [PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md](./PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md).

## Sıralı teslimler

1. Mevcut altyapı, veri bütünlüğü ve kontrollü geçiş — **Aşama 1 baseline haritası tamam** (hedef PASS, yol haritası, geçiş/rollback, bayrak önerisi). Üretim kalite/e2e açık maddeler Aşama 2+ ile devam.
2. PDF konu haritası ve kapsam — **Aşama 2 temel dilim tamam** (şema + `pdf_learning_v2` runtime + heuristic harita/kapsam + UI; bayrak varsayılan kapalı). Tam kriter (OCR/vision, üretimde kaynak sınırı) kısmi — bkz. [PDF-LEARNING-STAGE2-2026-09-08.md](./PDF-LEARNING-STAGE2-2026-09-08.md).
3. Tanı ölçümü ve öğrenci öğrenme kaydı — **Aşama 3 temel dilim tamam** (intake profili + topic-map tanı + öz-bildirim/ölçüm ayrımı + evidence UI; bayrak kapalı). Bkz. [PDF-LEARNING-STAGE3-2026-09-08.md](./PDF-LEARNING-STAGE3-2026-09-08.md).
4. Tarih/süre/konuya göre çalışma dağılımı — **Aşama 4 temel dilim tamam** (saf plan motoru + bayraklı create + additive şema; bayrak kapalıyken legacy `buildExamPlan`). Bkz. [PDF-LEARNING-STAGE4-2026-09-08.md](./PDF-LEARNING-STAGE4-2026-09-08.md).
5. Etkinlik türlerine özel öğretim — **Aşama 5 temel dilim tamam** (paylaşılan teaching-standards sözleşmesi + bayraklı node/lesson üretimi + misconception hook; bayrak kapalı). Bkz. [PDF-LEARNING-STAGE5-2026-09-08.md](./PDF-LEARNING-STAGE5-2026-09-08.md).
6. Cevaplara göre tekrar ve sonraki ders — **Aşama 6 temel dilim tamam** (ilerleme / ustalık / hazırlık ayrımı + evidence + anti-%100; bayrak kapalı). Bkz. [PDF-LEARNING-STAGE6-2026-09-08.md](./PDF-LEARNING-STAGE6-2026-09-08.md).
7. Doğrulama, kayıt ve kesinti güvenliği — bekliyor.
8. Çalışma yolu ve sonuç arayüzü — bekliyor.
9. Aynı PDF ile uçtan uca karşılaştırma — bekliyor.
10. Farklı dersler, kontrollü yayın ve izleme — bekliyor.

Bu sıralama onaylanan planın uygulama/teslim sırasıdır; önceki metindeki açıklama bölümleri ayrı tamamlanmış işler değildir.

## Madde 1 kanıtları

- Canlı /giris istemci paketlerinden okunan Supabase ref: dgjfyewgrukglsehyntc.
- Chrome Vercel Git ayarları: cortexplus55/burhancortexplus bağlı.
- Vercel production dağıtımı: 335b6fc, Ready (panelden doğrulandı).
- Supabase Chrome paneli: Cortex Plus, Healthy; son migration subscription_expiry_guards.
- Panelde son yedek: No backups. Geri dönüş hazırlığı ayrıca tamamlanmalı.
- Yerel başlangıç testleri: 36 dosya, 281 test geçti.
- Kayıt güvenliği değişikliği sonrası: 38 dosya, 290 test; üretim derlemesi geçti.
- Vercel ve Supabase bağlayıcıları yetki hatası verdi. Yetkili Chrome panelleri çalışıyor; bağlayıcı bağlantısı sağlıklı kabul edilmedi.

## Açık kayıt bütünlüğü bulguları

- exam-prep-insert: kaynaksız geri dönüş kaldırıldı; tüm hazırlık tek RPC işlemine taşındı. ff163a1 ile yayımlandı.
- Hazırlık ve tamamlama fonksiyonları canlı Supabase SQL Editor üzerinden eklendi. Mevcut satırlar değiştirilmedi.
- Canlı transaction testi PASS: geç aşamadaki hatada altı tablonun sayıları değişmiyor, başka kullanıcı belgesi reddediliyor, hazırlık bütünlüğü korunuyor, tekrar tamamlamada puan/sonraki kilit değişmiyor, anonim/kullanıcı rolü fonksiyonları çağıramıyor. Test verileri ROLLBACK ile kaldırıldı.
- node complete: aktif denemesiz tamamlama engellendi; tarayıcı kendi attemptId değerini gönderiyor. ff163a1 ile yayımlandı.
- Canlı veri sorgusu: düğümsüz hazırlık, tamamlanmış denemesiz done düğüm, belge/deneme sahibi uyuşmazlığı dört kontrolde de 0.
- Yeni migration kaydı 20260907211748 adıyla uzakta doğrulandı (6 statement). Tarihsel migration farkları ayrıca incelenmeli.
- ff163a1 kayıt güvenliği ve 73ba9f2 ilerleme metni düzeltmeleri main'e gönderildi; 73ba9f2 Vercel Production Ready doğrulandı.
- readinessScore yalnızca etkinlik durumundan türetiliyor. Arayüz "Çalışma ilerlemen" olarak düzeltildi; "Hazırsın" iddiası kaldırıldı.
- Canlı uçtan uca testte doğru/yanlış sorusu yerine "Açı nedir?" görüldü. Etkinlik sözleşmesi ve bağımsız model onayı birlikte zorunlu hale getirildi; soru cümlesi/tekrar/eksik düzeltme reddediliyor. Yerel 297 test geçti; bu kalite düzeltmesinin canlı yeniden testi bekliyor.
- ba6f5bb GitHub main üzerinde doğrulandı. Otomatik Vercel dağıtımı listede oluşmadığı için doğru proje panelinde Create Deployment → main → ba6f5bb → Production yolu kullanıldı. FYvmtWxFQmZsiuXcu1iqiyXsKtKR, Ready, Production Current ve cortexplus.app alan adı doğrulandı. Otomatik tetikleme sorunu çözülmüş sayılmaz.
- Yeni tarayıcı sayfasında "Çalışma ilerlemen", "Etkinlikler tamamlandı" ve ustalığı ölçmediğini belirten açıklama canlı doğrulandı.

Madde 1’in **baseline harita / hedef doğrulama / geçiş planı** kısmı Stage-1 notunda kapatıldı. Canlı üretim kalitesi, backup ve v2 bayrak uygulaması hâlâ açık; bunlar Madde 1’in “sorunsuz kabul” barını tek başına karşılamaz — Aşama 2 öncesi bilinçli borç olarak durur.

## Son kontrol — 8 Eylül akşam (Aşama 6 öğrenme takibi)

- Aşama 6 kod + migration + doküman: [PDF-LEARNING-STAGE6-2026-09-08.md](./PDF-LEARNING-STAGE6-2026-09-08.md).
- `pdf_learning_v2` kapalıyken legacy “Çalışma ilerlemen”; açıkken üç gösterge + evidence yazımı.
- Birim: `learning-tracking` — yanlışlarla %100 program ≠ hazırlık; ölçülmemiş güven 0.

## Son kontrol — 8 Eylül akşam (Aşama 5 öğretim standardı)

- Aşama 5 kod + migration + doküman: [PDF-LEARNING-STAGE5-2026-09-08.md](./PDF-LEARNING-STAGE5-2026-09-08.md).
- `pdf_learning_v2` kapalıyken legacy node/lesson; açıkken teaching-standards + kaynak sınırı + fail closed.
- Birim: `teaching-standards` — lesson/quiz/TF/flashcard/podcast/oral validator + misconception extract.

## Son kontrol — 8 Eylül akşam (Aşama 4 plan)

- Aşama 4 kod + migration + doküman: [PDF-LEARNING-STAGE4-2026-09-08.md](./PDF-LEARNING-STAGE4-2026-09-08.md).
- `pdf_learning_v2` kapalıyken legacy plan; açıkken konu haritası + süre/gün ile gerçek dağılım.
- Birim: `exam-schedule-v2` — 3/7/14 aynı liste uzatması değil; sığmama dürüst seçenekler; kaçırılan gün redistribute.

## Son kontrol — 8 Eylül akşam (Aşama 3 tanı)

- Aşama 3 kod + migration + doküman: [PDF-LEARNING-STAGE3-2026-09-08.md](./PDF-LEARNING-STAGE3-2026-09-08.md). Canlı DB’de stage3 kolonları/tablosu var; `pdf_learning_v2` **enabled=false**.
- Intake/create/intro bayraklı; legacy yol bayrak kapalıyken korunur.
- Geçerli sıra (Aşama 6 sonrası): **Aşama 7 bekliyor** (doğrulama katmanı).

## Son kontrol — 8 Eylül akşam (Aşama 2 temel dilim)

- Aşama 2 kod + migration + doküman: [PDF-LEARNING-STAGE2-2026-09-08.md](./PDF-LEARNING-STAGE2-2026-09-08.md). Canlı DB’de `pdf_learning_v2` satırı var, **enabled=false**.
- Yerel birim: `pdf-learning-v2` + `feature-flags` + RLS tabloları geçti (~20 sayfa fikstür kapsam `complete`).
- Aşama 2 ürün kriteri kısmi (OCR/vision ve üretimde kaynak-sınırı dallanması açık).

## Son kontrol — 8 Eylül akşam (Aşama 1 baseline)

- Production Current: `6d657c9` / `dpl_DksgQkwW2xmnPunKWrZCv4MRyuVK` → `cortexplus.app`; canlı `/giris` JS ref `dgjfyewgrukglsehyntc`.
- Aşama 1 hedef/yol/geçiş/bayrak önerisi: [PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md](./PDF-LEARNING-STAGE1-BASELINE-2026-09-08.md).
- Aşama 2 temel dilim yukarıda; Madde 1’in “canlı kalite sorunsuz” barı hâlâ açık borç.

## Son kontrol — 8 Eylül, 13:20 İstanbul

- Geçerli sıra o sırada: **Madde 1 / 10**, hâlâ açık.
- e6e7b1e için GitHub Vercel durumu success; canlı arayüzde kalıcı üretim hatası mesajı görüldü. Canlı doğru/yanlış üretimi başarıyla bitmiş sayılmıyor.
- Aynı hazırlık ve kaynak ile yerel sağlayıcı/doğrulama denemesi başarılı: 4 kaynak parçası, gpt-4o-mini taslağı ve bağımsız denetim. Bu sonuç production ortamının sağlıklı olduğunu kanıtlamaz.
- Chrome bağlantısı yanıt vermiyor; doğru Vercel proje kimliğiyle kayıt bağlayıcısı 403 döndürüyor. Uygulama tarayıcısındaki Vercel ekranı giriş istiyor. Yeni canlı hata ayrıntısı bu nedenle henüz okunamadı.
- Ek düzeltme: seçilmiş belge araması hata/boş içerik döndürürse tanışma ve metin tabanlı düğüm üretimi source_unavailable ile durur. Düğümün belge ilişkisi sorgulanamazsa da üretime geçilmez. Testler bu durumda model çağrısı ve deneme kaydı başlamadığını doğruluyor.
- Yerel testler: **39 dosya, 304 test geçti**; tür kontrolü geçti.
- Bu kaynak düzeltmesi tam PDF kapsam haritası değildir. Sesli oturumun kaynak bağlantısı, kaynak parçalarının konu kapsamı ve kaynak dışı tamamlama politikası hâlâ açık işlerdir.

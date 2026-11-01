# AGENTS.md — Cortex Plus çalışma kuralları

Bu depoda çalışan her ajan (insan ya da yapay zekâ) aşağıdaki kurallara uyar. Kurallar 1 Kasım 2026'da kurucu onayıyla (R1–R3) yazıldı.

## 1. İçerik kaynağı ve özgünlük
- Üretilen her soru ve konu içeriği `origin='cortex_original'` ile kaydedilir.
- Çıkmış soru metni hiçbir yerde saklanmaz, kopyalanmaz, gösterilmez. Yalnızca resmî kaynağa dış bağlantı verilir.
- Müfredat ve sınav yapısı yalnız resmî kaynaktan gelir (MEB, ÖSYM, YÖK). Kaynak URL'si ve belgenin özeti (sha256) kayıt defterinde tutulur. Konu uydurulmaz.

## 2. Ortak havuz (read-through cache)
- Doğrulanmış içerik ortak havuzdan **0 model çağrısıyla** sunulur; hedef 100 ms'nin altında.
- Iska durumunda: üret → doğrula → havuza yaz → sun. Doğrulanmamış içerik havuza yazılmaz.
- `topic_content` ünite düzeyindedir. `item_bank` kayıtları `unit_id` ve `outcome_id` ile etiketlenir.

## 3. Kurulum akışı
- Resmî sınav kurulumu kayıt defterinden gelir: kurulum sırasında model çağrısı ve belge sorusu yok. Belge yükleme isteğe bağlı ve ikincil.
- YKS'de alan süzgeci (TYT / SAY / EA / SÖZ / DİL) ÖSYM kılavuzundaki puan türü tablolarına göre ders seçer.
- Ekranda vaat edilen sayı (ders / ünite / kazanım) hazırlık yoluna giden sayıyla birebir aynıdır.
- Kayıt defteri JSON'u istemci paketine girmez; istemci ağacı API'den alır.

## 4. Kısa seviye tespiti
- Varsayılan: 10–12 soruluk **'⚡ Akıllı Hızlı Tarama'**, sonuç Biliyorum / Orta / Zayıf.
- Ünite başında **'Ünite Seviye Kontrolü'**.
- İsteğe bağlı: **'🔍 Bu Ders İçin Tam Seviye Tespiti Çöz'**.

## 5. Dürüst etiketler
- TUS/DUS için ağaç adı **'Tıp/Akademik Müfredat Konu Ağacı'** (kaynak: YÖK UÇEP). Asla 'ÖSYM' denmez.
- YDT için kazanım yoktur; arayüz bunu açıkça söyler, kazanım uydurulmaz.
- Arayüz metinleri Türkçe; kodda rakip ürün adı geçmez.

## 6. Güvenlik ve veri
- Veritabanı değişiklikleri yalnız ekleyicidir (additive); sütun / tablo silinmez, test verisi silinmez.
- Kod geneldir (sınav adına göre dallanan özel durum yazılmaz); veriler kayıt defterindedir.

## 7. Teslim
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` yeşil olmadan birleştirme yok.
- Her PR: CI ve Vercel yeşil → squash-merge → üretimde doğrulama.

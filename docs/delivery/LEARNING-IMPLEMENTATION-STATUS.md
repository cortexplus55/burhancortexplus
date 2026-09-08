# Öğrenme altyapısı uygulama ve kabul kaydı

Başlangıç: 8 Eylül 2026. Kullanıcı bütün aşamaların uygulanmasını ve yalnızca doğrulanan madde için “Madde N sorunsuz halledildi” denmesini istedi.

## Sıralı teslimler

1. Mevcut altyapı, veri bütünlüğü ve kontrollü geçiş — devam ediyor.
2. PDF konu haritası ve kapsam — bekliyor.
3. Tanı ölçümü ve öğrenci öğrenme kaydı — bekliyor.
4. Tarih/süre/konuya göre çalışma dağılımı — bekliyor.
5. Etkinlik türlerine özel öğretim — bekliyor.
6. Cevaplara göre tekrar ve sonraki ders — bekliyor.
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

- exam-prep-insert: kaynaksız geri dönüş kaldırıldı; tüm hazırlık tek RPC işlemine taşındı. Uygulama değişikliği henüz yayında değil.
- Hazırlık ve tamamlama fonksiyonları canlı Supabase SQL Editor üzerinden eklendi. Mevcut satırlar değiştirilmedi.
- Canlı transaction testi PASS: geç aşamadaki hatada altı tablonun sayıları değişmiyor, başka kullanıcı belgesi reddediliyor, hazırlık bütünlüğü korunuyor, tekrar tamamlamada puan/sonraki kilit değişmiyor, anonim/kullanıcı rolü fonksiyonları çağıramıyor. Test verileri ROLLBACK ile kaldırıldı.
- node complete: aktif denemesiz tamamlama engellendi; tarayıcı kendi attemptId değerini gönderiyor. Uygulama değişikliği henüz yayında değil.
- Canlı veri sorgusu: düğümsüz hazırlık, tamamlanmış denemesiz done düğüm, belge/deneme sahibi uyuşmazlığı dört kontrolde de 0.
- Yeni migration kaydı 20260907211748 adıyla uzakta doğrulandı (6 statement). Tarihsel migration farkları ayrıca incelenmeli.
- ff163a1 kayıt güvenliği ve 73ba9f2 ilerleme metni düzeltmeleri main'e gönderildi; 73ba9f2 Vercel Production Ready doğrulandı.
- readinessScore yalnızca etkinlik durumundan türetiliyor. Arayüz "Çalışma ilerlemen" olarak düzeltildi; "Hazırsın" iddiası kaldırıldı.
- Canlı uçtan uca testte doğru/yanlış sorusu yerine "Açı nedir?" görüldü. Etkinlik sözleşmesi ve bağımsız model onayı birlikte zorunlu hale getirildi; soru cümlesi/tekrar/eksik düzeltme reddediliyor. Yerel 297 test geçti; bu kalite düzeltmesinin canlı yeniden testi bekliyor.

Madde 1 henüz kapatılmadı. Testlerin geçmesi bu açık bulguları ortadan kaldırmaz.

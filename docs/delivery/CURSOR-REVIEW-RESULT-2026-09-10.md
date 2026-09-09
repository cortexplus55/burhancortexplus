# Cursor değişiklikleri: doğrulanmış teslim durumu

10 Eylül 2026. Bu belge tüm ürünün Astra ile eşdeğer olduğunu iddia etmez.

## Yayımlanan dört düzeltme

Commit `ac32d51`; Vercel production `CieFcdsPbWd4h7LkKTvAExtMZNkj`, Ready (panelden doğrulandı). Tek hedef: cortexplus55/burhancortexplus → burhancortexplus-app → cortexplus.app.

1. Podcast bölümleri ve ders bölümleri kendi şemalarına göre kontrol ediliyor; geçerli içerik yanlış alan beklentisi yüzünden reddedilmiyor.
2. Matematik kontrolü negatif/ondalıklı sayıları ve doğru-yanlış/distraktör bağlamını ayırıyor. Doğru ifadede boş opsiyonel düzeltme kabul ediliyor; yanlış ifadede gerçek düzeltme zorunlu. Bu bir genel matematik ispatlayıcısı değildir.
3. Aynı istemci anahtarıyla devam eden üretim ikinci kez başlatılmıyor; eski üretimi devralma koşullu güncelleme kullanıyor. Sağlayıcı çağrıları zamanla sınırlı.
4. Cevap kayıtları sırayla gönderiliyor; sürüm başarılı yanıttan sonra ilerliyor. Kayıt hatası görünür, yeniden denenebilir; bekleyen kayıtta çıkış uyarılıyor. Tamamlama yanıtı kaybolursa tekrar tamamlama yolu korunuyor. Tarayıcı çökmesine dayanıklı çevrimdışı taslak deposu yok.

## Beşinci düzeltme: kod hazır, canlı uygulama bekliyor

Plan tarihini/tercihlerini yeniden dağıtma, başlanmış ve tamamlanmış etkinlikleri koruyan tek PostgreSQL işlemi kullanacak. SQL dosyası: `cortex-plus/supabase/migrations/20260909150826_atomic_reschedule_preserve_attempts.sql`.

Yerel regresyon: geç aşama insert hatasında tam rollback; başlamış deneme/cevap korunması; tek hazır düğüm; sahiplik kontrolü; eski planla çakışan yazının reddi geçti (`npm run test:db`).

Canlı dgjfyewgrukglsehyntc projesinde RPC sorgusu PGRST202 döndürdü: fonksiyon yok. Supabase connector yetki hatası; CLI Unauthorized; IAB GitHub/Supabase giriş ekranında; eski Chrome bağlı değil. Bu nedenle bu değişikliğin çağıran kodu main'e gönderilmedi. Kullanıcı verisine yıkıcı bir yedek yol eklenmedi.

Devam sırası: doğru Supabase oturumunu aç → migration uygula → fonksiyon/yetki ve migration kaydını doğrula → ilgili route/helper ve test bağımlılığını commit/push et → üretimde izole test hazırlığında tarih değiştir → mevcut attempt ID ve cevaplarının korunduğunu doğrula. Mevcut kullanıcı planını kontrolsüz tekrar dağıtma.

## Kanıt ve ek bulgu

- 422 birim testi, 53 dosya: geçti. TypeScript kontrolü geçti.
- ac32d51 production derlemesi geçti.
- Gerçek trigonometri PDF kaynağı ile sağlayıcı üretimi + içerik kalite geçidi valid:true döndü. Bu bir API/arayüz uçtan uca testi değildir.
- Canlı `/deneme-sinavlari/db9b08dd-0efa-4457-ae36-aef40fbd2942` açıldı: 14 günlük yol, %100 etkinlik ilerlemesi, %17 ölçülen konu hâkimiyeti, %12 hazırlık, 1 ölçülen/10 ölçülmemiş konu görünüyor. Tamamlanan etkinlikler tüm konular öğrenildi anlamına gelmiyor.
- Aynı ekranda 12/11 gün farkı gözlendi. Sunucu UTC, tarayıcı yerel takvimi kullanıyordu; `daysUntilExam` Türkiye takvimini ortak kullanacak şekilde düzeltildi, gece yarısı sınırı test edildi.

## Astra için halen kanıtlanmamış alanlar

Astra'nın aynı hazırlığı açıldı (7501226): 5 konu, %5 ilerleme, %75 hedef. Birebir iç mimarisi gözlemlenemiyor.

Tam 20 sayfanın konu/öğrenme hedefi kapsamı, tüm derslerde soru doğruluğu, gerçek podcast sesi ve kaynak sadakati, 14 günlük uyarlamalı tekrarın uçtan uca davranışı ve ağ kesintisi/yenileme senaryolarının tamamı bu teslimle doğrulanmış değildir. Tarama PDF/OCR desteği yok; kaynak kesitli bir üretim testi tüm belge kapsamını kanıtlamaz. Bu alanlar kapatılmadan “eksiksiz, sorunsuz, Astra ile aynı” sonucu çıkarılmamalıdır.

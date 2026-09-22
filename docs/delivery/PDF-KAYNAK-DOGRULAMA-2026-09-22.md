# Madde 2 — PDF kaynak okuma ve devam sayfaları

22 Eylül 2026. Başlangıç sürümü: `b5486dabb33a34150f92767d6ddf3b51491adf1e`.

## Düzeltilen davranış

- Sayfa listesi belli bir konuda istenen fiziksel sayfalardan biri eksik, boş, çıkarımı başarısız veya okunamazsa `source_unavailable` döner. Kısmi kaynak kabul edilmez; benzerlik aramasıyla başka parçalar kullanılarak devam edilmez. Sayfa listesi olmayan eski planların kaynak araması korunur.
- Veritabanı sorgu hatası ve eksik belge aynı şekilde üretimi durdurur. Yinelenen sayfa numaraları tekilleştirilir; geçersiz numaralar sorgudan önce reddedilir.
- Metin bütçesi nedeniyle kısaltılan sayfalar kaynak bloğunda açıkça işaretlenir. Önceki “konunun TAM metni” iddiası kaldırıldı. Fiziksel sayfa etiketleri, formüller ve yalnızca belgeye dayanma kuralı korunur.
- Modelin atladığı bir bölüm sonradan listeye eklenmiş olsa da sahipsiz devam sayfası dizi sırasına göre yanlış konuya bağlanmaz. Sayfanın başlığı önceliklidir; eşleşme yoksa fiziksel sayfa sırasındaki en yakın önceki konu kullanılır.
- Bağlantılar tamamlandıktan sonra konu tanımları, bağıntılar, örnekler, yaygın hatalar ve kaynak soruları son sayfa listesinden yeniden çıkarılır. Sadece sayfa numarasının eklenip kaynak özetinin eski kalması giderildi.

## Doğrulama

- Değişikliklerin odak testleri: **4 dosyada 40 test geçti**.
- Tüm birim testleri: **93 dosyada 1.001 test geçti**.
- `npm run typecheck`, `npm run build` ve `git diff --check` geçti.
- Gerçek kaynak okuyucusunu kullanan API testleri: ders, quiz, doğru/yanlış, kart, podcast, sözlü ve yazılı sınavda eksik sayfa HTTP 503 / `source_unavailable` üretir. Model, kaynak araması, kredi RPC'si ve ilerleme yazımı çağrılmaz.
- Canlı `cortexplus.app` istemcisi `dgjfyewgrukglsehyntc` Supabase projesini kullanıyor. Vercel Git panelinde `cortexplus55/burhancortexplus-app` projesinin bağlı deposu `cortexplus55/burhancortexplus` olarak görüldü. Yerel Vercel CLI kullanılmadı.
- Canlı veritabanına salt okunur deneme: `71cd76fd-3ea2-4c4e-b6a0-d90b344ec937`, `trigonometri_20_sayfa_detayli.pdf`, `completed`, 20 sayfa; okunamaz işaretli sayfa yok. Kayıtlı 7 belge konusunun her birindeki istenen sayfalar güncellenmiş okuyucuyla yüklendi ve fiziksel sayfa etiketleri doğrulandı. `[3,9999]` isteği beklenen hata ile reddedildi. Bu denemede veri yazılmadı ve model çağrılmadı.
- İki sayfalık kaynak okuması bu tek denemede 278 ms sürdü. Bu süre ders üretimi veya uçtan uca yanıt süresi değildir.

## Sınır ve kalan kabul adımı

Bu düzeltme yeni oluşturulan konu haritalarını ve fiziksel sayfa listesi olan üretimleri etkiler. Önceden kaydedilmiş haritaları veya bitirilmiş öğrenci çalışmalarını otomatik olarak yeniden yazmaz.

Örnek PDF'nin eski haritasında öğrenci tarafından düzenlenmiş başlık, “Sayfa 3 içeriği” başlığı ve konu başına 8–11 sayfaya yayılan eski bağlantılar var. Kaynakların okunabilmesi bu eşleşmelerin anlamsal olarak doğru olduğunu kanıtlamaz. Kullanıcıya eski çalışmayı koruyarak ayrı kopyada yeniden oluşturma ile mevcut haritayı yenileme seçenekleri sunuldu; mevcut harita henüz değiştirilmedi.

Yeni haritadan üretilmiş derslerin bütün kavramları işlemesi ve yeni API ile model kalitesi ayrıca sınanmalı. Kısaltmanın dürüstçe belirtilmesi, kısaltılan metindeki her kavramın öğretilmesi demek değildir. Bu kayıttaki testler Astra ile eşdeğer içerik kalitesi veya bütün ürünün sorunsuz olduğu iddiası taşımaz.

Başlangıç sürümünün CI tarayıcı testlerindeki iki hata (eski ana sayfa başlığı beklentisi ve CI fiyat verisi) bu maddenin dışında kaldı; tam CI yeşil iddiası yok.

# Öğrenme kaydı değişikliğinin yayın ve geri dönüşü

8 Eylül 2026. Tek proje: cortexplus55/burhancortexplus → burhancortexplus-app → cortexplus.app; Supabase dgjfyewgrukglsehyntc.

## Bu teslim

20260907211748_atomic_exam_prep_graph yalnızca iki yeni sunucu fonksiyonu ekler. Var olan tablo/sütun/veri silinmez veya dönüştürülmez. Önce fonksiyonlar, ardından uygulama yayımlanır. Uygulama yeni fonksiyonlar yokken yayımlanmamalıdır.

SQL Editor üzerinde supabase/tests/atomic_exam_prep_graph.sql kontrolü geçti. Başarılı ve başarısız hazırlıklar, kaynak sahibi ve yinelenen tamamlama test edildi; testin bütün satırları ROLLBACK ile kaldırıldı. Bu kontrol eşzamanlı yük testi veya bütün veritabanının yedeği değildir.

## Geri dönüş

1. Vercel'in doğru proje panelinden önceki Ready production sürümüne dönülür; başlangıç sürümü 335b6fc.
2. Yeni fonksiyonlar geriye uyumlu olduğundan yerlerinde bırakılır. Eski kod bunları çağırmaz. Böylece yeni oluşturulmuş öğrenci kayıtları korunur.
3. Fonksiyonları kaldırmak ancak onları kullanan hiçbir dağıtım kalmadığı doğrulandığında değerlendirilir. Tablo/veri silinmez, migration geçmişi elle geriye çekilmez.
4. Giriş, bir mevcut hazırlığı açma ve sonuç görüntüleme canlı tarayıcıdan doğrulanır.

Supabase paneli ilk denetimde "No backups" gösterdi. Bu teslim genel yedekleme sorununu çözmez. Veri dönüştüren sonraki migration öncesinde geri yüklemesi doğrulanmış bir yedek gereklidir.

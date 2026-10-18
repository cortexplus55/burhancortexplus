# Supabase duraklama / veritabanına ulaşılamıyor

## Belirti
- Giriş ve bütün oturumlu sayfalar 500; `/admin/sistem` veritabanı satırı kırmızı; Supabase'den
  "project paused" e-postası.
- Daha hafif biçimi: ara ara zaman aşımı — bağlantı sınırı (Free planda 60) dolmuştur.

## Bakılacak yer
- Supabase paneli → proje `dgjfyewgrukglsehyntc` → durum (Paused / Active), Reports → bağlantı sayısı,
  Logs → Postgres. Bölge Frankfurt; fonksiyonlar da `fra1` (başka bölgeye alma).
- Free plan 7 gün etkinlik görmezse projeyi duraklatır. Günlük cron'lar (`subscription-renewal` 06:00,
  `study-reminders` 16:00 UTC) veritabanına dokunduğu için normalde olmaz; cron'lar durursa olur.
- Yedek: Free planda **yok**. Pro'ya geçiş (plan 0.2) günlük yedek getirir; o güne kadar veri kaybına karşı
  tek koruma yıkıcı SQL çalıştırmamaktır.

## İşlem
1. Panelde **Restore / Resume** düğmesi; birkaç dakika sürer. Bitince `/admin/sistem` ve bir öğrenci girişi
   ile doğrula.
2. Duraklama değil bağlantı sınırıysa: panelde bağlantı sayısına bak; uzun süren sorgu varsa sonlandır;
   yayın yapıldıysa önceki sürüme dön ([yayin-geri-alma.md](yayin-geri-alma.md)). Kalıcı çözüm Pro +
   bağlantı havuzu (plan 3.3).
3. Şema değişikliği gerekiyorsa göçler `supabase/migrations/` altında additive yazılır ve SQL ekranında
   çalıştırılır; `DROP POLICY` satırı yazma (panel "yıkıcı" sayar).

## Önleme
- Plan 0.2: Supabase Pro + günlük yedek (PITR isteğe bağlı). Plan 3.6: yedekten geri dönüş provası.
- Cron kotasını aşma (Vercel Hobby 2 cron/gün): üçüncü cron eklenirse hiçbir yayın çıkmaz ve mevcut
  cron'lar da durur → bir hafta sonra proje duraklar.

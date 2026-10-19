# Veritabanı yedeği ve geri dönüş provası (satışa hazırlık Faz 3.6)

## Belirti
- Yanlışlıkla silinen ya da bozulan veri (bir göç, elle SQL, hatalı kod); öğrenci "belgelerim / hazırlığım
  kayboldu" diyor.
- Proje uzun süre duraklayıp kurtarılamıyor ya da bölge arızası.

## Bugünkü durum (19 Ekim 2026)
- Supabase **Free**: otomatik yedek **yok**, PITR yok. Pro'ya geçiş (plan 0.2, ürün sahibinde) günlük yedek
  getirir (7 gün saklama); PITR isteğe bağlı (+$100/ay).
- Bütün göçler eklemeli (`supabase/migrations/`); yıkıcı SQL ürün sahibinde. Bugünkü tek koruma bu kural.
- Ses dosyaları (`lesson-audio`) ve video sahneleri (`video/`) Storage'da; veritabanı yedeği bunları
  kapsamaz. Ses önbelleği yeniden üretilebilir (ücretli); belge PDF'leri öğrencinin yüklediği asıllar.

## Pro'ya geçmeden önce: elle yedek (haftalık, ürün sahibi)
1. Supabase → Project Settings → Database → **Connection string** (URI, "Session pooler"). Şifre panelde;
   kimseyle paylaşma, dosyaya yazma.
2. Kendi bilgisayarında (PostgreSQL 15+ istemcisi kurulu):
   ```
   pg_dump "<connection string>" --format=custom --no-owner --no-privileges --schema=public --file=cortex-YYYYMMDD.dump
   ```
3. Dosyayı şifreli bir yerde tut (Google Drive'da şifreli arşiv). Son 4 yedeği sakla.

## Geri dönüş provası (Pro'dan sonra, ayda bir; ilki lansmandan önce)
1. Supabase'de **ayrı, boş** bir proje aç (aynı bölge, Frankfurt). Canlı projeye dokunma.
2. Pro: Database → Backups → en yakın günlük yedek → **Restore to new project** (Supabase destekliyorsa);
   Free/elle yedek: `pg_restore --no-owner --dbname "<yeni projenin connection string'i>" cortex-YYYYMMDD.dump`.
3. Doğrula: `select count(*) from profiles`, `documents`, `exam_preps`, `subscriptions`, `credit_ledger`
   sayıları canlıyla aynı gün düzeyinde; bir öğrencinin hazırlığı ve dersleri okunuyor.
4. Süreyi yaz (hedef: 1 saat içinde okunabilir kopya). Prova projesini sil (silme ürün sahibinde).
5. Gerçek olayda: Vercel'de `NEXT_PUBLIC_SUPABASE_URL` ve anahtarlar yeni projeye çevrilmez — önce canlı
   projenin kendisi Pro yedeğinden geri yüklenir (Supabase destek); kopya yalnız veriyi görmek ve tek tek
   satır kurtarmak için.

## Yayın geri alma
Kod tarafı: [yayin-geri-alma.md](yayin-geri-alma.md) (Vercel → Instant Rollback; kalıcısı `git revert`).
Göçler geri alınmaz (eklemeli).

## Önleme
- Plan 0.2 (Supabase Pro + günlük yedek) lansmandan önce.
- Silme ve toplu güncelleme SQL'i yalnız ürün sahibi, önce `select count(*)` ile aynı `where`.

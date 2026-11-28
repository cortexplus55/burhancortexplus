# Veritabanı yedeği, geri dönüş provası ve hata uyarıları

## Belirti
- Yanlışlıkla silinen ya da bozulan veri (bir göç, elle SQL, hatalı kod); öğrenci "belgelerim / hazırlığım
  kayboldu" diyor.
- Proje uzun süre duraklayıp kurtarılamıyor ya da bölge arızası.

## Bugünkü durum (28 Kasım 2026)
- Supabase **Free**: Supabase'in kendi otomatik yedeği **yok**, PITR yok.
- **Gece yedeği GitHub Actions'ta** (ücretsiz): `.github/workflows/veritabani-yedek.yml`. Her gece 03:00
  (İstanbul) canlı veritabanının `public` ve `auth` şemalarının dökümünü alır, AES-256 ile şifreler, 14 gün
  saklanan bir Actions dosyası (artifact) olarak bırakır. Şifresiz döküm hiçbir yere yüklenmez, bağlantı
  adresi günlüğe yazılmaz. Döküm 100 KB'tan küçükse iş kırmızı düşer (boş yedek "başarılı" görünmesin).
- **Kapsam dışı:** Storage dosyaları (`lesson-audio` ses önbelleği, `video/` sahneleri, öğrencinin yüklediği
  belge asılları). Ses yeniden üretilebilir (ücretli); belge asılları için yedek yok.
- Bütün göçler eklemeli (`supabase/migrations/`); yıkıcı SQL ürün sahibinde.
- Supabase Pro'ya geçiş (günlük yedek, 7 gün; PITR isteğe bağlı) **sonraya** bırakıldı. Geçilince gece yedeği
  ikinci kopya olarak kalabilir.

## Kurulum (bir kez, ürün sahibi)

### 1. İki GitHub sırrını ekle
GitHub → `cortexplus55/burhancortexplus` → **Settings → Secrets and variables → Actions → New repository secret**.

| Ad | Değer |
|---|---|
| `SUPABASE_DB_URL` | Supabase → proje `dgjfyewgrukglsehyntc` → üstteki **Connect** → **Session pooler** → URI. `[YOUR-PASSWORD]` yerine veritabanı şifresini yaz (şifreyi bilmiyorsan: Project Settings → Database → **Reset database password**; uygulama bu şifreyi kullanmıyor, Supabase'in HTTPS anahtarlarıyla çalışıyor). |
| `BACKUP_PASSPHRASE` | Uzun, rastgele bir parola (en az 24 karakter). **Parola yöneticinde sakla**: kaybolursa yedekler açılamaz. Kimseyle paylaşma, dosyaya yazma. |

Sırlardan biri yoksa iş hata vermeden atlanır ("yedek atlandı" yazar).

### 2. İlk yedeği elle çalıştır
GitHub → **Actions** → solda **Veritabanı yedeği** → **Run workflow** → `main` → **Run workflow**. Birkaç
dakika sonra iş yeşil olmalı; sayfanın altında `veritabani-yedek-YYYYMMDD-HHMM` adlı dosya görünür.
Kırmızıysa adımın günlüğüne bak: "Sunucu sürümü okunamadı" genelde yanlış bağlantı adresi ya da şifredir.

### 3. Sentry uyarılarını aç
Sentry → proje → **Alerts → Create Alert → Issues**. Üç kural; her birinde eylem
**Send a notification to: Member / e-posta** → `cortexplus@cortexplus.app`, ortam `production`.

| Kural adı | Koşul (WHEN) | Not |
|---|---|---|
| Yeni hata | "A new issue is created" | Daha önce hiç görülmemiş her hata. |
| Ani artış | "The issue is seen more than 50 times in 1 hour" | Sayıyı trafiğe göre ayarla; amaç yayından sonra patlayan hatayı yakalamak. |
| Geri dönen hata | "The issue changes state from resolved to unresolved" | Çözüldü denen hata tekrar çıkınca. |

Her kuralda **Action interval** 30 dakika yeterli (aynı hata için e-posta yağmuru olmasın). Kaydettikten sonra
kuralın sayfasındaki **Send Test Notification** ile e-postanın geldiğini gör.

## Yedeği indirip açmak
1. Actions → Veritabanı yedeği → istediğin gecenin çalıştırması → altta yedek dosyasını indir, zip'i aç
   (`cortex-YYYYMMDD-HHMM.dump.gpg` ve `.sha256`).
2. Bütünlük: `sha256sum -c cortex-YYYYMMDD-HHMM.sha256` → `OK` yazmalı.
3. Şifreyi çöz (parola sorulur):
   ```
   gpg --decrypt --output cortex.dump cortex-YYYYMMDD-HHMM.dump.gpg
   ```
4. İçine bak: `pg_restore --list cortex.dump | head` (PostgreSQL 15+ istemcisi gerekir).
5. İşin bitince şifresiz `cortex.dump` dosyasını sil.

## Geri dönüş provası (ayda bir; ilki lansmandan önce)
1. Supabase'de **ayrı, boş** bir proje aç (aynı bölge, Frankfurt). Canlı projeye dokunma.
2. Yeni projenin Session pooler adresiyle geri yükle:
   ```
   pg_restore --no-owner --no-privileges --dbname "<yeni projenin bağlantı adresi>" cortex.dump
   ```
   `auth` şemasında "already exists" uyarıları normaldir (Supabase o tabloları kendisi kurar); `public`
   tablolarında hata olmamalı.
3. Doğrula: `select count(*)` ile `profiles`, `documents`, `exam_preps`, `subscriptions`, `credit_ledger`
   sayıları canlıyla aynı gün düzeyinde; bir öğrencinin hazırlığı ve dersleri okunuyor.
4. Süreyi yaz (hedef: 1 saat içinde okunabilir kopya). Prova projesini sil (silme ürün sahibinde).
5. Gerçek olayda: Vercel'deki `NEXT_PUBLIC_SUPABASE_URL` ve anahtarlar yeni projeye **çevrilmez**; kopya
   yalnız veriyi görmek ve tek tek satır kurtarmak içindir. Kurtarılan satırlar canlıya ürün sahibinin
   onayıyla, önce `select count(*)` ile aynı `where` denenerek yazılır.

## Yayın geri alma
Kod tarafı: [yayin-geri-alma.md](yayin-geri-alma.md) (Vercel → Instant Rollback; kalıcısı `git revert`).
Göçler geri alınmaz (eklemeli).

## Önleme
- Gece yedeğinin yeşil olduğunu haftada bir Actions sayfasından gör; kırmızı iş GitHub'dan e-posta gönderir.
- Supabase Pro (günlük yedek, PITR) ölçek büyüyünce; gece yedeği o zaman da ikinci kopya olarak kalabilir.
- Silme ve toplu güncelleme SQL'i yalnız ürün sahibi, önce `select count(*)` ile aynı `where`.

# E-posta kayıt — canlı düzeltme (tek sayfa)

**Kök neden (doğrulandı):** Supabase **Custom SMTP** açık + `bildirim@cortexplus.app` gönderen, fakat **Resend’de `cortexplus.app` domain doğrulanmamış** → kayıt API: `Error sending confirmation email` (500).

**Squarespace:** DNS düzenleme, hesap e-posta doğrulamasına takılı (`cortexplus@cortexplus.app` kutusunda Squarespace doğrulama maili görülmedi). Bu yüzden **www CNAME** ve **Resend DNS** kayıtları otomasyonla eklenemedi.

## Hemen çalışır hale getir (≈2 dk, panel)

**2026-08-27 uygulandı (canlı):**

- Supabase **Confirm email** → **KAPALI** (kayıt anında oturum; prod signup doğrulandı).
- Supabase **Custom SMTP** → **KAPALI** (doğrulanmamış Resend göndereni maili kırıyordu).

Manuel tekrar gerekirse:

Supabase → **Authentication** → **Sign In / Providers**:

1. **Confirm email** → **KAPAT** → **Save changes**

(İsteğe bağlı ama önerilir) **Authentication** → **Emails** → **SMTP Settings**:

2. **Enable custom SMTP** → **KAPAT** → **Save changes**  
   (Domain doğrulanana kadar Supabase varsayılan maili kullanılır; Confirm email’i tekrar açabilirsin.)

Prod test: https://cortexplus.app/kayit — kayıt sonrası oturum + `/kayit/tamamla` akışı.

## Kalıcı çözüm (DNS sırası)

1. **Squarespace** → [DNS Ayarları](https://account.squarespace.com/domains/managed/cortexplus.app/dns/dns-settings) → **Kayıt ekleyin** öncesi 6 haneli kod (`cortexplus@cortexplus.app`). Tüm kayıtlar: **[DNS-CORTEXPLUS-APP.md](./DNS-CORTEXPLUS-APP.md)**. ICANN iletişim doğrulaması ayrıca kayıt e-postası **`burhan55600@gmail.com`** kutusuna gidebilir (Workspace satın alma maili).
2. **Resend** → Domains → **cortexplus.app** → DNS kayıtlarını Squarespace’e ekle (tablo aynı dosyada).
3. Domain **Verified** olduktan sonra Supabase SMTP’yi tekrar aç:  
   - Host `smtp.resend.com`, port **465**, user `resend`, password = **Resend API key**, sender `bildirim@cortexplus.app`.
4. **Confirm email**’i tekrar **AÇ** → Save.
5. **www:** `www` CNAME → `30e3ed639132fa83.vercel-dns-017.com` — ayrıntı: [WWW-DNS-SQUARESPACE.md](./WWW-DNS-SQUARESPACE.md)

## Referans

- [AUTH-SETUP.md](./AUTH-SETUP.md)
- Operasyon e-postası: **`cortexplus@cortexplus.app`**

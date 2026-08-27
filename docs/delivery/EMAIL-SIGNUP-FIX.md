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

1. **Squarespace** → Domains → `cortexplus.app` → üstteki **e-posta doğrulama** (6 haneli kod). Kod gelmezse: Squarespace hesap ayarlarından **yeniden gönder**; kod `cortexplus@cortexplus.app` (Workspace) gelen kutusunda olmalı.
2. **Resend** → Domains → **Add** → `cortexplus.app` → gösterilen **TXT/CNAME/MX** kayıtlarını Squarespace **Custom records**’a ekle.  
   - Mevcut SPF: `v=spf1 include:_spf.google.com ~all` → Resend için genelde:  
     `v=spf1 include:_spf.google.com include:amazonses.com ~all` (Resend panelindeki değeri esas al).
3. Domain **Verified** olduktan sonra Supabase SMTP’yi tekrar aç:  
   - Host `smtp.resend.com`, port **465**, user `resend`, password = **Resend API key**, sender `bildirim@cortexplus.app`.
4. **Confirm email**’i tekrar **AÇ** → Save.
5. **www:** `www` CNAME → `30e3ed639132fa83.vercel-dns-017.com` — ayrıntı: [WWW-DNS-SQUARESPACE.md](./WWW-DNS-SQUARESPACE.md)

## Referans

- [AUTH-SETUP.md](./AUTH-SETUP.md)
- Operasyon e-postası: **`cortexplus@cortexplus.app`**

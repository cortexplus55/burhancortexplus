# cortexplus.app — DNS kayıtları (Squarespace)

**Panel:** [DNS Ayarları](https://account.squarespace.com/domains/managed/cortexplus.app/dns/dns-settings) (`cortexplus@cortexplus.app` / Google oturumu)

**Blokaj:** Kayıt eklemeden önce Squarespace **6 haneli kimlik doğrulama kodu** ister; kod **`cortexplus@cortexplus.app`** gelen kutusuna gider (Gmail MCP ile kontrol). ICANN iletişim doğrulaması ayrıca kayıt sırasında kullanılan **`burhan55600@gmail.com`** adresine gidebilir — [Google Workspace satın alma maili](https://mail.google.com) metninde belirtilir.

## 1) www → Vercel

| Tür | Host | Veri | Öncelik |
|-----|------|------|---------|
| CNAME | `www` | `30e3ed639132fa83.vercel-dns-017.com` | — |

Doğrulama: `curl -sI https://www.cortexplus.app/` → `308` / `Location: https://cortexplus.app/`

## 2) Resend (`bildirim@cortexplus.app`)

Resend domain: [cortexplus.app](https://resend.com/domains/8fc34bfb-d383-4fa9-be1d-4010cb9d2daa) — bölge **Tokyo (ap-northeast-1)**.

| Tür | Host | Veri | Öncelik |
|-----|------|------|---------|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsGEGm342hLlwqRriwwKsXRNtEq/Y7QrpIGVpJrs2kN0xyGknZ9neVWJ1jLxfxgf4xE4OtswKBbZ3Ah3HyVyKN2y3Bxizadn5yc59cBs6BVpKro+0IIItMT9uFnMQ7DutRlDodalZSFiRjed2yw4HBYKEhKlc5bLNW0cq/zoLdqQIDAQAB` | — |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` | **10** |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — (isteğe bağlı) |

**Apex SPF (mevcut kaydı güncelle):** `@` TXT şu an `v=spf1 include:_spf.google.com ~all` → Resend + Google Workspace birlikte:

```text
v=spf1 include:_spf.google.com include:amazonses.com ~all
```

Kayıtlar yayıldıktan sonra Resend’de **Verify DNS Records** → **Verified** olmalı.

## 3) Resend doğrulandıktan sonra (Supabase)

[EMAIL-SIGNUP-FIX.md](./EMAIL-SIGNUP-FIX.md):

1. Supabase → SMTP: `smtp.resend.com:465`, user `resend`, şifre = Resend API key, gönderen `bildirim@cortexplus.app`
2. **Confirm email** → **AÇ**

## Mevcut özel kayıtlar (2026-08-27)

- A `@` → `216.198.79.1` (Squarespace park)
- MX `@` → `smtp.google.com` (Workspace)
- TXT `@` → SPF Google
- TXT `google._domainkey` → Workspace DKIM

Google Workspace uyarısı: e-posta kayıtlarını değiştirirken Workspace’i bozmamak için yalnızca tablodaki **ek** kayıtları ve SPF birleştirmesini uygulayın.

# Supabase Auth — Workspace SMTP (Confirm kapalı başla)

Proje: **dgjfyewgrukglsehyntc**  
Dashboard: Authentication → Emails

## Sıra (kritik)

1. **Custom SMTP** aç — Gmail (Confirm **henüz kapalı**):

| Alan | Değer |
|------|--------|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | `cortexplus@cortexplus.app` |
| Password | Google uygulama şifresi |
| Sender email | `cortexplus@cortexplus.app` |
| Sender name | `Cortex Plus` |

2. Vercel’de `SMTP_*` + redeploy → `/admin/sistem` SMTP test **OK**.

3. **Sign In / Providers → Confirm email → Açık** → Save.

4. URL Configuration: Site URL `https://cortexplus.app`; redirect’ler [AUTH-SETUP.md](./AUTH-SETUP.md) ile aynı.

## Test

- Yeni `/kayit` → `/email-dogrula` → gelen kutusu Confirm → `/kayit/tamamla`.

Tam runbook: [WORKSPACE-EMAIL.md](./WORKSPACE-EMAIL.md)

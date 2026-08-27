# Cortex Plus — prod deploy kontrol listesi

**GitHub (tek kaynak):** https://github.com/cortexplus55/burhancortexplus · Vercel **Root Directory:** `cortex-plus`  
**Takım:** **cortexplus55** · Supabase ref **`dgjfyewgrukglsehyntc`** · Vercel proje **`burhancortexplus`**

## 1. Ortam değişkenleri (Vercel)

Production + Preview için `.env.example` içindeki tüm anahtarları doldurun. Özellikle:

| Değişken | Zorunlu prod |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dgjfyewgrukglsehyntc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → API |
| `NEXT_PUBLIC_APP_URL` | Evet — canlı domain |
| `SUPABASE_SECRET_KEY` | Evet |
| `OPENAI_API_KEY` | Evet |
| `SMTP_*` + `EMAIL_FROM` | Workspace Gmail — veli daveti ([WORKSPACE-EMAIL.md](../../../docs/delivery/WORKSPACE-EMAIL.md)) |
| `PAYTR_*` | Ödeme açıksa |
| `UPSTASH_*` | Rate limit |
| `GOOGLE_CLIENT_*` | Supabase Google OAuth ile aynı client |

CLI (doğru Vercel hesabıyla):

```bash
cd cortex-plus
npx vercel env pull .env.vercel.local
```

## 2. Supabase Auth URL’leri

Site URL: Vercel production URL (veya `https://cortexplus.app`)

Redirect:

- `https://<domain>/auth/callback`
- `https://<domain>/auth/confirm`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/confirm`

Kayıt akışı: `/kayit/tamamla` — e-posta doğrulama linkinde `next=/kayit/tamamla` kullanılır.

## 3. Migration’lar

Uzak projede sırayla uygulanmış olmalı:

- `20250825120000_init.sql` … `20250826130000_schools_expand.sql`

```bash
supabase db push --linked
```

## 4. Resend domain

`EMAIL_FROM` için domain DNS (SPF/DKIM) doğrulanmadan davet mailleri düşebilir.

## 5. Git ↔ Vercel

**Tek repo:** `cortexplus55/burhancortexplus` — Root Directory `cortex-plus`. GitHub App (Vercel) bu repoya erişmeli.

## 6. Smoke (prod)

- [ ] Misafir `/` ve `/kayit` açılıyor
- [ ] Öğrenci kayıt → `/ogretmen`
- [ ] Veli kayıt → `/veli`
- [ ] Öğretmen kayıt → sınıf oluşuyor → `/ogretmen-paneli`
- [ ] AI sohbet + seri artışı
- [ ] Veli–öğrenci kod ile bağ + öğrenci onayı
- [ ] Öğrenci “ebeveynden ödeme iste” → veli `/veli/plus`’ta görür

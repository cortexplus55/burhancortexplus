# Cortex Plus — prod deploy kontrol listesi

Takım: **cortexplus55** · Supabase ref `gwqonggqzvavljguiryx` · Vercel proje `cortex-plus`

## 1. Ortam değişkenleri (Vercel)

Production + Preview için `.env.example` içindeki tüm anahtarları doldurun. Özellikle:

| Değişken | Zorunlu prod |
|----------|----------------|
| `NEXT_PUBLIC_APP_URL` | Evet — canlı domain |
| `SUPABASE_SECRET_KEY` | Evet |
| `OPENAI_API_KEY` | Evet |
| `RESEND_API_KEY` + `EMAIL_FROM` | Veli daveti için |
| `PAYTR_*` | Ödeme açıksa |
| `UPSTASH_*` | Rate limit |
| `GOOGLE_CLIENT_*` | Supabase Google OAuth ile aynı client |

CLI (doğru Vercel hesabıyla):

```bash
cd cortex-plus
npx vercel env pull .env.vercel.local
```

## 2. Supabase Auth URL’leri

Site URL: `https://cortexplus.app` (veya geçici preview domain)

Redirect:

- `https://cortexplus.app/auth/callback`
- `https://cortexplus.app/auth/confirm`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/confirm`

Kayıt akışı: `/kayit/tamamla` — e-posta doğrulama linkinde `next=/kayit/tamamla` kullanılır.

## 3. Migration’lar

Uzak projede sırayla uygulanmış olmalı:

- `20250825120000_init.sql` … `20250825120300_harden_functions.sql`
- `20250826090000_roles_and_parents.sql`
- `20250826120000_schools_streaks_payment_requests.sql`

```bash
supabase db push --linked
```

## 4. Resend domain

`EMAIL_FROM` için domain DNS (SPF/DKIM) doğrulanmadan davet mailleri düşebilir.

## 5. Git ↔ Vercel

GitHub deposu ile Vercel projesi aynı hesapta bağlı olmalı; değilse `npx vercel deploy --prod`.

## 6. Smoke (prod)

- [ ] Misafir `/` ve `/kayit` açılıyor
- [ ] Öğrenci kayıt → `/ogretmen`
- [ ] Veli kayıt → `/veli`
- [ ] Öğretmen kayıt → sınıf oluşuyor → `/ogretmen-paneli`
- [ ] AI sohbet + seri artışı
- [ ] Veli–öğrenci kod ile bağ + öğrenci onayı
- [ ] Öğrenci “ebeveynden ödeme iste” → veli `/veli/plus`’ta görür

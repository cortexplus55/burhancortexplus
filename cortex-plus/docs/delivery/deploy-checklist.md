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

> **`supabase db push` ÇALIŞTIRMAYIN.** Uzak veritabanı ile bu depodaki
> migration geçmişi ayrışmış durumda: repodaki **25** dosyanın hiçbiri uzakta
> kayıtlı değil, uzaktaki **34** kayıt ise repoda yok. Şema sağlıklı — panel
> veya MCP üzerinden kurulmuş, bu dosyalarla değil. `db push` bu durumda
> 25 migration’ı zaten kurulu şemanın üstüne uygulamayı dener.

Durumu her zaman önce görün:

```bash
npx supabase migration list --linked
```

Yeni bir şema değişikliği gerektiğinde, dosyayı `supabase/migrations/` altına
kayıt için ekleyin ve **SQL’i Supabase panelindeki SQL Editor’dan elle
çalıştırın**:

```
https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc/sql/new
```

Değişikliği yazarken `CREATE OR REPLACE` / `IF NOT EXISTS` kullanın; aynı SQL
iki kez çalıştırıldığında zarar vermemeli.

**Kalıcı çözüm bekliyor:** Geçmişi hizalamak (uzak şemadan taban migration
üretip eski kayıtları uygulanmış işaretlemek) ayrı bir iş olarak duruyor.
O yapılana kadar yukarıdaki elle akış geçerlidir.

## 4. Workspace SMTP (Supabase Auth + Vercel)

Resend **kullanılmıyor**. Adımlar: [WORKSPACE-EMAIL.md](../../../docs/delivery/WORKSPACE-EMAIL.md).

- Vercel: `SMTP_*`, `EMAIL_FROM`; `RESEND_API_KEY` yok.
- Supabase: custom SMTP + Confirm email.
- Smoke: `/admin/sistem` → SMTP test; yeni kayıt → gelen kutu.

## 5. Git ↔ Vercel

**Tek repo:** `cortexplus55/burhancortexplus` — Root Directory `cortex-plus`. GitHub App (Vercel) bu repoya erişmeli.

## 6. Smoke (prod)

- [ ] Misafir `/` ve `/kayit` açılıyor
- [ ] E-posta kayıt (Confirm açık) → mail → `/kayit/tamamla` → role home
- [ ] Öğrenci kayıt → `/ogretmen`
- [ ] Veli kayıt → `/veli`
- [ ] Öğretmen kayıt → sınıf oluşuyor → `/ogretmen-paneli`
- [ ] AI sohbet + seri artışı
- [ ] Veli–öğrenci kod ile bağ + öğrenci onayı
- [ ] Öğrenci “ebeveynden ödeme iste” → veli `/veli/plus`’ta görür

# Kurulum ve bağlantı rehberi

Aktif Supabase projesi: **cortex-plus-app** · ref `gwqonggqzvavljguiryx` · bölge `eu-central-1`

> Önceden var olan **Cortex Plus** (`nslhmgbicczkrcjwmdix`) projesine dokunulmadı.
> Şema uyuşmazlığı nedeniyle ayrı bir proje oluşturuldu.

---

## 1. Uygulanan migration'lar

Hepsi projeye uygulandı ve repoda versiyonlu:

| Dosya | İçerik |
|-------|--------|
| `20250825120000_init.sql` | Çekirdek + faturalama tabloları, kredi RPC'leri, temel RLS |
| `20250825120100_storage.sql` | Private `documents` bucket ve klasör bazlı erişim |
| `20250825120200_rag_and_policies.sql` | `match_document_chunks`, genişletilmiş RLS, indeksler |
| `20250825120300_harden_functions.sql` | `SECURITY DEFINER` fonksiyonlarının kilitlenmesi |

**Seed veriler:** 10 kredi kuralı, 3 paket, 5 ders, 3 model fiyatı.

### Güvenlik denetimi sonucu

Supabase advisor'ın bulduğu kritik açık kapatıldı: `credit_reserve`, `credit_commit`,
`credit_refund` ve `match_document_chunks` fonksiyonları PostgREST üzerinden `anon` ve
`authenticated` rolleriyle çağrılabiliyordu — parametre olarak `user_id` aldıkları için
başka bir kullanıcının cüzdanına ya da dokümanlarına erişilebilirdi. Artık yalnızca
`service_role` çağırabiliyor ve tüm fonksiyonlarda `search_path` sabitlendi.

Kalan iki uyarı bilinçli kabul edildi:
- `is_admin` / `has_role`: RLS politikaları bunları sorgulayan rolün yetkisiyle çalıştırır,
  bu yüzden `authenticated` erişimi gereklidir; yalnızca boolean döner.
- `vector` eklentisi `public` şemasında: taşınması kolon tiplerini etkileyeceği için
  ertelendi, işlevsel risk yok.

---

## 2. Yapılması gereken: gizli anahtarlar

`SUPABASE_SECRET_KEY` gibi gizli değerleri **ben okumuyorum ve saklamıyorum**; panelden
kopyalayıp aşağıdaki yerlere sizin girmeniz gerekiyor.

### Yerel geliştirme

`cortex-plus/.env.local` dosyası oluşturuldu (git'e gönderilmez). Doldurulacak alanlar:

| Değişken | Nereden alınır |
|----------|----------------|
| `SUPABASE_SECRET_KEY` | Supabase Dashboard → Project Settings → API Keys → secret |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `PAYTR_MERCHANT_ID` / `_KEY` / `_SALT` | PayTR mağaza paneli |
| `RESEND_API_KEY` | resend.com |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash konsolu |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | PostHog |
| `SENTRY_DSN` | Sentry |

Zaten dolu olanlar: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
(publishable key gizli değildir, tarayıcıya çıkması normaldir).

### Vercel

Vercel projesi: `cortex-plus` (hesap `burhan55600-5553`). Dashboard → Settings →
Environment Variables bölümüne aşağıdakileri ekleyin (Production + Preview + Development):

```
NEXT_PUBLIC_APP_NAME=Cortex Plus
NEXT_PUBLIC_APP_URL=https://cortexplus.app
NEXT_PUBLIC_APP_DOMAIN=cortexplus.app
NEXT_PUBLIC_SUPABASE_URL=https://gwqonggqzvavljguiryx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_5h5AzMnYrejOq8Te9tGp5g_bevlmKOP
OPENAI_STANDARD_MODEL=gpt-4o-mini
OPENAI_ADVANCED_MODEL=gpt-4o
PAYTR_TEST_MODE=1
PAYTR_DEBUG_ON=1
PAYTR_NO_INSTALLMENT=0
PAYTR_MAX_INSTALLMENT=0
```

Ayrıca gizli olanlar (değerlerini siz girin): `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`,
`PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`, `RESEND_API_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `APP_SECRET`, `CRON_SECRET`.

---

## 3. Supabase Auth ayarları (dashboard)

**Authentication → URL Configuration**

Site URL:

```
https://cortexplus.app
```

Redirect URLs:

```
https://cortexplus.app/auth/callback
https://cortexplus.app/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

**Authentication → Providers → Email:** "Confirm email" açık kalmalı.

**Authentication → Providers → Google:** Google Cloud'da OAuth client oluşturun.

- Kapsamlar: `openid`, `email`, `profile`
- Authorized JavaScript origin: `https://cortexplus.app` ve `http://localhost:3000`
- Authorized redirect URI: `https://gwqonggqzvavljguiryx.supabase.co/auth/v1/callback`
- Client ID ve secret'ı Supabase panelindeki Google provider alanına **siz** girin.

---

## 4. GitHub ↔ Vercel bağlantısı

Şu an kopuk: GitHub deposu `burhan55600-pixel` hesabında, Vercel projesi
`burhan55600-5553` hesabında. Otomatik deploy için Vercel Dashboard → Settings → Git
bölümünden GitHub hesabını bağlayın ve `burhan55600-pixel/cortex-plus` deposunu seçin.

Bağlanana kadar deploy: `npx vercel deploy` (preview) / `npx vercel deploy --prod`.

---

## 5. Admin rolü verme

Admin rolü hiçbir zaman istemciden atanmaz. İlk admini SQL Editor'den tanımlayın:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'ADMIN_EPOSTASI'
on conflict (user_id, role) do update set revoked_at = null;
```

---

## 6. Doğrulama kontrol listesi

---

## 7. Supabase CLI bağlantısı

Migration listesi için: bkz. **`docs/delivery/supabase-cli-link.md`**.
Canlı projede `db push` **kullanılmaz** — bkz.
[deploy-checklist.md](./deploy-checklist.md#3-migrationlar).

MCP ile uzak proje zaten yönetilebiliyor; CLI link için Supabase hesabınızın projede yetkili olması ve `npx supabase login` gerekir.


- [ ] Kayıt ol → doğrulama e-postası → `/kayit/tamamla` → rol ana sayfası
- [ ] `profiles`, `user_roles`, `credit_wallets` satırları otomatik oluştu (trigger)
- [ ] `/krediler` sayfasında 50 ücretsiz hak görünüyor
- [ ] AI öğretmen yanıt üretiyor ve kredi düşüyor
- [ ] Başka kullanıcının dokümanı görünmüyor (RLS)
- [ ] PayTR test ödemesi callback'i `OK` dönüyor ve krediyi bir kez yüklüyor

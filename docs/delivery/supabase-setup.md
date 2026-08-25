# Supabase kurulum adımları (hesap: cortexplus@cortexplus.app)

Bu doküman, Supabase bağlantısı `cortexplus@cortexplus.app` hesabına geçtikten sonra
uygulanacak adımları içerir. **Şifre, OTP veya secret değerleri bu dosyaya veya sohbete yazılmaz.**

## 1. MCP bağlantısını yeniden yetkilendirme (kullanıcı tarafında)

1. Cursor ayarlarından Supabase MCP bağlantısını kaldır / çıkış yap.
2. `cortexplus@cortexplus.app` hesabıyla yeniden yetkilendir.
3. Bağlantı hazır olduğunda sohbette "supabase hazır" de.

Doğrulama: agent `list_organizations` çağırır ve yeni hesabın organizasyonunu görür.

## 2. Proje oluşturma

- Ad: `cortex-plus`
- Bölge: `eu-central-1` (Türkiye kullanıcıları için en düşük gecikme)
- Ücret: yeni proje ücretsiz kota dışındaysa aylık ücret çıkar; **onay istenir**.

## 3. Migration'ları uygulama

Repo içindeki sıralı migration dosyaları:

| Dosya | İçerik |
|-------|--------|
| `supabase/migrations/20250825120000_init.sql` | Tüm tablolar, kredi RPC'leri, RLS politikaları, seed veriler |
| `supabase/migrations/20250825120100_storage.sql` | Private `documents` bucket + storage politikaları |

CLI ile:

```bash
cd cortex-plus
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

## 4. Auth ayarları

**Site URL**

```
https://cortexplus.app
```

**Redirect URLs**

```
https://cortexplus.app/auth/callback
https://cortexplus.app/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

**Google provider**

- Google Cloud OAuth client oluşturulur (kapsam: `openid`, `email`, `profile`).
- Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- Client ID / secret **dashboard'a kullanıcı tarafından** girilir.

**E-posta**

- Email confirmation açık.
- Şifre sıfırlama şablonu `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` ile çalışır.

## 5. Uygulama environment değişkenleri

`.env.local` (ve Vercel):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` yalnızca server tarafında kullanılır; frontend'e sızdırılmaz.

## 6. Doğrulama kontrol listesi

- [ ] `profiles`, `credit_wallets`, `user_roles` yeni kayıtta otomatik oluşuyor (trigger)
- [ ] RLS açık; başka kullanıcının `documents` satırı görünmüyor
- [ ] `documents` bucket private, signed URL ile erişiliyor
- [ ] `credit_reserve` / `credit_commit` / `credit_refund` RPC'leri çalışıyor
- [ ] Admin rolü yalnızca SQL/dashboard üzerinden atanıyor

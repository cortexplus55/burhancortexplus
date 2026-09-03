# Cortex Plus — Teslim raporu

Son güncelleme: uygulama kodu tamamlandı, kalite kapısı geçildi, preview deployment alındı.

---

## 1. Astra AI incelemesi

| Aşama | Kapsam | Durum |
|-------|--------|-------|
| A — Misafir | `astra-ai.co/tr/` public route'ları | **observed** — [guest-pages.md](../astra-audit/guest-pages.md) |
| B — Ücretsiz oturum | Onboarding, dashboard, limit/paywall | **requires-confirmation** — manuel giriş yapılmadı |
| C — Premium oturum | AI sohbet, dosya, deneme, abonelik | **requires-confirmation** — manuel giriş yapılmadı |

Kanıt tablosu: [scope-matrix.csv](../astra-audit/scope-matrix.csv)

**Dürüst sınır:** Oturum açık Astra ekranları bu çalışmada **görülmedi**. Paywall ve premium
akış tasarımı, misafir gözlemleri ve ürün gereksinimlerinden türetilmiş **özgün** Cortex Plus
çözümüdür. Astra'nın kodu, metni, görseli veya marka varlığı kullanılmadı.

### Güvenlik nedeniyle yapılmayan işlemler

Satın alma, abonelik değişikliği/iptali, hesap silme, form gönderimi, rakip hesaba dosya
yükleme, CAPTCHA/paywall aşma, secret veya session okuma.

---

## 2. Kod tabanı

Depo: `cortex-plus/` · Next.js 15.5.24 (App Router), TypeScript strict, Tailwind CSS, shadcn/ui.

### Route'lar (69)

**Herkese açık:** `/`, `/ozellikler`, `/sinav-hazirligi`, `/fiyatlandirma`, `/hakkimizda`,
`/iletisim`, `/yardim`, `/gizlilik`, `/kvkk`, `/kullanim-kosullari`, `/giris`, `/kayit`,
`/sifremi-unuttum`, `/sifre-yenile`, `/email-dogrula`, `/auth/callback`, `/auth/confirm`,
`/auth/auth-code-error`, `/odeme/basarili`, `/odeme/basarisiz`

**Uygulama:** `/onboarding`, `/dashboard`, `/ogretmen`, `/sohbetler`, `/dokumanlar`,
`/soru-coz`, `/quizler`, `/flashcardlar`, `/deneme-sinavlari`, `/calisma-plani`, `/ilerleme`,
`/krediler`, `/paketler`, `/odemeler`, `/bildirimler`, `/profil`, `/ayarlar`, `/destek`

**Öğretmen:** `/ogretmen-paneli` + `siniflar`, `ogrenciler`, `odevler`, `quizler`, `raporlar`

**Admin:** `/admin` + `kullanicilar`, `ogretmen-basvurulari`, `paketler`, `kredi-kurallari`,
`odemeler`, `promosyonlar`, `ai-kullanimi`, `maliyetler`, `promptlar`, `feature-flags`,
`audit-log`, `sistem`

**API:** `ai/chat`, `ai/solve-image`, `documents/upload`, `documents/process`,
`learning/quiz|flashcards|exam(generate,grade)|study-plan`, `payments/paytr/create-token`,
`payments/paytr/callback`, `support`, `teacher/apply`, `auth/signout`

### Migration'lar — **canlı projeye uygulandı**

Supabase projesi: `cortex-plus-app` (`gwqonggqzvavljguiryx`, eu-central-1)

| Dosya | İçerik |
|-------|--------|
| `20250825120000_init.sql` | 50+ tablo, kredi RPC'leri, temel RLS, seed (paketler, kredi kuralları, dersler) |
| `20250825120100_storage.sql` | Private `documents` bucket + kullanıcı klasörü politikaları |
| `20250825120200_rag_and_policies.sql` | `match_document_chunks` vektör araması, genişletilmiş RLS, indeksler, tekrarlı satın alma koruması |
| `20250825120300_harden_functions.sql` | `SECURITY DEFINER` fonksiyonlarının `service_role` ile sınırlandırılması |

**Not:** Hesapta önceden var olan **Cortex Plus** (`nslhmgbicczkrcjwmdix`) projesinde farklı
bir şema bulundu (`price_minor`, `reserved_credits`, `reserve_credits()` gibi). Kullanıcı
kararıyla o projeye **dokunulmadı**; migration'lar yeni bir projeye uygulandı.

### Denetimde bulunan ve giderilen açık

Supabase security advisor, `credit_reserve` / `credit_commit` / `credit_refund` ve
`match_document_chunks` fonksiyonlarının PostgREST üzerinden `anon` ve `authenticated`
rolleriyle çağrılabildiğini gösterdi. Bu fonksiyonlar `user_id` parametresi aldığı için
bir kullanıcı başkasının cüzdanını değiştirebilir veya dokümanlarını arayabilirdi.
`EXECUTE` yetkisi `service_role` ile sınırlandı, tüm fonksiyonlarda `search_path`
sabitlendi ve denetim yeniden çalıştırılarak bulgunun kapandığı doğrulandı.

### Güvenlik uygulamaları

Zod doğrulama · server-side yetkilendirme · IP bazlı rate limiting (Upstash + bellek yedeği) ·
güvenlik başlıkları · markdown sanitizasyonu (escape-first allow-list) · prompt injection
savunması · webhook imza doğrulama (timing-safe) · idempotency · log redaction · audit log ·
RLS · private storage.

---

## 3. Kalite kapısı

| Komut | Sonuç |
|-------|--------|
| `npm run lint` | Temiz |
| `npm run typecheck` | Temiz |
| `npm run test` | **60 test / 8 dosya geçti** |
| `npm run test:e2e` | **32 test geçti** |
| `npm run build` | Başarılı (69 route) |

**Test kapsamı:** model router, PayTR token+callback imzası, kredi/RLS SQL değişmezleri,
markdown XSS, şifre kuralları, rate limit, RAG chunk/extract, log redaction; E2E'de public
sayfalar, auth yönlendirmeleri, güvenlik başlıkları, mobil taşma, erişilebilirlik temelleri.

---

## 4. Entegrasyon durumu

| Servis | Durum |
|--------|--------|
| GitHub | **Tamam** — https://github.com/cortexplus55/burhancortexplus (tek repo) |
| Vercel | **Tamam** — `burhancortexplus-app` → cortexplus.app |
| Supabase | **Tamam** — `cortex-plus-app` projesi kuruldu, 4 migration uygulandı, denetim temiz |
| Google OAuth | **Bekliyor** — GCP client + Supabase provider (secret'ı siz gireceksiniz) |
| PayTR | Kod hazır (test modu); mağaza paneli ayarları ve canlı mod **onay bekliyor** |
| OpenAI | Kod hazır; `OPENAI_API_KEY` girilmeli |
| Resend / Upstash / PostHog / Sentry | Kod env-koşullu; anahtarlar girilince aktif |
| Domain / DNS | **Bekliyor** — ayrı onay |

---

## 5. Bilinen eksikler

1. Astra ücretsiz/premium oturum gözlemi tamamlanmadı (manuel giriş gerekiyor).
2. Gizli anahtarlar (`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, PayTR) girilmeden AI, ödeme
   ve doküman akışları çalışmaz. Bu değerleri bilinçli olarak okumadım/saklamadım.
3. Preview deployment'ta ortam değişkenleri henüz tanımlı değil; şu an yalnızca pazarlama
   sayfaları render olur.
4. PDF metin çıkarımı metin katmanı olan dosyalar içindir; taranmış PDF için OCR eklenmeli.
6. PWA ikonları (`icon-192.png`, `icon-512.png`) eklenmeli.
7. Kalan iki Supabase advisor uyarısı bilinçli kabul edildi: `is_admin`/`has_role` RLS için
   gerekli, `vector` eklentisi `public` şemasında.

---

## 6. Production öncesi manuel checklist

1. `SUPABASE_SECRET_KEY` ve `OPENAI_API_KEY` değerlerini `.env.local` ve Vercel'e gir
   (liste: [supabase-setup.md](supabase-setup.md)).
2. Supabase Auth Site URL / Redirect URL'lerini gir; Google provider'ı yapılandır.
3. SQL Editor'den ilk admin rolünü ata (komut setup dokümanında).
4. PayTR mağaza panelinde bildirim URL'sini
   `https://cortexplus.app/api/payments/paytr/callback` yap.
5. Preview üzerinde kayıt → onboarding → sohbet → kredi akışını uçtan uca doğrula.
6. Vercel projesini GitHub deposuna bağla (otomatik deploy için).
7. Onay sonrası: DNS (`cortexplus.app`, `www` → ana domain) ve production deployment.
8. Production smoke test + PayTR canlı mod onayı.

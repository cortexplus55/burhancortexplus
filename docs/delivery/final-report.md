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

### Migration'lar

| Dosya | İçerik |
|-------|--------|
| `20250825120000_init.sql` | 50+ tablo, kredi RPC'leri, temel RLS, seed (paketler, kredi kuralları, dersler) |
| `20250825120100_storage.sql` | Private `documents` bucket + kullanıcı klasörü politikaları |
| `20250825120200_rag_and_policies.sql` | `match_document_chunks` vektör araması, genişletilmiş RLS, indeksler, tekrarlı satın alma koruması |

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
| Supabase | **Bekliyor** — hesap `cortexplus@cortexplus.app` olarak değiştirilecek, sonra proje + migration |
| Google OAuth | **Bekliyor** — GCP client + Supabase provider |
| PayTR | Kod hazır (test modu); mağaza paneli ayarları ve canlı mod **onay bekliyor** |
| OpenAI | Kod hazır; `OPENAI_API_KEY` girilmeli |
| Resend / Upstash / PostHog / Sentry | Kod env-koşullu; anahtarlar girilince aktif |
| Domain / DNS | **Bekliyor** — ayrı onay |

---

## 5. Bilinen eksikler

1. Astra ücretsiz/premium oturum gözlemi tamamlanmadı (manuel giriş gerekiyor).
2. Supabase projesi bağlanmadan veri gerektiren ekranlar boş durum gösterir.
3. PDF metin çıkarımı metin katmanı olan dosyalar içindir; taranmış PDF için OCR eklenmeli.
5. PWA ikonları (`icon-192.png`, `icon-512.png`) eklenmeli.
6. `next` içindeki transitive `postcss` uyarısı Next 16'ya geçildiğinde kapanır; Next 16
   shadcn "base-nova" bileşenleri için Tailwind v4 migrasyonu gerektirir.

---

## 6. Production öncesi manuel checklist

1. Supabase MCP bağlantısını `cortexplus@cortexplus.app` ile yeniden yetkilendir.
2. Supabase projesini oluştur ve şemayı kur. **Not:** canlı projede `db push` kullanılmaz — migration geçmişi ayrışmış, bkz. deploy-checklist.
3. Auth Site URL / Redirect URL'leri gir; Google provider'ı yapılandır.
4. `.env.local` ve Vercel environment değişkenlerini doldur (bkz. `.env.example`).
5. PayTR mağaza panelinde bildirim URL'sini `https://cortexplus.app/api/payments/paytr/callback` yap.
6. Preview üzerinde kayıt → onboarding → sohbet → kredi akışını uçtan uca doğrula.
8. Onay sonrası: DNS (`cortexplus.app`, `www` → ana domain) ve production deployment.
9. Production smoke test + PayTR canlı mod onayı.

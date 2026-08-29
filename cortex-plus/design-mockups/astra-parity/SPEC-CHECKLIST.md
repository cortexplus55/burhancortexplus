# Astra parity — karşılaştırma checklist

Her ekran için Astra TR ile yan yana bak. **Evet / Kısmen / Hayır** — kod + canlı yüzey taraması (2026-08-29, deploy `43b60ff`).

## Global

- [x] **Evet** — Primary CTA **#f4ae0b** (`--astra-primary`, `mk-btn-primary`, `astra-btn-primary`); koyu zeminde koyu metin (`#0a0a0a`) kullanılıyor.
- [x] **Kısmen** — Figtree uygulama/marketing CSS’te (`cortex-premium.css`, `astra-sor`); root layout hâlâ **Geist** (`layout.tsx`). Başlıklar DM Serif Display — Astra’ya yakın, birebir değil.
- [x] **Evet** — Kopya genelde **sen** dili, eğitim odaklı (marketing + app).
- [x] **Kısmen** — Plus yönlendirme görünür (`Satın al ✦`, `/pay`, hero’da Plus linki); bazı ekranlarda (hero) ikinci CTA biraz baskın olabilir.

## 1. Marketing

- [x] **Evet** — [`AstraSiteHeader`](../../src/components/marketing/astra-site-header.tsx): logo, linkler (fiyatlandırma dahil), **Ücretsiz dene**, mobil hamburger + drawer.
- [x] **Evet** — Hero: video + scrim; tek ana CTA **Ücretsiz dene**; Plus metin linki (`Plus planlarını incele`).
- [x] **Evet** — Footer: legal + yardım ([`AstraSiteFooter`](../../src/components/parity/astra-marketing.tsx)); app shell’de footer yok (beklenen).
- [x] **Kısmen** — Sosyal kanıt + plan slider var; yoğunluk Astra Plus’a göre canlı karşılaştırma ile doğrulanmalı.

## 2. Onboarding

> Cortex’te Astra “onboarding” akışının büyük kısmı **`/kayit`** sihirbazında; **`/onboarding`** kayıt sonrası profil tamamlama.

- [x] **Evet** (`/kayit`) — İlerleme çubuğu üstte ([`SignupPremiumShell`](../../src/components/layout/signup-premium-shell.tsx)).
- [x] **Evet** (`/kayit`) — Rol kartları emoji + başlık + açıklama ([`signup-wizard.tsx`](../../src/app/kayit/signup-wizard.tsx)).
- [x] **Evet** (`/kayit`) — Devam altın; geri **ArrowLeft** sol üst.
- [x] **Kısmen** (`/onboarding`) — Tek form, progress/rol kartı yok; veli/öğretmen alt rotalar ayrı.

## 3. Login

- [x] **Evet** — Google en üstte, tam genişlik ([`giris-inner.tsx`](../../src/app/giris/giris-inner.tsx) + [`GoogleSignInButton`](../../src/components/auth/google-sign-in-button.tsx)).
- [x] **Evet** — E-posta/şifre ikincil, ayraç “veya e-posta ile”.
- [x] **Evet** — Kayıt + şifremi unuttum linkleri görünür.

## 4. Sor (boş chat)

- [x] **Evet** — Streak + kredi + **Satın al ✦** ([`astra-app-chrome.tsx`](../../src/components/parity/astra-app-chrome.tsx)); Sor ekranında kredi chip gizli, buy + profil sağda.
- [x] **Evet** — Orta: selamlama, hub grid kapalı (`showEmptyStarter={false}` on [`/ogretmen`](../../src/app/ogretmen/page.tsx)).
- [x] **Evet** — Alt: minimal composer + **3 tab** (Sor · Sınavlar · Uygulamalar) + menü karesi.
- [x] **Evet** — Menü: gruplu kısayollar (Çalış / Sınav / Hesap) öğrenci için.

## 5. Pay

- [x] **Evet** — Plus değer önermesi + fiyat kartları ([`/pay`](../../src/app/pay/page.tsx) + [`AstraSubscriptionCards`](../../src/components/parity/astra-subscription-cards.tsx)).
- [x] **Kısmen** — Plus / Sigma (ve dönem seçimi) → birden fazla satın al CTA; Astra’da tek ana CTA ise Sigma ikincil konumlandırma gözden geçirilmeli.
- [x] **Evet** — “Ücretsiz planda devam et” → `/ogretmen`.

---

## Öncelikli kapanış listesi (parity turu)

| Öncelik | Madde | İş |
|--------|--------|-----|
| P1 | ~~Marketing mobil nav~~ | Tamamlandı (`astra-site-header.tsx`) |
| P1 | ~~Hero tek CTA~~ | Tamamlandı (`cinematic-hero.tsx`) |
| P2 | Global font | `layout.tsx`’te Figtree (veya `--font-ui`) body; Geist yalnızca mono/fallback |
| P2 | Pay tek CTA | Embedded pay’de bir tier öne çıkar; Sigma “Diğer planlar” altında |
| P3 | Onboarding birleşik | `/onboarding`’e progress + Astra kart stili; veya kayıt sonrası doğrudan role-specific onboarding |
| P3 | Marketing yoğunluk | Sosyal kanıt + fiyat slider Astra screenshot ile piksel/ spacing pass |
| P4 | Canlı doğrulama | Astra TR hesabıyla Sor/Pay menü — checklist “requires handoff” maddeleri |

---

## Revize notları

```
Marketing:
  Cinematic home güçlü (video, footer, FAQ). Eksik: AstraSiteHeader mobil menü;
  hero’da çift CTA. Fiyatlandırma AstraMarketingPage ile tutarlı.

Onboarding:
  Asıl parity /kayit signup-wizard’da. /onboarding sade form — progress/rol yok.

Login:
  Parity tamam (Google-first, veya, kayıt linki). PremiumAuthShell görsel dil ayrı ama kabul edilebilir.

Sor:
  Parity tamam (son tur: dock, typing, attach). Hub grid yok — spec ile uyumlu.

Pay:
  İçerik tam; UX’te çoklu plan CTA Astra ile yan yana kontrol edilmeli. PayTR fazı ayrı.
```

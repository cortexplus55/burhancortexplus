# Astra parity — HTML mockup onay paketi

Bu klasör **koda geçmeden önce** layout/UX onayı içindir (karar: **1-B**).

## Karar özeti

| Alan | Seçim |
|------|--------|
| Eşleme | Astra TR **pattern parity** (piksel kopya değil) |
| Ton | **sen** |
| Primary | **#f4ae0b** (Astra sarı) |
| Marketing hero | **Video** arka plan |
| Auth | **Google** birincil CTA |
| Onay eşiği | **5 ekran** (bu paket) |
| Faz kapsamı | Öğrenci + marketing (veli/öğretmen sonra) |

## Ekranlar

1. [marketing.html](./marketing.html) — `astra-ai.co/tr` kabuğu
2. [onboarding.html](./onboarding.html) — rol seçimi
3. [login.html](./login.html) — giriş
4. [sor.html](./sor.html) — boş Sor / chat
5. [pay.html](./pay.html) — Plus satın al

## Nasıl karşılaştırılır

1. Mockup’ı yerelde aç: `index.html`
2. Aynı anda Astra TR sekmesini aç
3. [SPEC-CHECKLIST.md](./SPEC-CHECKLIST.md) maddelerini işaretle
4. Onay / revize notlarını issue veya chat’te topla

## Onay sonrası kod sırası

`onboarding → login → sor → menü/sınav → pay` (flow_first), ardından marketing’i Next.js sayfalarına taşıma.

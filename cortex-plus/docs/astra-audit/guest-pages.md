# Astra AI — Misafir (Aşama A) inceleme notları

**Yöntem:** HTTP fetch (curl), oturum yok. Chrome tam etkileşim (mobil menü, cookie banner) kısmen **observed** / **requires-confirmation**.

**Etik:** Marka/metin/görsel kopyalanmaz; yalnızca işlev ve akış referansı.

## Marketing domain (`astra-ai.co/tr/`)

| URL | Başlık / amaç | Birincil CTA | Cortex Plus karşılığı | Kopyalanmayacak |
|-----|---------------|--------------|------------------------|-----------------|
| `/tr/` | AI öğretmen / sınav hazırlığı ana tanıtım | Uygulamaya git / kayıt | `/` landing | Astra logosu, slogan, görseller |
| `/tr/sinav-hazirligi` | Sınav hazırlığı ürün sayfası | Deneme / app CTA | `/sinav-hazirligi` | Özgün metinler |
| `/tr/mobil-uygulama` | iOS/Android indirme | Store linkleri | PWA + `/yardim` mobil bölümü | Store badge tasarımları birebir değil |
| `/tr/ogretmenler-ve-profesorler-icin` | Öğretmen programı | Başvuru / app | `/ogretmenler-ve-profesorler-icin` | Cortex matched 2025-08-26 |
| `/tr/yardim` | Yardım | Destek yönlendirme | `/yardim`, `/destek` (app) | — |
| `/tr/bize-ulasin` | İletişim | Form (gönderim **requires-confirmation**) | `/iletisim` | — |
| `/tr/kunye` | Künye / yayıncı | — | `/hakkimizda` + `/kvkk` | — |

## App domain (misafir gözlemi, fetch)

Giriş, fiyatlandırma, gizlilik ve koşullar **`app.astra-ai.co`** üzerinde:

- `privacy-policy`, `terms-conditions` (yasal)
- `tr-TR/onboarding` (kayıtlı akış — **blocked** misafir)
- `tr-TR/pay` (ödeme — **unsafe-to-test** onaysız)

## UX kalıpları (gözlem)

- Locale switcher (çoklu dil)
- Marketing → app subdomain geçişi
- Sınav hazırlığı ayrı landing
- Öğretmenler için ayrı mesajlaşma
- Mobil uygulama vurgusu (Cortex Plus: PWA öncelik)

## Test edilmeyen (misafir)

- Satın alma, kayıt formu gönderimi, iletişim formu → **requires-confirmation**
- Cookie tercih kaydetme → **requires-confirmation**

## İncelenemeyen

- Oturum açılmış dashboard, AI sohbet, limitler → Aşama B/C
- Admin, API, `/api/` → **blocked**

# Öğrenci-only uygulama — ücretsiz vs Plus ekranları

**Kapsam:** Veli ve okul öğretmeni UI kaldırıldı. Tüm giriş yapan kullanıcılar **öğrenci** akışındadır (`primary_role` legacy için DB’de kalabilir; yönlendirme `/ogretmen`).

## Tier tanımı

| | **Ücretsiz** | **Plus / Sigma** |
|---|-------------|------------------|
| Tanım | `isPremiumUser === false` | Aktif abonelik veya premium plan (`isPremiumUser`) |
| Kredi | `credit_wallets.balance` + `free_allowance_remaining` | Yüksek kota + gelişmiş model |
| AI model | Standart router | Gelişmiş model (`model-router`) |
| Chrome | Kredi chip, **Satın al ✦** | **Plus ·** kredi chip, aynı menü |

Kaynak: `getStudentAccountContext`, `isPremiumUser`, `StudentAccountStrip`, `AstraAppChrome`.

## Ortak kabuk (her iki tier)

- Alt dock: **Sor · Sınavlar · Uygulamalar** + menü
- Menü grupları: **Çalış** (sohbet, fotoğraf, doküman, quiz, flashcard, plan, ilerleme, panel), **Sınav**, **Hesap** (krediler, Plus, profil, ayarlar, bildirimler, yardım)
- `/ogretmen` — boş Sor, minimal composer
- `/giris`, `/kayit` — kayıt sonrası `/ogretmen`

## Ücretsiz’e özgü yüzeyler

| Rota / olay | Davranış |
|-------------|----------|
| `/pay`, `/paketler` | Plus satın alma (birincil dönüşüm) |
| `/krediler` | Düşük bakiye, ücretsiz hak gösterimi |
| 402 / limit API | Paywall sheet → `/pay?returnTo=…` |
| Sor composer | “Plus ile gelişmiş model” metni **gösterilmez** (`chat-panel`) |
| Menü | **Plus'a yükselt** → `/pay` |

## Plus’a özgü yüzeyler

| Rota / olay | Davranış |
|-------------|----------|
| Kredi chip | **Plus ·** öneki |
| AI chat / görsel / quiz / deneme üretimi | `isPremium: true` model seçimi |
| Sor yardım metni | Gelişmiş model notu |
| `/pay` | Plus zaten açıksa kart gizlenir / Sigma “Diğer planlar” |
| `/odemeler` | Abonelik geçmişi |

## Kaldırılan rotalar (→ `/ogretmen`)

- `/veli`, `/veli/*`
- `/ogretmen-paneli`, `/ogretmen-paneli/*`
- `/onboarding/veli`, `/onboarding/ogretmen`
- `/ogretmenler-ve-profesorler-icin` → `/kayit`
- Kayıtta veli / okul öğretmeni rolü

## Admin

- `/admin` — `requireAdmin`; öğrenci tier’ından bağımsız.

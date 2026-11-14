# 09 · Düello teknik tasarım (Faz 9.0)

14 Kasım 2026. ANA-PROMPT Faz 9 ve OTONOM §5–§6'ya göre. Kod ve canlı veritabanı okunmadı; yalnız depodaki göçler.

## Bugün depoda olan
Düello bugün çalışıyor (30 Eylül 2026, Paket E 29 Ekim 2026):

| Parça | Yer | Ne yapıyor |
|---|---|---|
| Tablolar | `supabase/migrations/20260930120000_prep_duels.sql` | `prep_duels` (hazırlık, kurucu, 7 soru `jsonb`, `share_code` benzersiz), `prep_duel_runs` (oyuncu, cevaplar, doğru, puan). RLS açık; ekleme yalnız sunucudan |
| Kurma | `POST /api/learning/exam-prep/duel` | Hazırlığın konusundan öğretmen test motoruyla 7 soru; ücretsizde ders sayacı (402 `free_lesson_limit`) |
| Oynama | `/duello/[code]`, `POST /api/duels/[code]/run` | Hesapsız açılır; tarayıcıya yalnız soru ve şıklar gider (`publicQuestions`), puan sunucuda |
| Bot | `POST /api/duels/[code]/bot`, `src/lib/learning/duel-bot.ts` | Tohumlu, sunucuda; üç düzey (Sınıf arkadaşı %60, Derece öğrencisi %80, Şampiyon %93); istemciye soru başına süre ve doğru / yanlış gider, şık gitmez; sıralamaya yazılmaz |
| Paylaşım | `src/lib/learning/duel-share.ts` | WhatsApp metni, davet kodlu kayıt bağlantısı |
| Hak | `DUEL_ACCESS` (`lib/entitlements/config.ts`) | Kurma: ücretsizde hediye bakiyesi ya da Plus; oynama ve bot herkese |

`/d/KOD` rotası, `duels` tablosu, `duel.enabled` bayrağı **yok**.

## Kararlar

**A. Veri.** Yeni `duels` tablosu açılmaz; bugünkü `prep_duels` / `prep_duel_runs` kullanılır. Gerekçe: oynanan bütün
düellolar orada, hesapsız oyun ve sunucuda puan zaten bu tablolarla kurulu; ikinci bir tablo iki düello sistemi demek.
Tasarımın istediği ek alanlar (yapılandırma, `seed`, durum, `parent_duel_id`, soru başına üretim ilerlemesi,
`question_started_at`) bugünkü tabloya **eklemeli** sütun olarak gelir. Bu fazda göç yazılmadı (aşağıda B).
Paylaşım kodu bugün 6–16 küçük harf / rakam (`/^[a-z0-9]{6,16}$/`); Crockford base32'ye geçiş "Sonraki karar".

**B. Üretim.** Tasarımın tür karışımı (Klasik, Doğru / Yanlış, Boşluk doldur, Şema yorumu, Hesaplamalı, Tuzaklı),
kademeli zorluk ve şablon imzası bugünkü üretimde yok; ANA-PROMPT B "yeni model istemi icat etme, gerekiyorsa ek
önerisi yaz, uygulamadan önce onayım şart" diyor. Bu yüzden 9B'nin üretim kısmı **Burhan kararı bekliyor**: öneri,
öğretmen test motoruna tür ve zorluk satırı eklemek (`teacher-quiz.ts`), şablon imzasını kodda çıkarmak (sayı ve birim
normalleştirilmiş kök). Onay gelmeden yazılmadı.

**C. Bot.** Bugünkü bot tasarımın istediği gibi deterministik ve yalnız sunucuda. Düzeyler tasarımın üç seviyesine
yakın (Çırak ≈ %50 → Sınıf arkadaşı %60; Rakip ≈ %70 → Derece öğrencisi %80; Usta ≈ %88 → Şampiyon %93); oranlar
değiştirilmedi (bugünkü davranış). **Rakip bilgi sızdırmaz:** bu fazda arayüz düzeyinde yapıldı: bayrak açıkken botun
bu sorudaki doğru / yanlışı, puanı ve nokta rengi öğrenci cevaplayana kadar gösterilmez ("cevapladı"). Bilinen sapma:
bot turunun zaman çizgisi (soru başına süre ve doğru / yanlış) oyunun başında tek yanıtta tarayıcıya geliyor; şık
gitmediği için doğru cevap sızmıyor, ama tasarım "istemciye gönderilmez" diyor. Soru soru veren uç 9B'nin işi.

**D. Puanlama.** Bugün sunucuda: doğru cevap ve hız puanı, son soru ×2 (`questionPoints`). Kazanan kafa kafaya tabloda
puandan (`headToHead`). Tasarımın "doğru sayısı belirler, hız ayrı bonus" kuralı puanlama değişikliğidir: 9B'ye.

**E. Tur içi.** Bugün süre istemcide sayılıyor, cevaplar bitişte tek istekle sunucuya gidiyor; sayfa yenilenince oyun
baştan. Sunucu zamanlı soru soru akış 9B'ye.

**F. Paylaşım ve meydan okuma (Faz 10).** Kart üretimi (`next/og`), `/d/KOD` sayfası ve hız sınırı yeni sunucuya bağlı;
Faz 10 bu yüzden 9B ile birlikte bekliyor. Bugünkü WhatsApp paylaşımı korunuyor.

**G. Plan.** `duel.start` `getGate`'te zaten var (Faz 3A). Bu fazda düello kurma düğmeleri bayrak açıkken `<Gate
action="duel.start">` içinde: kilitliyken istek atılmadan yükseltme penceresi. Sunucu kapısı bugünkü 402
(`free_lesson_limit`); `assertGate` eklenmedi (sunucu davranışı aynen, OTONOM §9).

**H. PR planı (uygulanan).** Faz 9 tek PR: 9.0 bu belge + 9A'nın bugünkü düello ekranlarına uygulanabilen kısmı
(`ui.v2.duello`: görünüm, BOT etiketi, nötr bot, `duel.start` kapısı). 9A'nın sahte verili yeni kurulum ekranı (soru
sayısı, süre, tür çipleri, VS ekranı) yeni sunucunun sözleşmesine bağlı; o sözleşme B'deki karara bağlı olduğu için
yazılmadı. 9B ve 9C **park** (aşağıda).

**I. Riskler ve Burhan kararı bekleyenler.**
1. Yeni üretim istemi (tür karışımı, kademeli zorluk): onay gerekiyor (ANA-PROMPT B).
2. Göç: proje canlıya göçü SQL ekranından uyguluyor, `supabase db push` kullanılmıyor (AGENTS.md "Göç kayıt tablosu").
   OTONOM §6.2 "yapılandırılmış standart migration yolu" şartı sağlanmıyor; göç yazılsa da Claude uygulamaz.
3. Puanlamanın "doğru sayısı önce" kuralına geçişi bugünkü sıralamayı (`prep_duel_runs.score`) değiştirir: ürün kararı.

## Park (ILERLEME "Park edilenler")
- **9B · Düello sunucusu ve `duel.enabled`:** B.1 onayı ve göçü uygulayacak yol (Burhan, SQL ekranı) gelince.
- **9C · Bağlama ve gerçek veritabanı e2e:** 9B'ye bağlı.
- **Faz 10 · Paylaşım kartı ve `/d/KOD`:** 9B'ye bağlı. `ui.v2.paylas` kapalı kalır.
- Düello bayrakları açılmaz: OTONOM §5 `duel.enabled`, `ui.v2.duello` ve `ui.v2.paylas` için §6 koşullarını ve 9C
  gerçek veritabanı e2e'sini şart koşuyor; ikisi de yok. `ui.v2.duello`'nun kodu birleşir, bayrak kapalı kalır.

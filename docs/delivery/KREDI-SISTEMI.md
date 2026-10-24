# Kredi sistemi v3 (24 Ekim 2026)

Ürün sahibinin kararları, aynı gün yapılan maliyet ve vergi hesabından sonra
(`cortex-plus/docs/delivery/MALIYET-VERGI-24-EKIM.md`): v2'de ders, test ve mesaj
ölçülen maliyetin 2-5 katı altındaydı; hakkının tamamını kullanan Plus öğrencisi ve
ücretsiz katman zarar ettiriyordu. Plus'ın hakkı (ayda 7.200, haftada 2.700) aynı
kalır; işlerin fiyatı gerçek maliyete çekilir, ücretsiz hesap krediyle değil
sayaçla çalışır, yıllık planlar satıştan kalkar.

Kodda tek kaynak: `cortex-plus/src/lib/credits/price-table.ts` (fiyat),
`cortex-plus/src/lib/billing/free-meters.ts` (ücretsiz sayaçlar). Göçler:
`20261024121000_free_tier_counts` (sayaçlar; yalnız ekleme, koddan önce),
`20261024120000_credit_prices_v3` ve `20261024123000_free_daily_zero` (fiyat ve
günlük kredi 0; koddan sonra, birlikte), `20261024122000_retire_yearly_plans`.
Geri alma: `cortex-plus/supabase/rollback/20261024_kredi_v3_geri_al.sql` (göç
değil, aşağıda). Bekçi: `free-tier-counts.test.ts` (göçleri yayın sırasıyla ve
geri alma dosyasını PGlite'ta çalıştırır), `free-meters.test.ts`,
`plus-month.test.tsx`, `marketing-claims.test.ts`.

## Fiyatlar (1 kredi ≈ $0,001 gerçek maliyet)

| İş | v2 | v3 | Ölçülen (23 Ekim) |
|---|---|---|---|
| Ders | 6 | **30** | $0,028 |
| Konu testi | 4 | **10** | $0,010 |
| Kart seti | 3 | **4** | — |
| Belge sayfası | 2 | **5** | $0,0043 |
| Fotoğraftan çözüm | 10 | **4** | $0,0034 |
| Sözlü deneme | 8 | **6** | — |
| Sohbet mesajı | 3 | 3 | genel cevap tek çağrı ~$0,0002; belgeye dayanan cevap luna denetimiyle ~$0,001-0,002 |
| Podcast, yazılı deneme, video, ses | 12 · 15 · 280 · 15/900 karakter | aynı | 5 dk sesli podcast $0,070 |

Mesaj 3'te kaldı (ürün sahibinin kararı: "Denetimi luna'ya al, mesaj 3 kredi
kalsın"): sohbetin ikinci model çağrısı yalnız öğrencinin belgesine dayanan
cevapta çalışıyor (#396) ve denetçi gpt-4.1 yerine luna (görselli soruda gpt-4.1
kalır). Eski belge ekli sohbet mesajı ~$0,026 tutuyordu.

**Plus'ın bir ayı (hakkın tamamı tek işe):** 240 ders · 720 test · 1.800 kart ·
100 sesli podcast · 1.200 sözlü · 480 yazılı deneme · 1.800 fotoğraf · 25 video ·
2.400 mesaj. Astra Plus (8 Ekim ölçümü): ≈2.000 mesaj, 220-380 ders.

## Ücretsiz hesap: sayaçla

| Sayaç | Sınır | Dönem | Ne düşer |
|---|---|---|---|
| `lesson` | 3 | ISO hafta, Pazartesi 00:00 İstanbul (`2026-W43`) | Yoldaki ders; "Farklı anlat" yeni ders; Araçlar'dan açılan test, kart, doğru/yanlış; yolda dersi açılmamış konunun testi |
| `included` | 40 (kötüye kullanım sınırı, görünmez) | gün | Ders içi yardım (koç, açıklama, geri bildirim, tanışma, tanı) ve yolda dersi açılmış konunun testi/kartları |
| `chat` | 3 | gün | Sohbet mesajı, yazılı soru çözümü |
| `photo` | 1 | gün | Fotoğraftan çözüm (sohbette ya da soru çözücüde) |

- Podcast, sözlü, yazılı deneme, video, sesli tur ve seslendirme ücretsizde
  **Plus'ta** (`PLUS_ONLY_ACTIONS` = SQL `plus_only_action`). Karar fiyattan
  türetilmez: fiyat değişince kapı ters dönüyordu (sözlü 6'ya inince ücretsizde
  açılırdı, ders 30'a çıkınca "Plus" rozeti alırdı).
- Ücretsiz günlük kredi **0**. Sayaç dolunca hediye bakiyesi (davet, eski kampanya
  kodu) yetiyorsa iş onunla açılır; yetmezse `free_limit:<sayaç>`.
- İade aynı gün/haftadaysa sayacı geri verir; dönem geçtiyse vermez.
- Belge işleme, konu haritası, kurulum sohbeti eskisi gibi ücretsizde kredisiz
  (sınırı toplam 5 sayfa ve bir hazırlık koyar).
- Önceden yazım ücretsiz öğrencide yalnız ders hakkı kaldıysa (`skipped:
  "free_limit"`); kredi açılınca düşer, kural değişmedi.

**Tek giriş:** `credit_reserve_metered(user, action, key, quantity, meter)`.
Abone ve (önizlemesi kapalı) yönetici doğrudan `credit_reserve`'e gider; ücretsiz
hesap sayaca. Önizlemeye abonelikten önce bakılır: aboneliği olan kurucu da
önizlemede sayaca girer. Uygulamada `reserveCredits(…, { freeMeter })`; sayaç
verilmezse işin varsayılanı (`defaultFreeMeter`). Fonksiyon hem v2 hem v3
`credit_reserve`'ün üstünde çalışır. Canlıda yoksa (PGRST202) kod eski
`credit_reserve`'e düşer; bu yalnız emniyet, sıra gereği fonksiyon koddan önce
gelir.

**Ret kodları (402):** `free_lesson_limit`, `free_chat_limit`, `free_photo_limit`,
`free_included_limit`, `premium_required`. Kapı sayacın kendi saatini gösterir
(ders Pazartesi, öteki gece yarısı); Plus işinde "doldu" ve geri sayım yok.

**"Ücretsiz gibi gör" önizlemesi:** kurucu ücretsiz hesap gibi sayaca girer;
önizleme açılınca sayaçları sıfırlanır; sayaç dolunca kendi cüzdanına düşmez
(cüzdan hediye bakiyesi değil).

## Davet

Davetle gelip hesabını doğrulayan öğrenci ilk işini yapınca (ücretsiz, Plus ya da
denemede) **iki tarafa bir kez 90 kredi** (3 ders kadar; Plus dışı her işte, sayaç
dolunca harcanır). Davet eden en çok 3 davetten alır. İki cüzdan ilk hediyeden
önce kimlik sırasıyla birlikte kilitlenir: aynı anda gelen iki davetli sınırı
aşamaz, karşılıklı davette (A'yı B, B'yi A davet etmiş) iki istek birbirini
kilitlemez. Eski çarpan (`referral_multiplier`) v3 `credit_reserve`'de kalktı.

## Yıllık planlar

`plus-yillik` ve `sigma-yillik` `active = false`: ₺2.990'lık yıllık Plus abone
başına ayda ~₺200 bırakıyordu ve hiçbir senaryoda kâra katkısı yoktu. Satırlar
silinmez; elinde yıllık abonelik olan dönem sonuna kadar Plus kalır ve planını
okuyabilir (`plans_held_by_user` politikası). `20260906130000_subscription_billing.sql`
yeniden uygulanmamalı: oradaki upsert yıllıkları yeniden satışa açar.

## Canlıya geçiş sırası

Hiçbir ara durum ücretsiz katmanı düşürmesin diye göçler ikiye bölündü: eski kod
`credit_reserve`'ü doğrudan çağırır, yeni kod `credit_reserve_metered`'ı.

| Adım | Ne | Eski kodla | Yeni kodla |
|---|---|---|---|
| a | SQL ekranında `20261024121000` + kayıt satırı, **koddan önce**; ardından doğrulama sorgusu `true` dönmeli | v2 gibi (credit_reserve değişmedi) | — |
| b | Kod main'e **yalnız (a) doğrulandıktan sonra**, yayın çıkar (Vercel READY) | — | Ücretsiz sayaçla (fotoğraf günde 1, ders haftada 3); abone bu arada v2 fiyatından öder |
| c | **Tek SQL çalıştırmasında** `20261024120000` + `20261024123000` ve iki kayıt satırı | Ücretsiz hiçbir şey açamaz | v3 |
| d | `20261024122000` (yıllıklar) kod yayındayken herhangi bir an + kayıt satırı | — | — |
| e | `/admin/sistem` "Kredi v3 ve ücretsiz sayaçlar" yeşil; sonra "Ücretsiz gibi gör" ile bir ders, üç mesaj, bir fotoğraf | — | — |

Kayıt satırları ve (a)'nın doğrulaması, SQL ekranına aynen:

```sql
-- (a) 20261024121000'in sonuna, aynı çalıştırmada:
insert into supabase_migrations.schema_migrations (version, name) values ('20261024121000', 'free_tier_counts')
  on conflict (version) do nothing;
-- (a)'dan sonra, push'tan önce; true dönmeli:
select to_regprocedure('public.credit_reserve_metered(uuid,text,text,integer,text)') is not null;

-- (c) iki göçün ardından, aynı çalıştırmada:
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261024120000', 'credit_prices_v3'), ('20261024123000', 'free_daily_zero')
  on conflict (version) do nothing;

-- (d) 20261024122000'in sonuna:
insert into supabase_migrations.schema_migrations (version, name) values ('20261024122000', 'retire_yearly_plans')
  on conflict (version) do nothing;
```

- (a)'nın doğrulaması atlanmaz: göç atlanır ya da yanlış projeye uygulanırsa yeni
  kod `credit_reserve_metered`'ı bulamaz (PGRST202) ve sessizce sayaçsız v2
  `credit_reserve`'e düşer. Ücretsiz fotoğraf (v2'de 10) günlük hakka (6) sığmaz;
  tek iz bir `console.warn`. Sorgu `false` dönerse push etmeyin. Aynı soruyu
  `node cortex-plus/scripts/acilis-kapisi.mjs --db` da sorar: "✓ 20261024121000 —
  credit_reserve_metered yerinde".
- Kayıt satırları `on conflict (version) do nothing` ile yazılır: geri almadan sonra
  v3'e dönerken (c) yeniden çalışır ve satırlar zaten vardır. Düz insert duplicate
  key ile düşer; tek çalıştırma tek işlem olduğu için iki göç de uygulanmaz.
- (c) tek çalıştırma tek işlemdir: fiyatlar ve günlük kredi 0 birlikte görünür ya da
  hiç görünmez. Ayrı ayrı çalıştırmayın: yalnız fiyat göçü varken bir ders (30)
  ücretsizin v2 günlük hakkına (6) sığmaz.
- (e)'deki satır üç şeye birden bakar: ders fiyatı 30, `free_usage` tablosu ve
  `unverified_allowance()` 0 (yalnız `20261024123000` getirir). (c)'nin yarısı
  yapıştırılmadıysa satır kırmızıdır.
- (a)'dan sonra eski kod v2'deki gibi çalışır; ücretsiz öğrenci bir şey kaybetmez.
  Hesap silme de bu yüzden güvenli: `free_usage` tablosu koddan önce var
  (`account-deletion.ts` onu siler, tablo yoksa adım düşer).
- (b) ile (c) arası dakikalar sürsün; o arada abone ders başına 6 öder (v2).
- "Ücretsiz gibi gör"ü (c)'den önce açmayın: uygulama önizleme satırını 0 hakla açar,
  v2 `credit_reserve` o günün sonuna (UTC) kadar önizlemenin sayaçsız işlerini
  reddeder; deneme yanıltır. Kapatıp (c)'den sonra yeniden açmak yeter.

**Geri alma.** (c)'den sonra kod v3 öncesine geri alınacaksa (Instant Rollback ya
da revert) **önce** `cortex-plus/supabase/rollback/20261024_kredi_v3_geri_al.sql`
SQL ekranında tek çalıştırmada: v2 fiyatları, v2 `credit_reserve` (ücretsiz günde 6,
davet çarpanı), doğrulanmamış hak 6, eski varsayılanlar (önizleme 6, yeni cüzdan
50, dönem hakkı 6); v3'te 0 ile açılmış bugünkü ücretsiz günler biter. Hiçbir şey
silinmez: sayaç tablosu ve sayaçlı fonksiyon kalır, sonuç (a)+(b) durumudur ve iki
kodla da güvenli. Yıllıkları yeniden satışa açmak dosyanın sonunda yorum satırı
(isteğe bağlı). Göç kayıt satırları silinmez; v3'e dönerken (c) aynı şekilde,
yukarıdaki `on conflict (version) do nothing`'li kayıt satırlarıyla yeniden
çalıştırılır. Dosyayı uygulamadan kodu geri almak ücretsiz katmanı tümden kapatır:
eski kod v3 fiyatı ve 0 günlük krediyle hiçbir ders ya da test açamaz.

**Kabul edilen boşluk: abonede davet çarpanı.** v3 `credit_reserve` çarpanı
uygulamaz; (c) ile geri alma arasında dönemi yenilenen abone cüzdanı (aylık,
haftalık) hakkını çarpansız alır (davetle gelen Plus 21.600 yerine 7.200). Geri alma
dosyası abonelik dönemlerine dokunmaz; v2 çarpanı o cüzdanın sonraki yenilemesinde
(en çok 30 gün sonra) döner. Tamamlama bilerek yazılmadı: 24 Ekim 2026'da canlıda
etkin ücretli abonelik ve artı bakiyeli cüzdan yoktu, boşluk kimseyi etkilemiyor.
Aboneler varken geri almak gerekirse önce bu paragrafa yeniden bakın. Bekçi:
`free-tier-counts.test.ts` (v3 yenilemesi 7.200, geri almadan sonraki 21.600).

---

# Kredi sistemi v2 (8 Ekim 2026) — geçmiş; fiyatlar ve ücretsiz hak v3 ile değişti

Ürün sahibinin kararı: Astra tarzı tek sayaç, **Astra'dan daha fazla kullanım**,
yoğun öğrencide **%50 kâr**. Sayılar canlıda ölçüldü; tahmin yok.

Kodda tek kaynak: `cortex-plus/src/lib/credits/price-table.ts` (özet) ve
göç `20261008120000_credit_system_v2.sql` (asıl). Bekçi:
`tests/unit/credit-system-v2.test.ts` (göçü PGlite'ta çalıştırır).

## Ölçülenler (8 Ekim 2026)

| | Değer | Kaynak |
|---|---|---|
| Dolar | ₺49,22; hesapta **₺52** (yükselişe pay) | piyasa |
| KDV | %20, fiyata dahil | |
| PayTR komisyonu | **%2,95**, vergiler dahil | PayTR Mağaza Paneli → Bilgi |
| Satıştan kalan | fiyatın **%80,4'ü** | |
| Astra Plus, 1 sohbet mesajı | aylık hakkın **%0,05'i** → ayda ≈ **2.000 mesaj** | Profil → Kullanım, `bucket.usedPercent` 13,76 → 13,81 |
| Astra Plus, 1 ders | aylık hakkın **%0,26–0,45'i** → ayda ≈ **220–380 ders** | aynı yerden, 13,81 → 14,26 |
| Astra fiyatı | Plus ₺599/ay (yıllıkta ₺250/ay), Sigma ₺1.997/ay | app.astra-ai.co/pay |
| Bizim mesaj (cevap + belge denetimi) | ~$0,003 | `ai_usage_events`, 3 Ekim sonrası |
| Bizim ders | $0,004–0,009 | aynı |
| Bizim test | $0,004 · kartlar $0,0023 | aynı |
| Taranmış sayfa okuma | $0,0056/sayfa | aynı |
| Metinli sayfa temizliği | $0,0014/sayfa | aynı |
| Büyük belgenin konu haritası | gpt-4.1'de 100 sayfada **$0,30**; luna'da ~**$0,007** | yerel altın deneme (211 + 99 sayfa, toplam $0,022) |

## Birim

**1 kredi = $0,001 model maliyeti = ₺0,052.** Her işin kredisi ölçülen
maliyetinden. Öğrenci hakkını hangi işe harcarsa harcasın maliyetimiz hakla
orantılı kalır. Öğrenci sayıyı değil **yüzdeyi** görür (#179).

## İşlem başına kredi

| İşlem | Kod | Kredi |
|---|---|---|
| Sohbet mesajı (standart ve gelişmiş; ikisi de luna) | `AI_CHAT_STANDARD` / `_ADVANCED` | 3 |
| Sesli sohbet turu | `VOICE_TURN` | 6 |
| Ders | `STUDY_PLAN_GENERATE` | 6 |
| Konu testi, tuzak, tekrar, son kontrol, doğru-yanlış, düello | `QUIZ_GENERATE` | 4 |
| Kartlar | `FLASHCARD_GENERATE` | 3 |
| Sözlü deneme | `ORAL_EXAM_GENERATE` | 8 |
| Podcast | `PODCAST_GENERATE` | 12 |
| Yazılı deneme sınavı (değerlendirme dahil) | `PRACTICE_EXAM_GENERATE` | 15 |
| Fotoğraftan soru | `IMAGE_SOLUTION` | 10 |
| Belge, metinli sayfa | `DOCUMENT_PAGE_PROCESS` (sayfa başına) | 2 |
| Belge, taranmış sayfa (üstüne) | `DOCUMENT_SCAN_PAGE` | 6 |
| Seslendirme (900 karakter) | `AUDIO_SYNTHESIZE` | **15** (19 Ekim 2026; önce 2 — ölçülen maliyet 900 karakter ≈ $0,015, `MALIYET-MODELI.md`) |

Konu haritası, kurulum sohbeti ve hazırlık adı haktan düşmez (#249).

## Paketler

| Paket | Fiyat | Hak | Karşılığı | Astra |
|---|---|---|---|---|
| Ücretsiz | — | günde 6 | 1 ders ya da 2 mesaj; toplam 5 sayfa belge, 1 hazırlık | ≈1,5 mesaj/gün |
| Plus haftalık | ₺349 | haftada 2.700 | 900 mesaj / 450 ders | yok |
| **Plus aylık** | **₺599** | **ayda 7.200** | **2.400 mesaj (Astra +%20) / 1.200 ders (3–5 kat)** | 2.000 / 220–380 |
| Plus yıllık | ₺2.990 | ayda 7.200 | aynı | ₺250/ay |
| Sigma aylık / yıllık | ₺1.999 / ₺9.990 | ayda 60.000 | 20.000 mesaj (Astra Sigma +%25) | 8 × Plus |
| Ek paket S / M / L | ₺129 / ₺329 / ₺749 | 1.000 / 2.500 / 5.750 | tam kullanımda bile %50 | |

Hak öğrenciye somut sayıyla anlatılır: "Ayda yaklaşık 2.400 mesaj ya da 1.200
ders" (`allowanceWorkLine`). "Kat" yazılmaz.

## Kâr (KDV, PayTR ve model maliyeti düşülünce)

Normal öğrenci: günde 1 ders + 1 test + 10 mesaj = ayda 1.200 kredi.
Yoğun öğrenci: günde 3 ders + 2 test + 30 mesaj + 1 podcast = ayda 3.840 kredi.

| Paket | Normal | Yoğun | Hak tamamen biterse |
|---|---|---|---|
| Plus aylık | %87 | %58 | %22 |
| Plus haftalık | %95 | %83 | %50 |
| Plus yıllık | %69 | ~%0 | zarar |
| Sigma aylık | %96 | %88 | 60.000'in tamamında zarar (ayda 20.000 mesaj, gerçekçi değil) |

Kararlar (ürün sahibi, 8 Ekim):
- %50 **yoğun öğrenciye** göre (hakkın tamamına göre değil).
- Yıllık Plus ₺2.990 ve aynı hakla kalır (Astra ile aynı fiyat; yıllık
  alanlar her ay yoğun çalışmaz).
- Belge tek sayaçtan; büyük belgenin haritası luna'ya geçti.
- Eski bakiyeler sıfırlandı, herkes yeni dönemle başladı (o gün aktif
  abonelik yoktu; iki öğrencide 4'er eski kredi vardı).
- Sigma 60.000.

Sabit giderler (Vercel, Supabase, alan adı) bu kâra dahil değil.

## Belge nasıl düşer

PDF'te ilk adımda sayfa sayısı × 2 ayrılır; hak yetmezse yettiği kadar sayfa
işlenir (ücretsizdeki 5 sayfa sınırıyla aynı yol). Taranmış sayfa okunduktan
sonra sayfa başına 6 düşer; hakkı aşan resim sayfaları atlanır. PDF dışı
belgede ilk sayfa önden, kalanı işlendikten sonra. Sihirbaz yüklemeden önce
"hakkının yaklaşık %X'i" ya da "ilk N sayfasına yetiyor" der.

## Değişirse

Bir işin maliyeti değişirse önce `ai_usage_events`'ten yeniden ölç (3 Ekim
sonrası, `reservation_id` ile işlem başına topla), sonra göçte ve
`price-table.ts`'te aynı anda değiştir — test ikisini karşılaştırıyor.

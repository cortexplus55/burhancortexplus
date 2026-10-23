# Kullanıcı başı maliyet, Türkiye vergisi ve net kâr — 24 Ekim 2026

Ürün sahibi: "API giderleri, Supabase, Vercel dahil bir kullanıcıya kaç TL giderimiz oluyor, bana net kalan ne oluyor;
yıllık plan alanı da hesapla; fiyatımıza göre verdiğimiz hizmetle Astra'yla karşılaştır." Yıllık Plus'ta hak aylıkla
aynı (ayda 7.200, ürün sahibinin kararı).

## Kaynaklar ve varsayımlar

| Kalem | Değer | Kaynak |
|---|---|---|
| Kur | $1 = ₺50 (23 Ekim ₺49,74) | piyasa |
| KDV | %20; %10 uygulanmaz (5580 sayılı kurum değiliz; şifreyle erişilen e-içerik genel oran) | GİB özelgesi 45943, 82637 |
| Yurtdışı hizmet KDV'si (OpenAI, Vercel, Supabase) | Sorumlu sıfatıyla %20, 2 No.lu beyanname; aynı ay indirilir → net 0, her ay beyan şart | KDVK 9/1, KDV-GUT III/C-1.1 |
| PayTR komisyonu | %2,95; **KDV yok, BSMV var** → indirilemez, tamamı gider | KDVK 17/4-e |
| Gelir vergisi 2026 | 190 bin %15 · 400 bin %20 · 1 milyon %27 · 5,3 milyon %35 · üstü %40 | RG 31.12.2025 |
| Geçici vergi | %15, üç ayda bir, yıllık beyannamede düşülür (ek yük değil) | GVK 120 |
| Bağ-Kur 2026 | Ayda 10.156,73 TL (indirimli taban); ticari kazançtan gider yazılır; 4/a çalışan sahip için yok | 5510 md. 53, GİB rehberi |
| Genç girişimci | 29 yaş altı, ilk kez mükellef: yılda 400.000 TL kazanç istisnası, 3 yıl; Bağ-Kur desteği 2026'da kalktı | GVK mük. 20, 7566 s. K. |
| Defter | Yıllık hasılat 1,2 milyon TL'yi geçince bilanço + e-defter (~200 aylık abone) | VUK 177, 588 Sıra No |
| e-Arşiv | 500 bin TL satışı geçince entegratör zorunlu; 1.1.2027'den tüm faturalar e-Arşiv | VUK 509, 589 |
| Mali müşavir | Asgari tarife işletme 1.145 TL, bilanço 3.091 TL (KDV dahil); **piyasa** 3.000 / 4.500 TL + KDV | RG 17.12.2025 |
| Beyanname damga vergisi | KDV 791 TL × 12, geçici 791 TL × 4, yıllık 1.189,50 TL → ayda ~1.154 TL | 71 Seri No DV Tebliği |
| Vercel | Pro zorunlu (Hobby ticari kullanımı yasaklıyor): $20 + $20 kullanım kredisi; çalıştırma son 30 günde model giderinin **%13'ü** (22,7 GB-saat, 2 s 16 dk işlemci); **derleme ~$31/ay** (147 işlemci-saat) | vercel.com/docs, kendi kullanım ekranımız |
| Supabase | Pro $25 (Micro dahil); 500 abonede Small (+$5), 1.000'de Medium (+$50) | supabase.com/pricing |
| Model (OpenAI) | 23 Ekim ölçümü: ders $0,028 (ısınma artık normal), test $0,010, mesaj $0,0101, 5 dk sesli podcast $0,070, fotoğraf $0,0034, sayfa $0,0043 | `ai_usage_events`, `_tmp/cost-bench` |
| Ücretsiz öğrenci | Abone başına 5 aktif ücretsiz öğrenci, kişi başı ₺17,5/ay (varsayım) | — |

Kullanım profilleri (ayda): **hafif** 20 ders, 20 test, 150 mesaj, 4 podcast · **normal** 30 ders, 30 test, 300 mesaj,
9 podcast · **yoğun** 90 ders, 60 test, 900 mesaj, 30 podcast (hepsine fotoğraf, belge, kart, deneme eklenmiş).
Normal öğrencinin model giderinin **%56'sı sohbet mesajı** ($3,03 / $5,37).

## Bir abone, ayda (500 abone ölçeğinde, normal öğrenci, bugünkü krediler)

| | Aylık Plus | Yıllık Plus |
|---|---|---|
| Ödenen | 599,00 | 249,17 (2.990 / 12) |
| KDV (devlete) | −99,83 | −41,53 |
| PayTR | −17,67 | −7,35 |
| **Satıştan kalan** | **481,50** | **200,29** |
| OpenAI (model + ses) | −269 | −269 |
| Vercel çalıştırma | −35 | −35 |
| Ücretsiz öğrencilerin payı | −88 | −88 |
| Sabit giderlerin payı (Bağ-Kur 20, müşavir 9, Supabase 3, Vercel 3, Upstash/PostHog 3, damga 2, e-Arşiv 2) | −43 | −43 |
| **Vergi öncesi** | **+47** | **−234** |
| Gelir vergisi | 0 (işletme zararda) | 0 |

| Öğrenci (500 abone) | Aylık Plus | Yıllık Plus |
|---|---|---|
| Hafif | +191 | −90 |
| Normal | +47 | −234 |
| Yoğun, bugünkü krediler | −540 | −821 |
| Yoğun, yeni krediler | −48 | −329 |

## İşletme toplamı: sahibe ayda kalan (vergiden sonra)

%70 aylık + %30 yıllık abone, kullanım %30 hafif / %50 normal / %20 yoğun, abone başına 5 ücretsiz öğrenci, Bağ-Kur dahil.

| Senaryo | 100 abone | 300 | 500 | 1.000 | 2.000 | Başabaş |
|---|---|---|---|---|---|---|
| A. Bugün | −25.000 | −40.600 | −55.800 | −97.500 | −173.400 | yok |
| B. Yeni krediler | −15.200 | −11.000 | −6.600 | +800 | +19.600 | ~790 abone |
| C. B + sohbet tek model çağrısı | −7.200 | +10.900 | +27.300 | +61.900 | +128.500 | ~170 |
| D. C + ücretsiz katman sıkı (₺10) | −3.500 | +20.100 | +41.000 | +86.500 | +177.200 | ~125 |
| E. D + yıllıkta hak 3.600 | −1.500 | +24.800 | +48.200 | +99.300 | +202.900 | ~110 |

Kârda olunca efektif gelir vergisi %15–32 (tabloya düşülmüş). Bağ-Kur yoksa (sahip 4/a çalışıyor) her satıra +10.157;
genç girişimci istisnası varsa ilk 400.000 TL kazanç vergisiz.

E senaryosunda (1.000 abone) abone başı net: aylık Plus hafif 206 · normal 133 · yoğun 87; yıllık Plus hafif 3 ·
normal −15 · yoğun −14. Yıllık Plus ₺2.990'da ayda yalnız ₺200 bırakıyor; hak ne olursa olsun kâra katkısı yok.

## Riskler ve yapılacaklar

| Risk | Etki | Ne yapılmalı |
|---|---|---|
| OpenAI vergi numarasız Türk hesabına %20 KDV yansıtıyor; bu KDV indirilemeyebilir | Model gideri ×1,2 | OpenAI faturalama ayarına VKN girilmeli, KDV-2 ile beyan |
| Vercel Hobby ticari kullanımı yasaklıyor; Supabase ücretsiz plan hareketsizlikte duraklıyor | Hizmet kesilir | Satıştan önce Vercel Pro + Supabase Pro |
| Vercel/Supabase/Upstash ödemesi GİB'e göre gayrimaddi hak sayılabilir → stopaj | 500 abonede ayda ~1.300 TL (ABD mukimlik belgesiyle %5) ile ~6.300 TL (%20, brüte tamamlanmış) | Mali müşavire sor, mukimlik belgesi iste |
| ETBİS kaydı | Kayıtsızlık cezası 143.102–715.516 TL | Kayıt durumu doğrulanmalı |
| Yıllık planın KDV'si satış ayında tamamen ödenir | Nakit: 2.990 TL'lik satışta o ay 498 TL KDV | Nakit planı |
| Derleme ücreti (~$31/ay) | Sabit gider | Belge değişikliklerinde önizleme derlemesi kapatılabilir |

Hesap betiği: oturum çalışma alanındaki `pnl4.cjs` / `pnl5.cjs` (kalemler ve varsayımlar başta).

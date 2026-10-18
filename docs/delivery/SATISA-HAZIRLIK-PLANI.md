# Satışa hazırlık planı — 18 Ekim 2026

Ürün sahibinin sorusu: "Sistem tam anlamıyla satışa ve kullanmaya hazır mı?" Cevap ölçüme dayanıyor;
tahmin edilen her yer "ölçülmedi" diye işaretli. Kaynaklar: canlı veritabanı (yalnız okuma), Vercel ve
Supabase panelleri, kod, 18 Ekim'deki canlı denemeler (`OGRETMEN-GOZU`, `DERS-HIZI-18-EKIM.md`).

## Kısa cevap

**Öğrenme döngüsü satılabilir kalitede; altyapı ve işletme tarafı değil.** Bugün bir öğrenci PDF
yükleyip ders, test, podcast, video ve deneme sınavıyla çalışabiliyor ve bu akış Astra'yla yan yana
ölçüldü. Ama sistem **kişisel (ücretsiz) planlarda** çalışıyor, yük altında hiç denenmedi, telefonda
giriş yapılmış ekranlar doğrulanmadı ve birkaç yönetim işlemi eksik. Aşağıdaki 0. faz bitmeden para
alınmamalı.

## Soru soru durum

| Soru | Durum | Dayanak |
|---|---|---|
| Bütün belgelerden mantıklı sıra kuruyor mu? | **Evet, kodda; canlıda tek belgeyle doğrulandı** | Dosyalar tek listede birleşir (`cross-material-topics.ts`), sıra öğretmen analizindeki önkoşullardan (`topic-order.ts`), öğrenci oklarla değiştirebilir. Çok belgeli hazırlık canlıda bu turda denenmedi → Faz 1 |
| Öğretmen gibi tam anlatıyor mu? | **Büyük ölçüde; tek konuda ölçüldü** | Pediatri, 1. konu: 64 → ~84/100 (Astra 72). Kaynak sadakati, tablo, alarm kutusu, sınav maddeleri, vurgu canlıda görüldü. 10 konunun 9'u ölçülmedi; #303 öncesi analiz 2 sayfayla sınırlıydı |
| Sınava tam hazırlıyor mu? | **Ölçülmedi** | Bunu ancak öğrenci sonucu gösterir: deneme sınavı puanı (önce/sonra). Faz 1'de ölçüt kuruluyor |
| Hiç bilgisi olmayan biri hazırlanabilir mi? | **Yol var, sonucu ölçülmedi** | "Bu benim için yeni" → ders sıfırdan, terim tanımlanmadan kullanılmaz; seviye tespiti; kolay zorluk. Uçtan uca "sıfırdan deneme sınavına" senaryosu hiç koşulmadı → Faz 1 |
| Astra mantığıyla aynı mı? | **Evet, yapı aynı; iki bilinçli fark** | Yol, ders→test→podcast→deneme, yıldız, düello, kilitli adım, seviye önerisi aynı. Fark: biz belgeye daha sadığız (Astra dış bilgiyi belgeden gibi veriyor); Astra sıradakini önceden yazmıyor, biz yazıyoruz |
| Tasarım premium mu? | **Evet; telefonda 18 Ekim'de doğrulandı** | Astra'nın yazı tipi ve paleti birebir (17 Ekim), 3B düğümler. 375 px'te ~116 sayfa gezildi; dört taşma düzeltildi (#305) |
| Mobilden aynı çalışıyor mu? | **Evet (emülasyonda); gerçek telefon 2.1'de** | 18 Ekim: giriş yapılmış ~90 sayfa 375×812'de tek tek açıldı — ders ekranları, test, video, sohbet, stüdyo, yönetim dahil. Bulgular ve düzeltmeler AGENTS.md "Telefon denetimi"; bekçi `mobile-audit-guards.test.ts`, oturumlu e2e 390 px (#306) |
| Kaldığı yerden devam (web ↔ mobil)? | **Evet** | Her oturum sunucuda (`exam_prep_node_attempts`), "Kaldığın yer açılıyor" canlıda görüldü. Kurulum sihirbazının yarım taslağı da 18 Ekim'den beri sunucuda (`exam_wizard_drafts`, 2.3); tarayıcı kopyası kalır, yeni olan açılır |
| Aynı anda 1000 kullanıcı? | **Hayır, bugün değil** | Hiç yük testi yok. Vercel **Hobby** (kişisel plan, ticari kullanıma kapalı, ödeme yöntemi tanımlı değil), Supabase **Free** (yedek yok, hareketsizlikte duraklar, 60 bağlantı). Asıl darboğaz OpenAI dakikalık jeton sınırı: bir ders ~5-8 bin jeton; 1000 eşzamanlı ders dakikada milyonlarca jeton ister → kuyruk şart. Faz 0 + Faz 3 |
| Herkes kendi verisini mi görüyor? | **Evet** | 121 tablonun hepsinde satır düzeyi güvenlik açık; 7 iç tablo (kuyruk/önbellek) kullanıcıya tümüyle kapalı. Düğüm/hazırlık uçları `user_id` ile süzüyor |
| Yönetici her şeye müdahale edebiliyor mu? | **Çoğuna; 6 eksik** | 17 yönetim sayfası: kullanıcılar (kredi ekle/düş, yetki), ödemeler (PayTR iade), kredi kuralları, paketler, promosyonlar, bayraklar, istemler, ders hataları, AI kullanımı, maliyetler, kötüye kullanım, denetim günlüğü, sistem, "ücretsiz gibi gör". **Yok:** hesabı askıya alma, kullanıcının hazırlığını destek için görme, takılı dersi sıfırlama, belge analizini yeniden çalıştırma, abonelik süresini elle uzatma, kullanıcı arama/filtre → Faz 4 |
| Her olası sorunu yönetici çözebilir mi? | **Hayır, henüz** | Hata izleme (Sentry) kodda kurulu; canlıda DSN'in dolu olduğu ve uyarının e-postaya düştüğü doğrulanmadı. Takılı ders, yanlış kredi düşümü, PayTR geri bildirim hatası için yazılı çözüm adımı (runbook) yok → Faz 4 |

Canlı sayılar (18 Ekim): 14 hesap, son 7 günde yeni kayıt 0, 15 hazırlık (2 hesaptan), 30 günde 81
oturum, 7 günde 11 ders üretim kaydı (7 yavaş, 3 başarısız, 1 kavram atıldı), 2 ödeme (test), veritabanı
49 MB. Yani **gerçek kullanıcı yok**; her şey kurucu denemesi. Bu iyi: kapalı betaya temiz başlanır.

## Faz 0 — Satış engelleri (bu hafta, para almadan önce zorunlu)

| # | İş | Neden | Kim | Süre |
|---|---|---|---|---|
| 0.1 | **Vercel Pro'ya geç** (20 $/ay) | Hobby planı kişisel kullanım içindir; ticari sitede hesap kapatılabilir. Ayrıca cron 2/gün sınırı (23 Eylül'de yayın durdu), tek bölge, sınırlı eşzamanlılık | Ürün sahibi (kart) | 10 dk |
| 0.2 | **Supabase Pro'ya geç** (25 $/ay) + günlük yedek; PITR isteğe bağlı (+100 $) | Free'de yedek yok, proje hareketsizlikte duraklar, kaynaklar paylaşımlı. Müşteri verisi yedeksiz tutulamaz | Ürün sahibi | 10 dk |
| 0.3 | OpenAI hesabının **kullanım katmanını ve dakikalık sınırını** oku; sınır aşımında kullanıcıya düzgün mesaj + yeniden deneme var mı doğrula | 429 yeniden denemesi var (`transient-retry.ts`); kota bitince ne olduğu görülmedi | Ben + ürün sahibi (panel) | 1 saat |
| 0.4 | **Sentry canlıda çalışıyor mu**: DSN dolu mu, bir deneme hatası e-postaya düşüyor mu | **Yarısı bitti (18 Ekim):** `/admin/sistem` DSN'i "Tanımlı" gösteriyor. Panelde hatanın görünüp e-postaya düştüğü senin Sentry girişinle bakılacak | Ürün sahibi (Sentry paneli) | 15 dk |
| 0.5 | **PayTR canlı mod provası**: 1 TL'lik gerçek ödeme, geri bildirim, iade; sonra test modunu kapat | Bugün 2 ödeme test; canlı tahsilat hiç olmadı | Ürün sahibi (kart) + ben | 1 saat |
| 0.6 | E-posta: Google Workspace SMTP günlük sınırı (~2.000) ve SPF/DKIM/DMARC kaydı doğrula | **Bitti (18 Ekim):** SPF `include:_spf.google.com ~all`, DKIM `google` seçicisi, DMARC `p=none` + rapor adresi, MX Google. İleride DMARC `p=quarantine`'e alınabilir | — | — |
| 0.7 | Hukuki sayfalar canlıda açılıyor mu (10 sayfa): KVKK, mesafeli satış, ön bilgilendirme, iptal-iade, teslimat, künye | **Bitti (18 Ekim):** 10 sayfanın hepsi 200 | — | — |

Faz 0 maliyeti: ~45 $/ay sabit + ilk ay OpenAI kullanımı.

## Faz 1 — Öğrenme kalitesi, uçtan uca (1-2 hafta)

Ölçüt: **aynı belgeyle hazırlanan öğrencinin deneme sınavı puanı.** Öğretmen gözü, sınavda sorulur
maddeleri ve vurgu artık var; şimdi bütün yolun bunu taşıdığını göstermek gerekiyor.

| # | İş | Nasıl ölçülür |
|---|---|---|
| 1.1 | Pediatri belgesinde **10 konunun hepsini** sırayla çalış (ders → test → podcast → doğru/yanlış → sözlü), sonunda yazılı deneme | Her konuda "Sınavda sorulur" maddelerinin derste ve testte geçme oranı; deneme puanı. #303 yayında olmalı (analiz 5 sayfa). **Yapıldı (18 Ekim, hazırlık 175b0fec):** 10 ders akışlı üretildi (ilk ekran 15-19 sn, düzeltme turları 20-142 sn); 1 kavram (Koarktasyon) yeniden yazımda da geçmedi, atıldı ve bitişte "Bu bölüm hazırlanamadı" olarak söylendi; derslerde turuncu vurgu 0-4, sınav ipucu / akılda tut / alarm kutuları ve tablolar var; podcast ~30 sn; yazılı deneme 20 soru (15 çoktan seçmeli + 1 çok cevaplı + 4 açık uçlu) → **91/100** (18 doğru, 2 kısmen). Konu testleri rastgele cevaplandığı için test tarafında geçme oranı ölçülmedi |
| 1.1b | **İkinci belge: trigonometri (20 sayfa), Astra ile yan yana** | **Bulgu (18 Ekim gecesi):** aynı PDF Astra'da 7 konu, bizde **1 konu** (belge `f1142690`, yalnız s.2). Vercel `pipeline_timing`: `outline_stage first · gpt-4o-mini · 3,1 sn · topics 1 · dropped 0`. Neden: ≤30 sayfa mini'ye yönleniyor (`OUTLINE_MINI_PAGE_LIMIT`), mini tek konu öneriyor, `goodEnough` 1/1'i geçiriyor, "harita fazla ince" kapısı yok. **Düzeltme yazıldı:** sayfa sayısına göre konu tabanı (`minTopicsForPages`: ≤3 sayfa 1, ≤8 sayfa 2, sonra sayfa/5, en çok 8); mini'nin tabanın altındaki haritası kabul edilmez, güçlü modele yükselir (`escalate`); güçlü modelin ince haritası kabul edilir (tek konulu dosya olabilir). Bekçi: `outline-thin-map.test.ts`. **Doğrulandı (18 Ekim gecesi, #318 yayında):** aynı PDF yeniden yüklendi (belge `a5db5884`) → **10 konu** (1 birim), başlıklar belgenin sayfa başlıklarıyla örtüşüyor; Astra 7. **Yan yana ilk ders (hazırlık 4fb52e2f):** bizde "Açı, Derece ve Radyan" 3 kavram / 6 ekran, hazır dersle ≤10 sn, önce-dene D/Y + 2 hızlı sınav + formül kartı θ=s/r + sık hata + özet, 2 turuncu vurgu/ekran, 3/3 doğru; Astra'da "Trigonometriye Giriş" 3 kavram / 8 ekran (~45 sn), 7 soru, formül kartları, özet yok, ezber yok, test 5 soru. **Bizde bulunan tahta hatası:** `==…==` içindeki ";" ve ":" formül sanılıp cümle bölünüyor, ekranda ham "==" ve "ölçüyü π/180 ile şöyle hesaplanır:" kalıyordu → düzeltildi (`lesson-board.ts` işaretleri yer tutucuyla korur; `lesson-board-marks.test.ts`). **Podcast bu konuda 2/2 düştü** (önceden yazım + elle, ~80 sn sonra "sunucuda tamamlanamadı"), iki sistematik neden: (1) hesap denetçisi "225 × π/180 = 5π/4"te sayı ortasından eşleşip "80 ve 5 tutmuyor" diyordu (`tutor-quant.ts` tek-eşitlik deseni: rakam ortasından başlamaz, π'ye yapışık sayı katsayı; `tutor-quant-symbolic.test.ts`); (2) yazar "bu konu sınavda ağırlıklı" demeye zorlanıyor, denetçi A maddesiyle "kaynakta yok" diye düşürüyordu → denetçiye konu listesinden gelen bu cümlenin kaynak iddiası olmadığı söylendi. Ayrıca soğuk ders 158 sn / 8 çağrı / 2 tur (ilk ekran ≤10 sn). **Düzeltme yayında doğrulandı (19 Ekim 00:10):** aynı podcast ~40 sn'de metin + ilk ses, 5 bölüm (Açı ve yön · Koterminal · Derece-radyan · Yay uzunluğu · Sınav öncesi tekrar), 5:26; Astra 43 sn. **Yan yana puan (aynı PDF, ilk konu, 100 üzerinden; kapsam 25 / doğruluk 20 / önemli nokta 15 / soru 15 / akılda kalıcılık 15 / hız 10):** Cortex 18+18+13+11+11+9 = **80**, Astra 20+18+11+14+11+7 = **81** — ders başına denk; harita düzeyinde biz öndeyiz (10 konu / 7, Astra iki sayfayı tek konuda birleştiriyor), soru sayısında Astra önde (ders içi 7 + test 5'e karşı bizde 3 + konu testi). Bu belgede bulunan üç kod kusuru (ince harita, `==` bölünmesi, hesap denetçisi π) Pediatri'de hiç yoktu: her yeni ders alanı yeni kusur sınıfı çıkarıyor |
| 1.1c | **Üçüncü belge: KPSS Anayasa kamp notu (30 sayfa), Astra ile yan yana** | **Bulgu (19 Ekim 00:30):** aynı PDF Astra'da 6 konu (hazırlık 10109966), bizde **2 konu** (belge `c6c1e886`). Kullanım kaydından sıra: mini 6 önerdi / 2 tutuldu; luna 34 önerdi (6.810 jeton), onarım turu 7.212 jeton — ikisi de **tamamen atıldı**, mini'nin 2 konusu kaldı. Kök neden kod değil metin: PDF'in metin katmanı Calibri glif numaralarıyla çıkmış (her sayfanın harflerinin %75–85'i `ŶĂǇĂƐĂ…`), model yine anlıyor ve düzgün başlık yazıyor ama temellendirme 34 başlığın 34'ünü `absent_word` ile düşürüyordu; `outline_stage` kaydında yalnız `continue` vardı. **Düzeltme:** `glyph-id-text.ts` çözücü (çıkarma + okuma + sayfa temizliği yolları; tablo ham metin ↔ modelin temizlediği metin hizalanarak çıkarıldı), `outline_stage` kaydına taslak modeli / önerilen / tutulan / düşme sebebi sayıları, çerçeve sözcükleri ("unsurları", "yapısı", "süreci", "sınıflandırılması", "belgeler") temellendirmede kanıt sayılmaz, tampon harfli gövde dizini ("sayısı" ~ "sayıları"). Yerel ölçüm: çözülmüş metinle 29/34 başlık tutuluyor (modelin temizlediği metinle 24, hamla 0); sahte başlık eşikleri aynı (9/10, 15/18). Bekçi `glyph-id-text.test.ts`. **Yayın sonrası:** aynı PDF yeniden yüklenecek, ≥6 konu beklenir; ilk ders Astra'nın aynı konusuyla puanlanacak |
| 1.2 | **"Sıfır bilgi" senaryosu**: aşinalık "yeni", seviye tespiti, ilk üç ders | Ders terimleri tanımlıyor mu, hız uygun mu; test puanı. **Kısmen (18 Ekim):** aynı hazırlıkta düzey kartından "Daha kolay" seçildi, bütün konular "duymuştum" düzeyine indi ve sıradaki içerik "Kolay" yazıldı; "yeni" aşinalıkla sıfırdan kurulum ayrıca yapılmadı |
| 1.3 | **Çoklu belge**: 2-3 PDF + bir slayt yükle (ör. Kimya setindeki eski dosyalar) | Konu listesi birleşik ve tekrarsız mı; sıra önkoşula uyuyor mu; her ders doğru belgenin sayfasından mı. **Yapıldı (18 Ekim akşamı, hazırlık a2eb24f0):** depodaki iki örnek dosya (fotosentez PDF + entropi slaytı) tek kurulumda; konu listesi iki birim / iki konu, tekrarsız; `source_refs` her konuyu kendi dosyasına bağlıyor (Fotosentez → PDF, Entropi → pptx); ilk ders 30 sn'de açıldı, 4 kavramın hepsi PDF'ten, "2 kaynak" etiketi var. **Bulunan hata:** ortak harita birkaç turda bitiyor; sihirbaz ilk iki "Devam et"te 409 alıp öğrenciyi **açıklamasız** materyal ekranına düşürdü (uyarı yalnız konular adımında çiziliyordu), üçüncüde geçti → düzeltildi: harita hazırlanıyor dedikçe aynı ekranda en çok 6 kez yeniden sorulur, uyarı materyal ekranında da görünür (`exam-wizard-course-map-retry.test.ts`) |
| 1.4 | Ezber kodu ve sınav kutularını **listeli konuda** gör (Kardiyoloji: Fallot; Aciller: ABCDE) | Kod kaynaktaki öğelerle birebir mi; denetçi I maddesi çalışıyor mu. **Bulgu (18 Ekim, Pediatri 175b0fec, SQL ile sayıldı):** 10 dersin **hiçbirinde** ezber kodu yok (`tone: mnemonic` 0/10); sınav kutusu 3/10, turuncu vurgu 7/10. Kural "liste ya da sınıflama varsa… gerek yoksa hiç yazma" diyordu, yazar hep "gerek yok" dedi. **Sertleştirildi (18 Ekim gecesi, ürün sahibinin kararı):** kaynakta ≥3 öğeli açık liste/sınıflama varsa o kavramda ezber kodu **zorunlu**; kod listenin kendisi değil, her öğeden harf/hece alan söylenebilir sözcük ya da cümle; denetçi I maddesi eksik kodu ve "liste kılıklı kodu" yüksek sayar. Yerel altın deneme (`speed-golden`, hızlı motor): KPSS 40 sn, 1 tur, hakem 0 sorun, 2 gerçek kod ("İpek Ceza Taktı, Cebir Hükmetti" → İptal-Ceza-Tazminat-Cebri icra-Hükümsüzlük); Pediatri 43 sn, 3 kod, hakem 0 sorun |
| 1.5 | Seviye önerisi canlıda: iki düşük test → kart → "Daha kolay" → sonraki ders gerçekten kolay mı | `exam_prep_topics.familiarity` değişimi + sonraki dersin zorluğu. **Doğrulandı (18 Ekim):** iki düşük test (0/5, 1/5) → kart çıktı → "Daha kolay" → bütün konular `heard`, bekleyen içerik atıldı, sıradaki ders "Kolay" |
| 1.6 | Astra ile **ikinci konu** yan yana (Yenidoğan): aynı 100 puanlık ölçüt | Tek konuyla verilen 84 tahmini doğrulanır ya da düzeltilir. Yapılmadı — Astra girişi ürün sahibinde |
| 1.7 | Ders üretim kayıtlarını haftalık oku (`/admin/ders-hatalari`): yavaş, atılan kavram, başarısız | Hedef: atılan kavram 0, başarısız < %2. Günlük özet e-postası (4.8) başarısız / yavaş / takılı sayısını her sabah getiriyor; haftalık okuma `/admin/ders-hatalari` |

Bütçe: belge başına birkaç dolar model maliyeti; her canlı deneme önceden onayla.

## Faz 2 — Telefon ve süreklilik (1 hafta)

| # | İş | Not |
|---|---|---|
| 2.1 | **Gerçek telefonda** (iPhone Safari + Android Chrome) tam akış: kayıt, belge yükleme (kamera dahil), sihirbaz, hazırlık sayfası, ders, test, video, podcast, deneme, ödeme | Emülasyonda 18 Ekim'de ~116 sayfa gezildi (#305); gerçek cihaz turu ürün sahibinin telefonuyla |
| 2.2 | Otomatik teste **390 px genişlikte giriş yapılmış akış** ekle (`learning-loop-smoke` kopyası) | **Yazıldı (#306):** `authenticated.spec.ts` altı sayfada sayfa + üst çubuk genişliğini ölçer. Çalışması için `E2E_USER_EMAIL/PASSWORD` sırrı (ayrı test hesabı) gerekir; bugün CI'da atlanıyor. **CI tarafı hazır (18 Ekim akşamı):** e2e işi üç sırrı ortam olarak alıyor (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`); servis anahtarı CI'ya verilmiyor, onu isteyen Belgelerim sayfası CI'da atlanır; test artık durum kodu ve üst çubuğu da arar (500 sessiz geçmesin). **Sırları yazmak ürün sahibinde:** test hesabı olarak mevcut "Free Test" (`cortex.free.test+…@gmail.com`) kullanılacak; şifresini `/admin` yerine Supabase → Authentication → Users → o kullanıcı → "Reset password" ile belirle, üç sırrı GitHub → Settings → Secrets and variables → Actions'a gir (yayınlanabilir anahtar `.env.local`'de). Yardımcı: asistanın sır yazma izni yok (otomatik sınıflandırıcı reddetti) |
| 2.3 | Sihirbaz taslağını sunucuya taşı (`exam_wizard_drafts`), cihaz değişince kurulum kaybolmasın | **Yazıldı (18 Ekim):** kullanıcı başına tek satır, `/api/learning/exam-prep/draft`; tarayıcı kopyası kalır, açılışta yeni olan kazanır; göç SQL ekranında uygulanacak |
| 2.4 | `/mobil-uygulama` sayfasının vaadini kontrol et: uygulama var mı, PWA mı, "yakında" mı | **Bitti (18 Ekim):** sayfa dürüst — "mağaza uygulaması yok, web tam çalışır, ana ekrana ekle"; `app/manifest.ts` var |
| 2.5 | Bildirimler: çalışma hatırlatması e-postası (`study-reminders` cron) telefonda okunabilir mi | — |

## Faz 3 — Yük ve dayanıklılık (1 hafta, Faz 0'dan sonra)

| # | İş | Hedef |
|---|---|---|
| 3.1 | Yük testi (k6): 50 → 200 → 1000 eşzamanlı; senaryo "hazırlık sayfası + hazır ders açma" ve "soğuk ders üretimi" | p95 sayfa < 2 sn; üretim kuyruğa girsin, düşmesin |
| 3.2 | **Üretim kuyruğu / geri basınç**: aynı anda en çok N ders üretimi, fazlası "sıradasın" ekranı | OpenAI dakikalık sınırı aşılmasın; kredi iadesi düzgün |
| 3.3 | Supabase: bağlantı havuzu (PostgREST), yavaş sorgu günlüğü, indeks kontrolü | p95 sorgu < 100 ms |
| 3.4 | Vercel: fonksiyon süresi (ders 300 sn), eşzamanlılık, bölge `fra1` | Zaman aşımı < %0,5 |
| 3.5 | Maliyet modeli: 1000 aktif öğrenci/ay için OpenAI + Vercel + Supabase + TTS + resim | Plus 7.200 kredi = 7,2 $ tavan; gerçek ortalama ölçülsün |
| 3.6 | Felaket provası: Supabase yedekten geri dönüş, Vercel geri alma | Yazılı adımlar |

## Faz 4 — Yönetim ve işletme (1-2 hafta)

| # | Eksik | Çözüm |
|---|---|---|
| 4.1 | Hesabı askıya alma / açma | **Yazıldı (18 Ekim):** `/admin/kullanicilar` satırında "Askıya al / Askıyı kaldır"; `profiles.suspended_at` silinmiş-hesap bariyeriyle aynı kapıdan geçer (açık oturum düşer, giriş kapanır, veri durur), giriş ekranı "hesabın askıya alındı" der; göç SQL ekranında uygulanacak |
| 4.2 | Kullanıcının hazırlığını destek için görme (salt okunur) | "Kullanıcı olarak gör" yerine salt okunur hazırlık görünümü; denetim günlüğüne yazılır |
| 4.3 | Takılı dersi / oturumu sıfırlama, krediyi iade etme | **Yazıldı (18 Ekim, #312):** `/admin/ders-hatalari` → "Takılı üretimler" → Kapat ve iade et (iş + oturum failed, yarım önceden-yazım silinir, pending rezervasyon iade) |
| 4.4 | Belge analizini ve konu haritasını yeniden çalıştırma | **Yazıldı (18 Ekim, #311):** `/dokumanlar/[id]` yöneticiye "Öğretmen analizini yeniden çalıştır" — Pediatri'de 2 konu/12 madde → 10 konu/57 madde |
| 4.5 | Abonelik süresini elle uzatma / tek seferlik kredi hediyesi | Kredi ekleme var; süre uzatma yok |
| 4.6 | Kullanıcı arama (e-posta/ad), filtre, sayfalama | **Arama bitti (18 Ekim, #308):** ad ya da e-posta. Filtre ve sayfalama yok; 14 hesapta 50'lik sayfa yetiyor, 1.000'i geçince gerekir |
| 4.7 | **Runbook'lar** (`docs/ops/`): takılı ders, yanlış kredi, PayTR geri bildirim gelmedi, OpenAI kota, Supabase duraklama, yayın geri alma | **Yazıldı (18 Ekim):** `docs/ops/README.md` + altı dosya, belirti → bakılacak yer → işlem → önleme; koddan ve panelden, tahmin yok |
| 4.8 | Uyarılar: Sentry → e-posta; günlük özet (üretim hatası, ödeme, yeni kayıt) | **Günlük özet yazıldı (18 Ekim):** her sabah 09:00 TRT `cortexplus@cortexplus.app`'a, günlük cron'un sonunda (üçüncü cron yok); yeni kayıt, ödeme, başarısız/yavaş üretim, takılı üretim; sorun varsa konu "Dikkat"; aynı gün iki kez gitmez; `/admin/sistem` → "Özeti şimdi gönder". **Sentry → e-posta ürün sahibinde:** sentry.io'da Alerts → Create Alert → Issues → "a new issue is created" → "Send a notification to … (e-mail)"; panel girişi gerekiyor. 18 Ekim akşamı Google ile giriş denendi (hesap seçicide `cortexplus@cortexplus.app` görünüyor), seçim adımı asistanın izin sınırında kaldı; `.env.local`'deki `SENTRY_AUTH_TOKEN` boş olduğu için API yolu da yok. Sentry yeni projeye varsayılan "Send a notification for new issues" kuralını kendisi açar — panelde Alerts sayfasında bir kez doğrulanmalı |
| 4.9 | Destek kanalı: `/destek` sayfası + `cortexplus@cortexplus.app`; hedef cevap süresi yazılı | Sayfa var; süre ve sorumlu yok |
| 4.10 | KVKK: aydınlatma metni, veri silme talebi (kuyruk var) uçtan uca prova | **Prova yapıldı (19 Ekim 00:23, Free Test hesabı, ürün sahibinin onayıyla):** `data_deletion_requests` satırı açıldı → `/api/cron/data-deletion` işçisi tetiklendi (processed 1, ~3 sn) → profil "Silinmiş hesap" + `deleted_at`, telefon/okul boş; hazırlık, bildirim ve diğer içerik tabloları 0; kimlik satırı yumuşak silindi (e-posta karma değere çevrildi, meta boş, giriş kapalı); cüzdan/ödeme kayıtları bilerek kaldı (mali iz). Öğrenci tarafındaki düğme aynı `purgeUserData`'yı anında çağırır (`requestDataDeletion`), kuyruk yedek. Not: bu hesap silindiği için E2E test hesabı yeniden açılacak |

## Faz 5 — Lansman (Faz 0-4 bittikten sonra)

1. Fiyat ve paketlerin son hâli (`/admin/paketler`), ücretsiz katman kapıları gözden geçirilir (günde 6 kredi, 1 hazırlık, 5 sayfa).
2. **Kapalı beta**: 20 gerçek öğrenci, 2 hafta, haftalık görüşme; `/admin/yanit-oylari` ve ders sonu anketi okunur.
3. Çıkış ölçütleri: atılan kavram 0, ders ilk ekran p95 < 20 sn (hazır değilken), hazır ders < 3 sn, ödeme başarı > %95, destek cevabı < 24 saat, Sentry'de çözülmemiş kritik hata 0.
4. Otomatik yenileme: PayTR Direkt API onayı gelene kadar sözleşme "otomatik yenilenmez" kalır (bkz. `PAYTR-ABONELIK.md`); onay gelirse ayrı iş.
5. Kampanya bandı hazır (`/admin/promosyonlar`), lansman günü açılır.

## Bugün karar bekleyenler

1. Vercel Pro ve Supabase Pro'ya geçiş (toplam ~45 $/ay) — kart ürün sahibinde.
2. Faz 1 canlı denemeleri için model bütçesi (önerim: 10 $).
3. Yük testi için hedef sayı: 200 mü, 1000 mi? (1000 için önce kuyruk gerekir.)
4. Kapalı beta öğrencileri nereden gelecek (okul, tanıdık, reklam)?

## Yöntem notu

Bu belge yalnız okunan veri ve kodla yazıldı; "ölçülmedi" denen her yer gerçekten ölçülmedi. Bir
maddeyi "hazır" diye kapatmak için canlıda görmek şart (17 Eylül: yazılmış ama yayında olmayan dört
sayfa; 23 Eylül: yeşil CI ama yayın yok). Faz sırası önemlidir: Faz 0 olmadan Faz 3'ün (yük) anlamı yok.

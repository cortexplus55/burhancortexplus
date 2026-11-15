# Düello 9B · Üretim istemi önerisi ve maliyet tahmini

15 Kasım 2026. **Öneri; kod ve göç yok, Burhan onayı bekliyor** (ANA-PROMPT B: "yeni model istemi icat etme, ek önerisi
yaz, uygulamadan önce onayım şart"). 9B'nin üretim kısmı, 9C ve Faz 10 bu kararı bekliyor (`09-duello-tasarim.md` B).

## 1. Bugün nasıl üretiliyor

- Uç: `POST /api/learning/exam-prep/duel`. Tek istekte öğretmen test motoru (`generateExamQuiz` → `teacherQuizLoop`).
- `count` 9 (7 + 2 yedek), en çok 12 aday, `difficulty: "hard"`, şık sayısı öğrenciden (`studentOptionCount`).
- Kaynak: belge varsa alıntı, yoksa konu çiti.
- Ücret `QUIZ_GENERATE` (10 kredi), ücretsizde ders sayacından (Plus kapısı).
- Tür karışımı, kademeli zorluk ve şablon imzası yok. Rövanş aynı seti kullanıyor (yeni üretim yok).
- `DUEL_ACCESS.dailyLimit = null`: günlük düello sınırı yok, yalnız dakikada 6 kurma.

## 2. Önerilen üretim (mevcut hattı yeniden kullanır)

Yeni motor yok. Öğretmen test motoruna **tek bir kural bloğu** eklenir. Kural yazara ve denetçiye **aynı metinle**
gider (depo kuralı: iki tarafa farklı kural verilmez). Soru başına iki etiket eklenir: `type` ve `level`. Kod etiketleri
sayar, dağılımı tutar, imzayı çıkarır.

### 2.1 İstem eki (taslak metin)

```
DÜELLO SETİ (kesin):
- {N} soru yaz. Tür dağılımı: {dağılım} (ör. Klasik 4, Doğru/Yanlış 2, Boşluk doldur 2, Tuzaklı 2).
  Her soruya "type" yaz: classic | true_false | fill_blank | diagram | calc | trap.
- Klasik ve Tuzaklı tam {şık sayısı} şıklı ({A–E | A–D}); Doğru/Yanlış iki şık ("Doğru", "Yanlış");
  Boşluk doldur kökte tek "____" ve {şık sayısı} şık.
- "diagram" yalnız KAYNAKTA şekil satırı varsa (Şekilde işaretli değerler); yoksa bu türü yazma.
- "calc" yalnız kaynakta sayı ya da formül varsa; sonucu kendin hesapla ve doğrula.
- "trap": SINAVDA SORULUR maddelerinden ya da kaynağın uyarı / sık hata cümlelerinden bir yanılgıyı yokla;
  çeldirici o yanılgının kendisi olsun.
- Zorluk: her soruya "level" yaz (1 kolay, 2 orta, 3 zor). Kademeli: {kolay}/{orta}/{zor} adet.
- Her soru tek, kesin, tartışmasız doğrulu; 20 saniyede okunur; uzun hesap yok.
- Aynı bilgiyi iki kez sorma; aynı doğru cevap en çok iki soruda.
- SOURCE_NUMBER_PRIORITY aynen: kaynağın verdiği sayı ve sabit, ders kitabınınkinden önce gelir.
```

### 2.2 Kod tarafı (onaydan sonra; saf ve birim testli, `lib/duel/`)

- **Şablon imzası.** Kök Türkçe küçük harfe çevrilir. Sayılar `#`, birimler kanonik ada indirilir; noktalama ve genel
  sözcükler atılır. Kalan kökler (ilk 5 harf) sıralanır ve özeti alınır.
  - Aynı sette iki soru aynı imzayı taşıyamaz.
  - Öğrencinin son 5 düellosundaki imzalar da reddedilir (`prep_duels` sorularından okunur, göç gerekmez).
  - Çakışan soru yedekle değişir. Yedek bitince tek bir ek üretim turu yapılır. O da yetmezse öğrenciye "daha az
    soruyla başla" seçeneği sunulur (sessiz kesme yok).
- **Var olan bekçiler aynen çalışır:**
  - `questionConflict`: neredeyse aynı kök, aynı doğru cevap.
  - `MAX_SAME_ANSWER`, `thresholdTwinOptions`, `offKindDistractors`.
  - Hafif doğrulayıcı (`quiz-sanity`), şık dengeleme (`option-balance`).
  - Sayısal adım sağlaması (`step-arithmetic`).
- **Dağılım ve zorluk** etiketlerden sayılır. Eksik tür yedekten tamamlanır; olmazsa en yakın türle doldurulur ve
  kayda yazılır.
- **Gerçek ilerleme.** Motor yayımladıkça akan sırayla gösterilir (akan testle aynı `alignToPublished`). Soru soru
  bağımsız iş açılmaz (maliyet, aşağıda).

## 3. Model çağrısı ve maliyet (tahmin; yayından önce `ai_usage_events`'ten ölçülecek)

Dayanak: kredi v3'te 1 kredi ≈ $0,001 gerçek maliyet. Konu testi (≈5 soru) 10 kredi ≈ $0,010
(`price-table.ts`, `KREDI-SISTEMI.md`).

| Senaryo (10 soru) | Model çağrısı | Tahmini süre | Tahmini maliyet |
|---|---|---|---|
| **Önerilen: tek parti** (yazar 14 aday → hafif doğrulayıcı → denetçi → gerekirse düzeltme / ikinci geçiş) | 3–6 | 25–45 sn (ilk sorular akarak ~10 sn) | **$0,02–0,035** |
| Bugünkü düello (9 soru, tek tür, `hard`) | 3–5 | 30–60 sn | ~$0,015–0,025 |
| Soru başına bağımsız iş (10 yazar + 10 denetçi) | ~20 | paralel ~15 sn | $0,04–0,07 (istem öneki 10 kez) |

- **Önerilen ücret:** yeni eylem kodu `DUEL_GENERATE`, **20 kredi** (10 soru ≈ iki konu testi). Göçle eklenir ve
  `price-table.ts` ile birlikte değişir.
- **Rövanş ve meydan okuma yeni üretim yapmaz:** aynı set, 0 model çağrısı.
- **Bot ve arkadaş oyunu ücretsiz kalır:** model çağrısı yok.

## 4. Günlük sınır önerisi (`DUEL_ACCESS`)

| Plan | Yeni düello kurma | Oynama / bot / rövanş |
|---|---|---|
| Ücretsiz | Bugünkü gibi: hediye bakiyesi yetiyorsa, günde en çok **1** | sınırsız |
| Plus / Sınav Haftası | günde **10** (kota da düşer) | sınırsız |
| Sigma | günde **30** | sınırsız |
| Kurucu | açık | açık |

Ek önlemler:
- **Öğrenci başına aynı anda tek düello üretimi.** Var olan `inflight-share` ile; ikinci istek bekler ve sonucu okur.
- **Küresel üretim yuvası.** Var olan `generation-slots` ile.
- Dakikada 6 kurma sınırı aynen kalır.

## 5. Sızıntı riskleri ve önlemi

| Risk | Bugün | Önlem (9B) |
|---|---|---|
| Doğru cevap tarayıcıya erken gider | Misafirde anahtar yok (#Güvenlik paketi 1); oturumlu oyuncuda set bitişte notlanır | Soru soru uç: yanıtta doğru alan YOK; cevap gönderilince doğrusu döner. Testte gövde taranır |
| Botun zaman çizgisi (soru başına süre + doğru/yanlış) oyunun başında tek yanıtta gelir | Şık gitmiyor ama "bot bildi" bilgisi önceden var | Botun o soruya cevabı öğrenci cevapladıktan sonra, sunucu saatiyle döner |
| Paylaşılan düelloda sahibin **kendi notundan** sorular arkadaşa gider | Soru metni notun içeriğini taşır | Paylaşım öncesi tek satır uyarı ("Sorular notundan; bağlantıyı alan görür"); belge alıntısı (kök içinde uzun birebir pasaj) paylaşılan sette kısaltılır |
| Notun içindeki talimat metni (istem enjeksiyonu) | Kaynak "betimleme" çerçevesiyle gidiyor | Değişmez; denetçi aynı çerçeveyle |
| Sunucu saati yerine istemci saati | Bugün süre istemcide | `question_started_at` sunucuda (eklemeli sütun, göç) |

## 6. Tekrar önleme riskleri

- **Fazla katı imza** (sayısı değişmiş ama gerçekten farklı hesap sorusu) reddedilir. Hesaplamalı türde imzaya
  istenen büyüklük de girer (`asked-quantity.ts`); yalnız sayısı değişen aynı kalıp reddedilir, istenen büyüklüğü
  değişen kabul edilir.
- **Küçük konuda** son 5 düello imzaları seti tüketebilir. O zaman pencere 3'e iner ve öğrenciye "bu konudan soru
  havuzu daralıyor" denir; hazır müfredat havuzundan (`item_bank`) tamamlama önerilir.
- **Gerçek tekrar ihtiyacı:** öğrencinin yanlış yaptığı soru tekrar gelebilir. Önerim: yanlışlar düelloya değil
  günü gelen tekrara gider (bugünkü gibi); düello yalnız yeni soru.

## 7. Karar bekleyenler (Burhan)

1. İstem eki (2.1) ve tür listesi. Şema yorumu ve hesaplamalı türler kaynağa bağlı olarak açılır.
2. ~~Ücret~~: **onaylandı (15 Kasım 2026): `DUEL_GENERATE` 20 kredi.**
3. ~~Günlük sınırlar (4)~~: **onaylandı (15 Kasım 2026), tablo 4'teki gibi.**
4. Paylaşılan düelloda not alıntısı uyarısı ve kısaltma (5).
5. Göç: `prep_duels` için eklemeli sütunlar (`seed`, `config`, `status`, `parent_duel_id`, `question_started_at`). SQL
   ekranında Burhan uygular.

Onaydan sonra sıra: saf `lib/duel/` (imza, dağılım, zorluk, puan) birim testleri → istem eki (yazar + denetçi) →
soru soru uç (depo arayüzü arkasında, bellek içi testler) → göç → 9C bağlama ve gerçek veritabanı e2e.

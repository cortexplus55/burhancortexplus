# 13.0 Denetim · Öğretmen hissi

15 Kasım 2026. Kod değişmedi. Kanıt kod okuma ve bugünkü kodun gerçek fonksiyonlarıyla, model çağrısı olmadan kurulan istem
satırlarından geliyor. Ekran görüntülü canlı yeniden üretim girişi bekliyor (`baseline/README.md`).

Kısaltmalar: **İ** = istem (model talimatı), **K** = kod, **V** = veri.

## Özet

| Gözlem | Neden | En güçlü kanıt | Nerede çözülür |
|---|---|---|---|
| G1 · 155 kelime, 5 blok, "hazırlık parçaları" cümlesi | İ + K | Her kavram cevabına "en az 1 kutu" ve sonda "Akılda kalsın" zorunlu; eşleştirici yanlış hazırlığı bağlıyor | 13A (+ H3) |
| G2 · aynı soru ve aynı kart tekrar | İ + K | Sorulan soruların kaydı yok; "Akılda kalsın" her kavram cevabında zorunlu | 13B |
| G3 · Sokratik'te kart cevabı söylüyor; yanlışta cevap hemen | İ | Sokratik kuralı kavram sorusunu muaf tutuyor; kart kuralı her cevabın sonunda; yanlış cevapta teşhis sorusu kuralı yok | 13A + 13B |
| G4 · Adım Adım'da tüm adımlar; "TYT Kimya" sızıntısı | İ + K | Adım kuralı kavram sorusunu açıkça muaf tutuyor; eşleştirici "karıştırıyorum" → "Karışımlar" | 13B (+ H3) |
| G5 · açılışta öğretmen konuşmuyor | K | Ana ekranda yalnız selam, dost satırı ve şerit; öğretmen mesajı yok | 13C |
| G6 · "Moral bozmak yok … en çok düşülen tuzaklardan" | K | Sabit metin, kaynağı yok | 13D |
| G7 · "Devam et" ilk tıklamada 404 | K | Sayfa yanıttan sonra planı yeniden kuruyor, başlanmamış adımlar yeni kimlikle yazılıyor | H1 |
| G8 · C şıkkı E'nin bozuk kopyası | V + K | Üretilen soru; doğrulayıcı yalnız birebir aynı şıkkı yakalıyor | H2 (D2) |

**Ek bulgu — H3 (canlı regresyon, benim #662'm):** ana sohbetin materyal eşleştiricisi tek bir ayırt edici sözcük kökünü yeterli
sayıyor. "karıştırıyorum" sözcüğü "Karışımlar" konusuna eşleşiyor. Sonuçta hiç ilgisi olmayan bir matematik sorusunda modele
"«TYT Kimya hazırlık · Karışımlar» … notunda eşleşen parça bulunamadı … bunu tek cümleyle söyle" satırı gidiyor
(`baseline/g1-g4-istem-satirlari.txt`). G1'in "hazırlık parçalarında … bulunamadı" cümlesi ve G4'ün "Genel" bağlamdaki
"TYT Kimya" sızıntısı buradan çıkıyor. Bu, teacher.v2 bayrağı olmadan bugün herkeste oluyor. **Öneri:** bayraksız ayrı PR.
Eşleşme için en az iki ortak kök ya da hazırlık/konu adının tamamı aranır; "bulunamadı" satırı yalnız öğrenci notunu
açıkça andıysa gider. Onayını D1'de soruyorum.

## Gözlem gözlem

### G1 · Doğrudan Çöz, "2^-3 neden 1/8?"
- **İ** — `teacher-tutor.ts` `CHAT_TEACHING_MARKUP`:
  - "Bir kavramı ya da yöntemi anlattığın cevapta EN AZ 1, en çok 2 kutu kullan".
  - "Bir kavramı ya da yöntemi öğrettiğin cevabın EN SONUNA … ✅ Akılda kalsın" kutusu zorunlu.

  Kelime tavanı ve "en fazla bir soru" kuralı yok.
- **İ** — `chat-material-link.ts` `ANALOGY_TURN_LINE`: mesajda "neden" geçince "Formülden önce 💡 Benzetme kutusu (kesin)".
  Bu kutu ikiye ek geliyor; sonuç beş blok.
- **İ + K** — "hazırlık parçaları" cümlesi H3'ten. Doğrudan Çöz tarzı (`teacherStyleLine`) "tam çözümü ver … sonra anladığını
  tek soruyla yokla" diyor: "2⁻² kaçtır?" buradan.
- Çipler: `FOLLOW_UPS`, sabit üçlü (K).

### G2 · Takip: "2^-3 = -8, değil mi?"
- **İ** — `tutor-answer.ts` `answerFirstLine`: mesajda "=" ve rakam olduğu için `hasOwnSolution` true. Kural: "ilk cümlede doğru mu
  yanlış mı olduğunu söyle … doğrusunu ver" → "Hayır."
- **K** — sorulan kontrol sorularını tutan bir seans durumu yok. Geçmiş (24.000 karakter) modele gidiyor ama "aynı soruyu tekrar
  sorma" kuralı yok. "Akılda kalsın" her kavram cevabında zorunlu (İ), aynı kart ikinci kez geliyor.

### G3 · Sokratik
- **İ** — `teacherStyleLine("hints_first")`: "Kavram sorusunda ('nedir', 'hangisidir') bu kural geçmez: tanımı ilk cümlede ver."
  Soru "neden" sorusu olduğu için model cevabı saklasa da `CHAT_TEACHING_MARKUP` mesajın sonuna "Akılda kalsın" koyduruyor.
  İki kural çelişiyor; kart sonucu söylüyor.
- **İ** — "1/6 sanırım": öğrencinin yanlış cevabında önce teşhisi soru olarak sor diyen bir kural yok. `hasOwnSolution`
  "sanırım"ı çözüm saymıyor; model doğrudan düzeltiyor ("1/8 olmalı").

### G4 · Adım Adım
- **İ** — `teacherStyleLine("step_by_step")`: "Selamlaşmada, kavram sorusunda ('nedir', 'fark ne') … bu kural geçmez".
  Kavram sorusunda adım modu bilerek kapalı (10 Kasım kararı).
- **K** — `tutor-turn.ts`: `pacedStep` yalnız "çözülecek problem" tanınınca kuruluyor; "Devam et" çipi o yüzden çıkmıyor.
- **K** — sızıntı H3 (yukarıda). Seçili bağlam "Genel" olsa da eşleştirici adı kendisi buluyor.

### G5 · /ogretmen açılışı
- **K** — `ogretmen/page.tsx`: selam, kural tabanlı tek dost satırı (`companion/voice.ts` `homeLine`), "Kaldığın yerden devam"
  kartı ve sınav şeridi var. Öğretmenin söylediği bir mesaj yok. Gecikmiş konu verisi şeritte mevcut (V), öğretmen diline
  çevrilmiyor.
- 13C için hazır parça: `voice.ts` zaten modelsiz, güne bağlı, kararlı cümle kuruyor. Açılış mesajı buradan büyütülür
  (AI yok, kota yok).

### G6 · Soru-Cevap yanlış şık
- **K** — `coach-reactions.ts` `coachReaction`, ruh hali yoksa sabit metin: "💪 Moral bozmak yok! Bu şık, sınavlarda en çok
  düşülen tuzaklardan. Gel, 10 saniyede mantığını kilitleyelim 👇". İstatistik iddiasının dayanağı yok.
- **K** — açıklama alanı bütün şıkların gerekçesini (`optionWhy`) açık gösteriyor; "Diğer şıklar" açılır bölümü yok.

### G7 · "Devam et" 404 → H1
- **K, kanıtlandı:**
  1. `deneme-sinavlari/[prepId]/page.tsx` yanıttan **sonra** `after(() => maybeRescheduleMissedDays(…))` çalıştırıyor.
  2. Günü geçmiş bitmemiş adım varsa `rebuildPrepSchedule` → `replace_exam_prep_schedule`, bitmiş ve başlanmış adımlar
     dışındaki adımları silip **yeni kimlikle** yeniden yazıyor (`exam-prep-reschedule-apply.ts`, `p_preserved_ids`).
  3. Ekrandaki "Devam et" bağlantısı eski kimliği taşıyor → adım sayfası bulamıyor → 404.
  4. Sayfa yeniden açılınca yeni kimlik geliyor ve çalışıyor; tarihler bugünden yeniden dağıtıldığı için "1 gün kaymış"
     görünüyor.

  Hipotez doğru.

### G8 · Şıkların ayrılabilirliği → H2 (D2)
- **V** — soru üretilmiş içerik.
- **K** — `question-integrity.ts`: `optionKey` / `duplicateOptionPair` yalnız yazım farkını yok sayan **birebir** aynı şıkkı
  yakalıyor; `thresholdTwinOptions` ve eşdeğer çiftler dar kalıplar. "Neredeyse aynı, dil bilgisi bozuk" şık geçiyor.
  Hafif doğrulayıcı (`quiz-sanity`) dil bilgisine bakmıyor.
- Öneri: `soru-kalitesi.md`.

## Bölüm 4 G ve F için mekanizma doğrulaması

**G · Ruh hali**
- **Kayıt:** ders girişindeki seçim kaydediliyor (`study_session_moods`; alt yazı "Cevabın çalışma geçmişine kaydedilir.",
  `lesson-open.ts`).
- **Öğretmen sohbeti: ETKİLİYOR.** `chat/route.ts` günün kaydını okuyor (`loadTodayMood`) ve `moodPrompt` satırını istemine
  ekliyor. "stresli" için satır: "önce sakinleştir … tek bir küçük adım ver".
- **Ama** aynı istemde `CHAT_TEACHING_MARKUP` "en az 1 kutu + Akılda kalsın" zorunlu kılıyor. Stresli öğrencide de cevap
  kısalmıyor; satırlar çelişiyor.
- **Ders içeriği: ETKİLEMİYOR** (bilinçli, 18-19 Ekim: önceden yazım nötr). Yalnız açılış kartının cümlesi ve koçun yanlış
  cevap cümlesi değişiyor.
- **Sonuç:** 13D'de bağlama gerçekten var. Alt yazının "Öğretmen buna göre uyum sağlayacak" olması, kutu zorunluluğu ruh haline
  göre kalkınca doğru olur.

**F · Yanlışlarım / tekrar kuyruğu**
- **VAR, adım bitince:** `node/complete.ts` yanlışları otomatik olarak Yanlışlarım'a (`recordMistakes`) ve günü gelen tekrara
  (`scheduleReviewsAfterComplete`, ilk tekrar 1 gün sonra) yazıyor. "Yarın sana tekrar soracağım" sözü bu mekanizmayla
  doğru.
- **YOK:**
  - cevap anında (soru soru) kayıt,
  - "Geri al",
  - sohbetteki yanlışın kuyruğa girmesi (sohbet yalnız hazırlık sohbetinde yanılgı yazıyor).

  13D'de "Geri al" ya yeni bir uçla gerçekten yapılır ya da çip yalnız adım bitince, geri alınamaz olarak söylenir.

## Bölüm 4 için diğer hazır parçalar
- **I** (iç sistem dili): H3'ün iki satırı ve kaynak bloğu istemi. #667'de "Etiket yalnız BİLGİ içindir" kuralı eklendi;
  "hazırlık parçaları" sözcüğü istemin kendisinde (`linkedMaterialLine`), model onu öğrenciye aktarıyor.
- **J** (misafir hata kartı): `chat-panel.tsx` hata kartında yalnız "Tekrar dene" var.
- **D** (Rehberli varsayılan): bugünkü varsayılan stil profil kaydından (`tutor_style`), yoksa Adım Adım
  (`parseTutorStyle`).

## D1 · Onayını beklediğim kararlar
1. **H3** (eşleştirici regresyonu) bayraksız ayrı PR olarak düzeltilsin mi? Öneri: evet, hemen. Bugün herkesi etkiliyor.
2. 13A'dan başlanıyor. Ekran görüntülü baseline için tarayıcıda cortexplus.app'e giriş yapman gerekiyor. Giriş olmadan
   13A–13D birim testleri ve fikstürlerle ilerler; canlı senaryolar (Bölüm 8) giriş ister.
3. **H1** düzeltmesi ayrı PR olarak açıldı, birleştirilmedi (aşağıda).

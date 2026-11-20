# H2 · Çoktan seçmelide şıkların ayrılabilirliği (bulgu ve öneri, DURAK D2)

15 Kasım 2026. Kod değişmedi.

## Bulgu
G8: "Enerjinin Korunumu" sorusunun 1. sorusunda C şıkkı, E şıkkının bozuk dil bilgisiyle yazılmış neredeyse aynısı.

Bugünkü denetimler (`question-integrity.ts`, `teacher-quiz.ts`, `quiz-sanity.ts`):

| Denetim | Ne yakalar | G8'i yakalar mı |
|---|---|---|
| `optionKey` / `duplicateOptionPair` | Yazım farkını (boşluk, büyük harf, son nokta, ok) yok sayan **birebir** aynı şık | Hayır: sözcükler farklı |
| `thresholdTwinOptions` | Aynı sayı, biri yalın biri yönlü ("%50" / "%50'nin üzeri") | Hayır |
| Eşdeğer şık kuralı (`EQUIVALENT_OPTIONS_RULE`) | Bilinen eş anlamlı çiftler (resesif/çekinik vb.) | Hayır |
| Hafif doğrulayıcı (`quiz-sanity`, tek hızlı model çağrısı) | Uydurma terim, türü uymayan şık, kesin anahtar hatası | Kuralında dil bilgisi ve "iki şık aynı şeyi söylüyor" yok |

Sonuç: neredeyse aynı iki şık ve dil bilgisi bozuk şık hattın hiçbir yerinde ölçülmüyor. İkisi birlikte öğrenciye "iki doğru var
ya da soru bozuk" hissi veriyor.

## Öneri (onaydan sonra; içerik üretim hattına dokunur)
1. **Kod (modelsiz, kesin):** `nearDuplicateOptionPair(options)`.
   - İki şıkkın içerik sözcük kökleri (Türkçe, 4+ harfli sözcüğün ilk 5 harfi) Jaccard ≥ 0,8 ve sayı kümeleri aynıysa
     "neredeyse aynı şık" say.
   - Sayısı ya da tek ayırt edici sözcüğü farklı şıklar (gerçek çeldiriciler) eşik altında kalır.
   - Konu testinde ve bütün test yüzeylerinde yapı sorunu olsun: soru düzeltmeye ya da yedeğe gider. Son çare kurtarmada geri
     konmaz (iki doğru riski).
   - Ders içi soruda aynı liste (`singleAnswerIntegrityIssues`).
2. **İstem (yazar + denetçi aynı metin):**
   - "Her şık dil bilgisi doğru, tam bir ifade; iki şık aynı şeyi farklı sözcüklerle söylemez" satırı `TEST_SET_RULE` yanına.
   - Hafif doğrulayıcının değiştirebileceği kusurlar listesine "dil bilgisi bozuk ya da başka bir şıkkın tekrarı olan
     çeldirici" eklenir. Doğrulayıcı onu aynı türden yeni bir çeldiriciyle değiştirir; kök ve anahtar değişmez.
3. **Ölçüm:** `teacher_quiz` günlüğüne `nearDuplicate` sayısı. Bir hafta canlı sayı izlenir, eşik buna göre ayarlanır.

Bekçi testleri farklı derslerden örneklerle (fizik, tarih, biyoloji); üretim koduna ders sabiti girmez.

## Bedel
- Kod denetimi: model çağrısı yok.
- İstem eki: yazar ve doğrulayıcı istemine 1-2 satır (jeton etkisi ihmal edilebilir).
- Eşik çok sıkı seçilirse geçerli çeldiriciler de elenip yedek ve ikinci geçiş artar. Bu yüzden önce ölçüm.

**Karar (D2):** 1, 2, 3'ü uygulayayım mı?

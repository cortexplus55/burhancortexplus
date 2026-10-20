# 2 adım ileri — yol ve ders (20 Ekim 2026)

Ürün sahibi, ders maliyeti sorusuna: "Astra mantığına geçelim. Komple kurmak yerine yolda ve derste bir
sonraki 2'yi aça aça ilerleyelim; hem maliyeti kısarız hem de kullanıcının durumuna göre ilerleriz."

## Neden

- Ölçülen ders maliyeti ~$0,016, kredisi 6 (~$0,006). Son 3 günde ders yazımına $0,41, önceden yazıma $0,15
  gitti; yolu planlamak model kullanmıyor (maliyeti yok).
- Bugün yol baştan sona kurulu (25 günlük sette ~94 düğüm) ve ders tek yazım çağrısıyla baştan sona yazılıyor;
  öğrenci yarıda bıraksa da kalan kavramlar yazılmış oluyor.
- Gerçek öğrenci verisi henüz yok (son 30 günde ders kayıtları iki hesaptan); karar mantığa dayalı, yayından
  sonra ölçülecek.

## Kararlar (ürün sahibi, 20 Ekim 2026)

| Soru | Karar |
|---|---|
| Yolda ne görünür | Yolun tamamı; şu anki adım + sonraki 2 adım net, sonrası **soluk** ve "Plan sonuçlarına göre değişebilir" |
| Sonuca göre sıra | **Kendiliğinden**: puanlı adımda %50 altı → o konunun odaklı pratiği hemen sıradaki adım; %90 üstü → o konunun ek alıştırması atlanır; öğrenciye kısa satırla söylenir |
| Ders içinde | İlk karar "2 kavram önden"di; aynı gece ölçümle **geri alındı** (aşağıda "Aşama 2"): ders tek parça kalır |

## Aşama 1 — Yol

| Parça | Kural | Nerede |
|---|---|---|
| Görünüm | Şu anki + `PATH_LOOKAHEAD` (2) adımdan sonrası soluk; ilk uzak adımın yanında not | `study-path-window.ts`, `exam-prep-home.tsx` |
| Önceden yazım | Yalnız pencere içi (sıradaki 2 adım) | `requestNextPrefetch` |
| Uyarlama | Puanlı adım bitince: %50 altı → konunun odaklı pratiği öne; %90 üstü → konunun kalan ek alıştırması atlanır | düğüm tamamlama |

Takvim (Takvimim, hatırlatmalar, sınav günü tahmini) arka planda tam plan olarak kalır.

## Aşama 2 — Ders: tek parça kalır (aynı gece, ölçümle karar değişti)

Ölçüm (son 10 günün 30 dersi): 5'i 2 kavramlık, 14'ü 3, 9'u 4, 2'si 5. "2 kavram önden" kuralında öğrenci
1. kavramdayken 2. ve 3. hazır olmalı; derslerin %63'ü (2-3 kavramlık) yine baştan sona yazılır — tasarruf da
uyarlama da sıfır, geri kalanında yalnız son 1-2 kavram ve yalnız yarıda bırakılırsa. Ürün sahibinin kararı:

- Ders tek parça kalır; maliyet ölçülen kaynaktan düşürülür. En büyük kaynak düzeltme turları (aynı gece canlı
  derste 4 kavram / 11 çağrı / 3 tur); tablo turu #383 ile kapandı. 27 Ekim civarı `ai_usage_events` ve
  `/admin/ders-hatalari` ile yeniden ölçülür, sıradaki en sık tur sebebine bakılır.
- Ders sonunda öğrencinin yanlışlarına göre uyarlama **zaten var**: yanlış cevaplanan her kavram için dersin
  sonunda "Tekrar" adımı ve farklı bir soru (`exam-lesson-steps.tsx` `review-gate`, sunucunun mühürlü tekrar
  sorusu); yanlışlar odaklı pratiğe de beslenir. Konu düzeyinde uyarlama Aşama 1'de (#384).
- Altın kıyas onayı (~$0,05) Aşama 2 içindi; kullanılmadı.

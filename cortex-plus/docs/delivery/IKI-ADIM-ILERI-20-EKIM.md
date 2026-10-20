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
| Ders içinde | Önce plan (başlık + kavram listesi), sonra kavram kavram; **2 kavram önden**; sonraki kavram önceki cevaplara göre ayarlanır; yarım dersin kalanı yazılmaz |
| Kalite ölçümü | Yerel altın kıyas (eski ders ↔ yeni ders, aynı kaynak), ~$0,05 model harcaması onaylı |

## Aşama 1 — Yol

| Parça | Kural | Nerede |
|---|---|---|
| Görünüm | Şu anki + `PATH_LOOKAHEAD` (2) adımdan sonrası soluk; ilk uzak adımın yanında not | `study-path-window.ts`, `exam-prep-home.tsx` |
| Önceden yazım | Yalnız pencere içi (sıradaki 2 adım) | `requestNextPrefetch` |
| Uyarlama | Puanlı adım bitince: %50 altı → konunun odaklı pratiği öne; %90 üstü → konunun kalan ek alıştırması atlanır | düğüm tamamlama |

Takvim (Takvimim, hatırlatmalar, sınav günü tahmini) arka planda tam plan olarak kalır.

## Aşama 2 — Ders (özellik anahtarıyla, önce kurucu hesabı)

1. Yazar önce dersin planını ve ilk iki kavramı yazar (bugünkü akış, kavram listesi giriş kartında).
2. Öğrenci kavram *k*'ya gelince *k+2* yazılır; istemde o ana kadarki ekranlar ve öğrencinin cevapları
   (yanlış cevaplanan soru varsa kısa hatırlatmayla başla).
3. Her kavram bugünkü gibi denetlenir, düzeltilir, yayımlanır (ders hızı kuralları aynen).
4. Kapanış (sık hata, özet) son kavramla birlikte, öğrencinin cevaplarını görerek.
5. Önceden yazım planı ve ilk iki kavramı yazar.

Ölçüm: altın kıyas (kalite), canlıda kavram başına süre ve çağrı, yarım bırakılan derste yazılmayan kavram sayısı.

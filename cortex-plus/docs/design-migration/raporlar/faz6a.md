# Faz 6A · Sohbet kabuğu (`ui.v2.ogretmen`)

## 1. Özet
- `/ogretmen` bayrak açıkken `data-ui="ogretmen"` sarmalayıcısıyla yeni görünüm (yalnız CSS): 768 px sohbet sütunu,
  kenarlıksız balonlar, 40/44 px anlatım stili hapları, tek brand yuvarlak Gönder.
- Bayrağa bağlı davranış (`ChatPanel followUser`): akan yanıt öğrenciyi sona çekmez (yalnız yeni mesaj eklenince),
  yukarıdaysa "Yeni mesaja git" hapı; ekran okuyucu parça parça değil, yanıt bitince bir kez "Öğretmen yanıtladı".
- Bayrak KAPALIYKEN DOM ve davranış bugünküyle aynı.

## 2. PR
Bu PR, taban Faz 5.

## 3. Değişen dosyalar
`src/components/chat/chat-panel.tsx` (yalnız `followUser` dalı), `src/app/ogretmen/page.tsx`,
`src/styles/ui-v2-ogretmen.css`, `tests/unit/ui-v2-ogretmen.test.ts`, `desen-haritasi/ogretmen.md`.

## 5. Test sonuçları
Tip denetimi 0 hata; yeni ve ilgili birim testleri geçti; tam paket ve görsel taban birleştirme öncesi yığının tepesinde.

## 6. Promptan ayrılan yerler
- Hazırlık sohbeti (`examChrome`) bu PR'da değil (ayrı kabuk).
- Akışı 30–50 ms parçalarla taklit eden e2e yazılamadı: Playwright `route.fulfill` gövdeyi tek seferde gönderiyor.
  Davranış birim düzeyinde ve kodla sabit (bekçi test). "Sonraki karar".

## 10. Burhan'ın yapacakları
- iOS Safari ve Android Chrome'da gerçek klavyeyle sohbet (ANA-PROMPT Faz 6).

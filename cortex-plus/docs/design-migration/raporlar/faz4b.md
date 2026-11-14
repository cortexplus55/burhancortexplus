# Faz 4B · Ders ekranı (`ui.v2.ders`)

## 1. Özet
- Bayrak altyapısı `src/lib/ui-v2/flags.ts`: canlıda `feature_flags` satırı (`ui.v2.<ekran>`, pilot listesi dahil),
  önizlemede açık, yerelde `UI_V2` ya da `cx-ui-v2` çerezi (canlıda yok sayılır).
- Ders sayfası bayrak açıkken oturumu `<div class="cx-ui-scope" data-ui="ders">` (`display: contents`) ile sarar; yeni
  görünüm yalnız bu sarmalayıcının altında CSS ile gelir. Bayrak KAPALIYKEN sarmalayıcı yok: DOM ve görünüm eskisiyle
  birebir. Davranış kodu ortak.
- İnceleme: `raporlar/faz4b-inceleme.md`; eşleme: `desen-haritasi/ders.md`.

## 2. PR
Bu PR, taban 4A.

## 3. Değişen dosyalar
- `src/lib/ui-v2/flags.ts`, `src/styles/ui-v2-ders.css`.
- `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx` (bayrak + sarmalayıcı).
- Fikstür `/e2e/ders-mobil?ui=v2`.
- Testler: `tests/unit/ui-v2-bayrak.test.ts`, `tests/e2e/ders-v2.spec.ts`.

## 4. Ölçümler
Bayrak açık, 1280 / 768 / 375: taşma 0, üst çubuk ≥ 56 px, ilerleme 6 px, ikon ≥ 40 (telefonda 44), tek brand, adım
kartında kenarlık yok (e2e). Bayrak kapalı: sarmalayıcı yok; görsel taban farkı 0 (Faz 5 raporu).

## 5. Test sonuçları
Faz 5 raporu, bölüm 5.

## 6. Promptan ayrılan yerler
- "Açıkla" + "Devam et" ikilisi, açılışta başlıkların tek tek gelmesi, "Öğrendiğin 3 şey", hedef adım şeridi: davranış
  ekler ya da veri yok; "Desen yok" (`desen-haritasi/ders.md`).

## 7. Yapılandırma değerleri
Yok.

## 8. Desen yok / Sonraki karar
`desen-haritasi/ders.md` "Desen yok".

## 9. Yapılamayanlar ve riskler
- Bayrağın canlıda açılması Özellik Anahtarları'ndan (`ui.v2.ders`); yönetim paneli PIN kapısının arkasında.

## 10. Burhan'ın yapacakları
- Önizlemede ders ekranına bakmak; canlıda bayrak açılışı (kapanış raporundaki adımlar).

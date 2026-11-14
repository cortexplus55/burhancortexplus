# Faz 5 · Tekrar ekranları (`ui.v2.tekrar`; 5A + 5B tek PR)

## 1. Özet
- Konu testi, Doğru / Yanlış ve Akıllı kartlar yeni görünümü `ui.v2.tekrar` arkasında, ders ekranıyla aynı yöntemle
  (sarmalayıcı + yalnız CSS). Şık düğmelerine görünümü değiştirmeyen kanca (`data-cx-option`, `data-cx-letter`).
- Şık sayısı veriden (`options.length`; 4 şıklıda "E" yok, test). Tekrar ekranlarına `Gate` konmadı (bekçi).
- 5B ayrı dal yerine 5A ile aynı PR: aynı katman dosyası ve aynı sayfa sarmalayıcısı.

## 2. PR
Bu PR, taban 4B.

## 3. Değişen dosyalar
- `src/styles/ui-v2-tekrar.css`, `src/components/parity/exam-quiz-play.tsx` (yalnız `data-*` kancaları).
- `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx` (`TEKRAR_KINDS`).
- Testler: `tests/unit/ui-v2-tekrar.test.tsx`. Eşleme: `desen-haritasi/tekrar.md`.

## 4. Ölçümler
(Görsel taban ve denetim sonuçları aşağıda.)

## 5. Test sonuçları (yığının tepesi: 3A + 3B + 4A + 4B + 5)
- Tip denetimi: 0 hata. Lint: 0 hata (uyarılar dokunulmayan dosyalarda, önceden var).
- Birim: **734/734 dosya, 7.072 test** (referans 728 / 6.869). Üretim derlemesi başarılı.
- Görsel taban (bayraklar KAPALI): ders, konu testi ve bütün tekrar rotaları birebir aynı; farklar yalnız 3B'nin
  dokunduğu ana ekran ve profil (3B raporu).

## 6. Promptan ayrılan yerler
- Matris hücreleri (hedef şeridi, seri çipi, süre halkası, açılış dizisi, sonuç sayacı): bugün verisi yok ya da ekranda
  zaten var; çizilmedi (`desen-haritasi/tekrar.md` "Desen yok").
- Gizli metinler bugünkü haliyle ("Doğru", "Yanlış", "Doğru cevap", "Kaçırılan doğru"); "Doğru cevap buydu" yazılmadı
  (metin değişmez kuralı).

## 7. Yapılandırma değerleri
Yok.

## 8. Desen yok / Sonraki karar
`desen-haritasi/tekrar.md`.

## 9. Yapılamayanlar ve riskler
- Hesaplı e2e (`free-fresh`, `free-used`, `plus` ile üç ekran) CI'da sır yok (`E2E_USERS_JSON`); yerelde test
  hesaplarıyla görsel taban koşuldu.

## 10. Burhan'ın yapacakları
- Önizlemede tekrar ekranlarına bakmak.

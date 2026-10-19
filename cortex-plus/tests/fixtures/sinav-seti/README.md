# Sınav seti: AYT Biyoloji — İnsan Fizyolojisi ve Homeostazi (19 Ekim 2026)

Ürün sahibinin istediği "son karşılaştırma" seti: aynı konuda birbirine bağlı yedi dosya, 25 gün
sonraki sınav için hem Cortex'te hem Astra'da sınav hazırlığı kuruldu.

| Dosya | Tür | Yalnız bu dosyada olan |
|---|---|---|
| AYT-Biyoloji-Insan-Fizyolojisi.pdf | 65 sayfa konu anlatımı (8 ünite) | Ana metin |
| Homeostazi-Son-Tekrar-Notu.docx | 6 sayfa öğretmen notu; Word'ün kendi sayfa işaretleri (`lastRenderedPageBreak`), başlıklar "sayfa öncesi kes", elle sayfa sonu yok | ANP hormonu, asidoz/alkaloz tablosu, 25 günlük plan |
| Defter-Nefron-Idrar-Olusumu.jpg | El yazısı defter | "S → G → S" sırası |
| Defter-Kalp-Uyari-Iletimi-EKG.jpg | Kareli defter | PR aralığı 0,12–0,20 sn, QRS < 0,12 sn |
| Tahta-Aksiyon-Potansiyeli.jpg | Beyaz tahta | Mutlak / göreceli refrakter dönem |
| Test-14-Homeostazi-Isaretli.jpg | İşaretlenmiş test sayfası | 6 soru; 2. (ADH → B) ve 6. (CO₂ → C) yanlış işaretlenmiş |
| Kart-Hipofiz-Hormonlari.jpg | Hormon kartı | "FLAT PiG" ezber kodu |

`pdf-pages.json`: PDF'in sayfa sayfa metni (temellendirme testleri için). İçerik elle yazıldı; PDF ve
fotoğraflar Chromium ile, Word fflate ile üretildi.

`photo-ocr.json`: fotoğrafların canlıdaki ilk okuması (19 Ekim, gpt-4o-mini). Konu eşleştirme testleri
için yeterli, **şık harfleri güvenilir değil**: Test-14'ün iki sütunlu şıkları sütun sütun okunup yeniden
harflendirildi (1., 3., 5. ve 6. sorular), son şıklar düştü. Kâğıdın kendisinde 2. soruda öğrenci A'yı
("Arka hipofizde üretilir") işaretledi, doğrusu B; 6. soruda şıklar A) plazmada çözünmüş B) karbaminohemoglobin
C) bikarbonat iyonu D) oksihemoglobin E) karboksihemoglobin, öğrenci B'yi işaretledi, doğrusu C (~%70).
20 Ekim'den beri fotoğrafı luna okuyor ve şık kendi harfiyle kalıyor (AGENTS.md, "Fotoğraf okuma").

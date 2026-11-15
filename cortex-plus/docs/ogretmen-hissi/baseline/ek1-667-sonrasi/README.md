# EK-1 · #667 sonrası baseline (15 Kasım 2026, TR ~12:40)

Burhan'ın hesabı (kurucu), canlı `cortexplus.app`, `teacher.v2` yok (bugünkü davranış). Süreler tarayıcıda ölçüldü:
`/api/ai/chat` isteğinin başından ilk yanıt baytına ve akışın sonuna (`fetch` + `response.clone()` okuyucusu). Ekrandaki
"Problem N saniyede çözüldü" çipi bitişle tutarlı.

| Senaryo | Stil | İlk metin | Bitiş | Kelime | Soru | Kutular | Not |
|---|---|---|---|---|---|---|---|
| S1 · "Üslü sayılarda negatif üssü hep karıştırıyorum. 2^-3 neden 1/8 oluyor?" | Doğrudan Çöz | **6,2 sn** | 8,3 sn | 76 (G1'de 155) | 1 | Benzetme + Akılda kalsın | Cevap ilk cümlede ("2⁻³ = 1/8, çünkü…"). Hazırlık adı / "hazırlık parçaları" sızıntısı yok. Soru soran mesajda "Akılda kalsın" var |
| S3a · aynı soru | Sokratik | 6,5 sn | 9,7 sn | 131 | 1 | 2 formül kartı + Benzetme + Akılda kalsın | Cevabı (2⁻³ = 1/8) türetme kartlarıyla veriyor; "Akılda kalsın" sonucu söylüyor |
| S3b · "1/6 sanırım" | Sokratik | 2,9 sn | 5,1 sn | 93 | 1 | Formül + Sık yapılan hata + Akılda kalsın | Teşhis sorusu yok ("nasıl buldun?"): "payda 6 değil, 9 olur" diye hemen düzeltiyor |
| Hazırlık sohbeti · "Sürtünme varken mekanik enerji neden korunmuyor?" (Enerjinin Korunumu, Belgem + genel bilgi, Sokratik) | Sokratik | (6,5 sn ilk bayt, metin yok) | **27,9 sn** | 74 | 0 | — | **Cevap yok:** "Bu soruyu iki kez denedim ama … emin olamadım … Soruyu biraz daha açar mısın". Günlük: `document_answer_rejected`, `stage: teacher_tutor`, sebep "cevapta genel fizik bilgisi 'Genel bilgiden:' paragrafı olmadan anılıyor" (`hazirlik-sohbeti-gunluk.png`) |

Ekran görüntüleri bu klasörde (`s1-*.jpg`, `s3-*.jpg`, `hazirlik-sohbeti*.{jpg,png}`).

## I (iç sistem dili) maddesinin durumu

- **Çözülen:** S1 ve S3'te "hazırlık parçaları", "eşleşen bölüm bulunamadı" cümlesi ve hazırlık adı çıkmadı (G1/G4'teki
  sızıntı bu ölçümde görülmedi). Kalıcı çözüm H3 (#676, birleştirilmedi): eşleştirici artık tek beş harflik önekle hazırlık
  bağlamıyor ve kanıt yokken bağlantı satırı isteme gitmiyor. Bugünkü kod hâlâ bağlayabilir; ölçümde modelin satırı
  öğrenciye aktarmaması şanstır.
- **Kalan:** I'nın ikinci yarısı ("Bu konu notunda yok; ders kitabı bilgisiyle anlatıyorum (Genel bilgi)" biçimi) 13A'nın işi.

## Hedeflere göre (EK-6: ilk metin ≤5 sn, bitiş ≤10 sn)

- **Bitiş:** sohbet (S1, S3) 5–10 sn ✓ (#667 öncesi 42–59 sn).
- **İlk metin:** sohbet açılışında 6,2–6,5 sn ✗ (hedef ≤5). Takip turunda 2,9 sn ✓. İlk turdaki ~6 sn modelden önceki
  hazırlıktan (materyal eşleştirme, belge araması, güvenlik denetimi); 13A'da ilk metin ölçüsü (`lesson_timings` `chat`
  `firstText`) eklenip parçalara bölünecek.
- **Hazırlık sohbeti:** 27,9 sn ve cevap yok ✗. Yeni bulgu (aşağıda).

## Yeni bulgu · hazırlık sohbeti "Genel bilgiden" etiketi yüzünden cevapsız kalıyor

Hazırlık sohbeti `runTeacherTutor` yolunda; "Belgem + genel bilgi" modunda belgede olmayan bilgi "Genel bilgiden:" paragrafıyla
verilmeli. Yazar etiketi koymayınca denetçi cevabı reddediyor, ikinci deneme de aynı yerde takılıyor ve öğrenci 28 sn sonra
"emin olamadım" görüyor. Kavram sorusu yanlış değildi; yalnız etiket eksikti. Bu, "Belgem + genel bilgi" modunun varsayılan
olduğu her hazırlık sohbetinde olabilir. Öneri (ayrı PR, onayla): denetçinin tek itirazı "etiketsiz genel bilgi" ise yeniden
yazdırmak yerine düzeltme turunda yalnız o paragrafı etiketlet; ya da ana sohbetteki gibi (`settlePedagogicalLabels`) mod
"Belgem + genel bilgi" iken bu itirazı reddetme sebebi saymayıp etiketi ekle. Karar Burhan'ın.

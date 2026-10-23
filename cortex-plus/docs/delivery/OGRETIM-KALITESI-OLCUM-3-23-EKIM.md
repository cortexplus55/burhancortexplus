# Öğretim kalitesi — üçüncü kör ölçüm (23 Ekim 2026)

Önceki tur: `OGRETIM-KALITESI-OLCUM-2-22-EKIM.md`. Bu tur PR #388 (tekrar, sahte vaka, kopya ikinci soru, podcast
kalıbı) ve PR #389 (ilk kavram takılmaz, ikinci soru kavramı düşürmez) sonrası kodu ölçer.

**Kısa cevap: derslerde artık dört gözün dördünde de öndeyiz; podcast'te öğrenci gözü hâlâ Astra'da.**

## Nasıl ölçüldü

- Aynı on çift, Astra tarafı ikinci turla **birebir aynı**. Cortex tarafı yeniden üretildi: canlıdaki kodla, canlı
  girdilerle (temiz sayfalar, sayfa kenarı satırları, öğretmen analizinin sınav maddeleri), yerelde; veritabanına
  yazılmadı. Podcast iki türde: Soru-Cevap (ikinci turun türü) ve Diyalog (hazırlığın varsayılanı).
- Her çift iki sırayla, dört gözle (öğrenme, sınav, öğrenci, sadakat); toplam 88 yargı.
- Ortak kaynaklı beş çiftte öğrenci sınavı aynı sınavla; Astra ve "hiç çalışmamış" cevap kâğıtları yeniden kullanıldı,
  Cortex öğrencisi yeniden girdi, üçü yeniden notlandı.
- **Fark:** bu turun yargıçları başka bir modelle koştu (ikinci tur kullanım sınırına takılmıştı). Astra'nın malzemesi
  değişmediği hâlde onun ortalamaları düştü (öğrenci gözü 64,8 → 59,4); yargıç etkisi bu kadar. Aşağıda hem kazanılan
  yargı sayısı hem ortalama fark veriliyor.

## Dersler (9 çift × 2 sıra)

| Göz | 2. tur kazanılan | 3. tur kazanılan | 2. tur fark (Cortex − Astra) | 3. tur fark |
|---|---|---|---|---|
| Öğrenci | 4 / 18 | **15 / 18** | −3,5 | **+4,6** |
| Öğrenme bilimi | 12 / 18 | 17 / 18 | +6,3 | +11,0 |
| Sınav koçu | 18 / 18 | 17 / 18 | +17,0 | +18,7 |
| Kaynağa sadakat | 18 / 18 | 18 / 18 | +24,0 | +27,2 |

Cortex'in kendi öğrenci puanı 61,3 → 64,0. Fark büyüdü ama bir kısmı yargıç değişikliğinden; yön kesin, büyüklük değil.
Öğrenci gözünde Astra'nın aldığı üç yargı: Büyüme ve Beslenme'nin ters sırası, Trigonometri teoremlerinin bir sırası.

## Podcast (2 tür × 2 sıra)

| Göz | Diyalog | Soru-Cevap |
|---|---|---|
| Öğrenci | Astra iki sırada (48-50 / 75) | Astra iki sırada (53-55 / 72-76) |
| Öğrenme | Astra iki sırada | Astra iki sırada |
| Sınav | Berabere / Cortex | Cortex iki sırada |
| Sadakat | Cortex iki sırada | Cortex iki sırada |

"Evet;/Hayır;" kalıbı gitti, sınav gözü bize döndü; ama kulakla dinleyen öğrenci için Astra hâlâ açık ara daha
akıcı ve akılda kalıcı.

## Öğrenci sınavı (15 soru)

| Çift | Cortex | Astra |
|---|---|---|
| Pediatri büyüme | 15 | 12 |
| Pediatri beslenme | 15 | 3 |
| KPSS kuvvetler | 9 | 5 |
| KPSS demokratik devlet | 14 | 8 |
| Trigonometri özel açılar | 8 | 3 |

İkinci turla aynı tablo (61 / 31); yanlış cevap yine yok.

## Hız ve kararlılık (yerel üretim)

PR #388 koduyla Özel Açılar 13 tur döndü, iki kavram atıldı; iki dersin ilk ekranı 84-200 sn'de geldi. PR #389'dan
sonra dokuz dersin sekizinde atılan kavram yok. İlk ekran çoğunda 15-35 sn, Büyüme ve Beslenme'de 42-49 sn.
Anayasalar'da ilk kavram atıldı: kaynakta olmayan "maddi/şekli anayasa" tanımları.

## Kalan açıklar ve sıradaki iş

1. **Podcast**, en büyük açık: öğrenci gözünde 20+ puan. Sıradaki iş podcast'in sahne planıyla yeniden tasarımı.
2. **"Neden böyle?" açıklaması** (ürün sahibinin 23 Ekim kararı): Anayasalar'daki atılan kavram ve "neden yok"
   eleştirisi buraya bağlanıyor.
3. **İlk ekran** bazı derslerde 40 sn'yi geçiyor; canlıda `/admin/beta` ile izlenecek.
4. İkinci soru çıkarıldığında çalışma anının yedeği aynı soruyu karıştırılmış şıklarla soruyor; telafi değeri düşük.

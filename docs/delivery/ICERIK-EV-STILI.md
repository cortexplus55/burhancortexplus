# İçerik ev stili — konu, ders, podcast

**Tarih: 10 Eylül 2026.** Aynı zemin mekaniği PDF'i Astra'ya ve Cortex'e
yüklendi, üretilen her şey yan yana kondu. Buradaki kurallar o
karşılaştırmadan çıktı ve **kodda duruyor** — prompt metnine yazılmış iyi
niyet değil, doğrulayıcı. Binlerce PDF aynı elden çıkmış gibi görünsün diye.

Kural değiştirmeden önce: bu dosya nedeni anlatır, kod nasılını. İkisi
ayrışırsa kod haklıdır, bu dosya güncellenir.

---

## 1. Konu bölme

Kod: `src/lib/documents/topic-title.ts` · Test: `tests/unit/topic-title.test.ts`

Belgenin içindekiler tablosu bir konu listesi **değildir**. Konu listesi
öğrencinin yükleme sonrası gördüğü ilk ekran; orada bölüm numarası ve
parantez içi kısaltma hiçbir şey öğretmiyor.

| Kural | Kod |
|---|---|
| Yaklaşık 3 öğretim sayfasına 1 konu, 4–12 arası | `targetTopicCount` |
| Baştaki bölüm numarası ve sondaki parantezli kısaltma atılır | `normalizeTopicTitle` |
| "Sayfa N", tek kelimelik, cümleye dönmüş başlık elenir | `topicTitleIssues` |
| Kapsam adı eklenir, önemli alt başlık "ve" ile terfi eder, sınanamayan bölüm komşusuna katılır | `TOPIC_TITLE_RULE` |

Gözlenen fark:

```
biz:   "3. Dane Boyu, Kıvam Limitleri ve Sınıflandırma (USCS)"
Astra: "Dane Boyu Dağılımı ve Zemin Sınıflandırması"
biz:   "5. Efektif Gerilme İlkesi"
Astra: "Efektif Gerilme İlkesi ve Sızma Kuvvetleri"      (5.2'den terfi)
biz:   "1. Zeminin Oluşumu ve Üç Fazlı Sistem"
Astra: (konu değil — tek başına sınanamıyor, 2'nin açılışı)
```

Elenen başlığın sayfaları en yakın konuya bağlanır; kapsama düşmez,
harita tümden çöpe gitmez.

---

## 2. Ders adımları

Kod: `src/lib/learning/teaching-standards.ts` (`validateLessonPedagogy`)

Astra'nın dersi baştan sona gezildi. İskelet şu:

1. **Kanca** — dersin tam adı, konuya girmeden önce tek paragraf
2..n. **Kavram adımı** — başlık kavramın adı, metinde anahtar terimler
   koyu, tuzak akışın içinde ayrı kutuda, **adım kendi kontrolüyle biter**
n+1. **Özet ve gelecek bakış** — özet + **sonraki konunun adı**
n+2. **Tekrarla** — geldiği bölümün adıyla etiketli hatırlama sorusu
son. **Kapanış** — kendini test et

Bizde uygulanan kurallar:

- Bölüm başlığı şablonun adı olamaz (`isScaffoldHeading`). Üretilen bir
  zemin dersinde beş başlık "Kısa Açıklama / Kaynağa Dayalı Örnek /
  Yaygın Hata / Orta Bilgi Kontrolü / Kısa Kapanış" çıkmıştı — öğrenci
  içindekilerden ne öğreneceğini değil, üretim şablonumuzu okuyordu.
- Hedef başlığı tekrarlayamaz ("X konusunu öğren.").
- Genel bakış içi boş olamaz ("Bu derste X açıklanacak…").
- 4+ bölüm varsa en az 2 ara kontrol.
- Çözümlü örneğin **her adımı** kendi başına doğru olmalı.

Çeldirici kuralı (Astra'dan): bir adım N kardeş terim tanımlıyorsa
kontrol "hangisi bu tanıma uyar" diye sorar, çeldiriciler diğer
kardeşlerdir. Açıklama doğru şıkkı onaylamakla kalmaz, **her çeldiricinin
gerçekte ne olduğunu** söyler ve kaynağa yaslanır ("Metne göre…").

---

## 3. Podcast

Kod: `src/lib/learning/teaching-standards.ts` (`validatePodcastPedagogy`,
`emptyMistake`) · Prompt: `src/app/api/learning/exam-prep/node/route.ts`

Evre sırası (tanım → neden → örnek → hata → özet) duruyor; **evrenin adı
başlık olamaz**. Eski kural tam tersini yapıyordu: başlıklarda bu adları
*arıyor*, bulamazsa reddediyordu. Model de en ucuz yolu seçti ve zemin
podcast'inde beş bölümün beşi de "TANIM / NEDEN / ÖRNEK / YAYGIN HATA /
ÖZET" adını aldı.

"Yaygın hata" öğüt olamaz (`emptyMistake`). "Dane boyu dağılımını
anlamadan sınıflandırma yapmak yanlıştır" bir hata değil; "LL yerine PI
kullanmak" bir hatadır.

---

## 4. Eşik ve sınıflandırma — bütün üretimleri kapsar

Kod: `src/lib/ai/generate.ts` (`CONTENT_STYLE`)

Canlı podcast şunu söylüyordu:

> "Bir zemin, No.200 eleğinden %8 geçiyorsa, ince daneli sayılır."

PDF'in kuralı tersi: geçen oran **%50'yi aşıyorsa** ince daneli, ve PDF'in
kendi örneğinde %8 **kaba** daneli. Model sayıyı doğru kopyalamış, sonucu
ters çevirmiş. Sesli içerik en tehlikeli yeri: öğrenci dinlerken bir
yazıyı sorguladığı gibi sorgulamıyor.

Kural: **değer, yön ve sonuç kaynaktan birlikte gelir.** Kaynağın örneği
kullanılıyorsa vardığı sonuç da aynen kullanılır.

Bu bir güvenlik ağı değil — regex anlam tersine dönmesini bilemez. İki
katman var: üretimde ortak stil kuralı, bağımsız incelemede açık talimat.
Kalıcı çözüm podcast'i **doğrulanmış ders içeriğinden türetmek**; henüz
yapılmadı.

---

## Astra'dan bilerek ayrıldığımız yerler

| Astra | Biz | Gerekçe |
|---|---|---|
| LaTeX render | Konuşulabilir Unicode | Aynı metin podcast ve sesli anlatımda okunuyor |
| Çalışma yolunda tek "sonraki iş" kartı | Gün gün plan | Sınav tarihi olan öğrenci ne zaman neyi bitireceğini görmek istiyor |
| Ücretsiz kullanıcıya stüdyo TTS | Cihaz sesi | Podcast maliyetin %98,4'ü; ücretsiz kullanıcı başına aylık ~108 TL |

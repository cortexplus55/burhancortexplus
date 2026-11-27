# /mufredat ince içerik ve tarama bütçesi denetimi (27 Kasım 2026)

Ürün sahibinin isteği: site haritasındaki adreslerin kaçının `/mufredat` altında olduğu, kelime sayıları, birbirine çok
benzeyen kısa şablon sayfalar ve "scaled content / thin content" riski. **Bu denetimde hiçbir sayfaya noindex basılmadı**;
öneriler ürün sahibinin kararını bekliyor.

## Yöntem

- Canlı `https://cortexplus.app/sitemap.xml` (27 Kasım 2026, #737 yayınından sonra) okundu; `/mufredat` altındaki her
  adres yalnız okunarak indirildi (6 eşzamanlı istek, hata 0).
- Her sayfada `<main>` içindeki görünür metnin kelime sayısı ölçüldü (üst menü ve altbilgi hariç).
- **Sayfaya özgü kelime:** aynı türdeki sayfaların %20'sinden fazlasında birebir geçen satırlar (şablon: "Bu üniteye ücretsiz
  çalış", "Kaynak: MEB TTKB" …) çıkarıldıktan sonra kalan kelimeler.
- **Yakın kopya:** sayfaya özgü metnin 3 kelimelik parçalarından 64 bitlik SimHash; aynı programın sayfaları arasında 3 bitten
  az fark yakın kopya sayıldı.
- Eski konu ağacı programları (`*-2026-tree-*`) ile derin karşılıkları (`*-2026-deep-*`) arasında kelime örtüşmesi ölçüldü.

## Sayılar

Site haritasında **5.236** adres var; **5.217'si (%99,6) `/mufredat` altında**.

| Sayfa türü | Adet | Kelime (ortanca) | Kelime (ort. / %10 / %90 / en az) | Sayfaya özgü kelime (ortanca) | Sayfaya özgü < 150 | < 300 | noindex |
|---|---|---|---|---|---|---|---|
| Dizin (`/mufredat`) | 1 | 5.913 | — | 5.913 | 0 | 0 | 0 |
| Program (`/mufredat/<program>`) | 158 | 396 | 980 / 276 / 1.600 / 193 | 382 | **22** | 59 | 0 |
| Ünite (`/mufredat/<program>/<n>`) | 864 | **53** | 68 / 41 / 131 / 30 | **43** | **823** | 863 | 0 |
| Kazanım (`/mufredat/<program>/<n>/<m>`) | 4.194 | 736 | 731 / 544 / 901 / 315 | 675 | 0 | 3 | 0 |

- Aynı programın içinde **yakın kopya çift yok** (0).
- **Kazanım sayfaları sağlıklı:** en kısası 315 kelime, ortanca 736; havuzdaki doğrulanmış ders bölümü, kilit noktalar,
  çözümlü örnek ve kökü görünen örnek soruyla zengin.
- **Ünite sayfaları ince:** yalnız ünite adı, kazanım kodları ve kazanım cümleleri (ünite başına ortalama 5 kazanım) ile
  "Bu üniteye ücretsiz çalış" düğmesi. 864 sayfanın 823'ünde sayfaya özgü metin 150 kelimenin altında, 745'inde 100'ün altında.
  Ailelere göre (sayfaya özgü < 150): meb 161, yks 165, dus 161, tus 142, kpss 87, lgs 33, ales 28, dgs 28, yds 18.
- **Eski konu ağacı programları:** 38 program, **632 adres** (38 program + 180 ünite + 414 kazanım; site haritasının %12,1'i).
  37'sinin derin karşılığı var ve aynı dersi ikinci kez kapsıyor: eski ağacın kelimelerinin **%55–72'si** derin programda da
  geçiyor (birebir kopya değil, aynı konunun daha sığ hâli). Yalnız `kpss-2026-tree-guncel`'in derin karşılığı yok (16 adres).
  Sayfaya özgü metni 150 kelimenin altındaki 22 program sayfasının **22'si de** bu eski ağaçlar (6 TUS, 16 DUS).

## Risk

- Ünite sayfaları "kendi içeriği olmayan gezinme sayfası" sınıfında; 864 adet ve aynı şablonla. Google bunları büyük olasılıkla
  "Tarandı, şu anda dizine eklenmemiş" bırakır; tek başına ceza riski düşük ama tarama bütçesinin %16,5'ini kullanıyorlar.
- Eski ve derin konu ağaçları aynı arama için birbiriyle yarışır (yamyamlık); 616 adres gereksiz yere taranır.
- Kazanım sayfalarında ince içerik riski görülmedi.

## Öneriler (karar ürün sahibinde)

1. **Kazanım sayfaları (4.194) ve program sayfaları dizinde kalsın.** Değişiklik gerekmiyor.
2. **Ünite sayfalarını zenginleştir (önerilen):** havuzda her ünitenin doğrulanmış ders ve soru içeriği var (864/864 ünite).
   Ünite sayfasına ünite özeti, kilit noktalar ve her kazanımın tek cümlelik özeti (kazanım sayfasındaki ilk paragraftan)
   eklenirse sayfaya özgü metin 300-500 kelimeye çıkar; model çağrısı gerekmez. Bu yapılamayacaksa **seçenek B:** ünite
   sayfaları `noindex, follow` olur ve site haritasından çıkar (bağlantılar taranmaya devam eder, kazanımlar keşfedilir).
3. **Eski konu ağaçlarının 37'sini (616 adres) `noindex, follow` yap ve site haritasından çıkar.** Sayfalar açık kalır (onlara
   bağlı eski hazırlıklar çalışmaya devam eder); program sayfasına "Bu ağacın güncel hâli: …" bağlantısı eklenir.
   `kpss-2026-tree-guncel` kalır. Kanonik etiketi önerilmez: içerik aynı değil.
4. **Site haritasını bölümlere ayır** (`sitemap.xml` bir dizin olur: tanıtım, müfredat programları ve üniteler, kazanımlar);
   Search Console her bölümün dizine eklenme oranını ayrı gösterir.
5. Uygulandıktan 2-4 hafta sonra Search Console'da "Sayfa sayısı" raporundan ünite ve kazanım bölümlerinin dizine eklenme
   oranına bak.

Öneri 3 tek başına site haritasını 5.236'dan **4.620** adrese indirir (2A ile aynı kalır); 2B ve 3 birlikte **3.931** adrese.

## Uygulanan (27 Kasım 2026, ürün sahibinin kararı)

Öneri 2 (zenginleştirme) ve öneri 3 uygulandı; öneri 4 (bölümlü site haritası) yapılmadı.

- **Ünite sayfaları** havuzdaki doğrulanmış ünite dersinden okur (model çağrısı yok): genel bakış, her kazanımın bölüm
  başlığı + anlatımın ilk cümlesi + ilk iki kilit noktası (ünitede 1-2 kazanım varsa dört), en çok 8 kavram ve ünite özeti
  (`src/lib/curriculum/unit-preview.ts`). Havuzda bu ünitenin güncel dersi **gerçekten yoksa** (satır yok, kazanımlar
  değişmiş, genel bakış boş) sayfa `noindex, follow`; okuma düşerse ya da 3,5 sn'yi aşarsa sayfa eski hâliyle açılır ve
  dizinde kalır (geçici hata bir gün önbellekte kalacak bir noindex'e dönmesin). Yerel ölçüm (canlı havuz, yalnız okuma,
  rastgele 40 ünite): ortanca 483 kelime (önce 53), %10'luk dilim 274, en kısası 146 (tek kazanımlı ünite); 40'ının 40'ında
  havuz özeti var, hiçbiri noindex olmadı.
- **Eski konu ağaçları:** derin eşi olan 37 `*-2026-tree-*` programının program, ünite ve kazanım sayfaları açık (200),
  `noindex, follow`, kanonik adresi kendisi ve "güncel hâli" bağlantısı derin programa; site haritasında ve `/llms-full.txt`'de
  yok (616 adres). `kpss-2026-tree-guncel` değişmedi. Kural tek yerde: `supersededBy` (`src/lib/curriculum/seo.ts`); yeni
  kurulum ekranı aynı kuralla eski ağacı zaten göstermiyordu (`official-curriculum-panel.tsx`).
- `/mufredat` dizini eski ağaç kartlarını hâlâ listeliyor (aynı adla iki kart); kaldırmak ayrı karar.

## Ham veri

Tarama ve ölçüm betikleri oturumun geçici klasöründe kaldı (depoya alınmadı); yeniden ölçmek için aynı yöntem: site haritası
→ `/mufredat` adresleri → `<main>` metni → şablon satırı ayıklama → SimHash.

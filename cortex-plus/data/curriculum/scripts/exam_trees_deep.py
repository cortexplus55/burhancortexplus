"""
Derinleştirilmiş KPSS / ALES / DGS / YDS / TUS / DUS konu ağaçları (2 Kasım 2026) -> registry.json (yalnız ekleme).

Yeni program kimlikleri `{sınav}-2026-deep-{ders}`; `*-2026-tree-*` programları ve onlara bağlı hazırlıklar
aynen kalır (kazanım kimlikleri kaymaz). Kurulum (src/lib/curriculum/exam-trees.ts) yeni ağaçları gösterir.
Etiketler dürüsttür: ÖSYM bu sınavlar için konu listesi yayımlamaz.
Kullanım: python3 exam_trees_deep.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
REG = ROOT / "src/lib/curriculum/registry.json"
MEB_LABEL = "Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir"
YDS_LABEL = "Soru türleri ÖSYM kılavuzundandır; alt başlıklar resmî ÖSYM listesi değildir"
MED_LABEL = "Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir"
CORE_KLINIK = "Öğretilecek çekirdek: patofizyoloji, en sık neden, altın standart tanı, ilk seçenek tedavi, ayırıcı tanı ve sık komplikasyonlar"
CORE_TEMEL = "Öğretilecek çekirdek: yapı ve mekanizma (patofizyolojiye temel), klinik bağlantı ve en sık ilişkili tablo, tanıda altın standart test, ilk seçenek tedavi ve ayırıcı tanı (uygun olduğunda)"
CORE_KPSS = "KPSS düzeyi: kronoloji ya da karşılaştırma, kritik tarih/sayı/ilkler ve sık karıştırılan bilgiler; uydurma oran yazılmaz"
CORE_AKIL = "ALES/DGS düzeyi: kural özeti, uzun yol ve kısa yol, tablo/şema kurma, süreli soru çözümü"
CORE_YDS = "YDS düzeyi: sinyal kelimeler ve eşdizimler, şık eleme tekniği, akademik eş anlamlılar; açıklamalar Türkçe"

T = []
def add(kind, suffix, prefix, subject, test, sources, label, core, spec):
    units = []
    for line in spec.strip().splitlines():
        title, subs = line.split(":", 1)
        units.append((title.strip(), [s.strip() for s in subs.split(";") if s.strip()]))
    T.append((kind, suffix, prefix, subject, test, sources, label, core, units))

KPSS = ["osym_kpss_2026", "meb_yks_2026"]
add("kpss", "turkce", "KT", "Türkçe (Genel Yetenek · Sözel)", "Genel Yetenek", KPSS, MEB_LABEL, CORE_KPSS, """
Sözcükte Anlam: Gerçek, mecaz, terim ve yan anlam; Eş, zıt, yakın ve sesteş sözcükler; Deyimler ve atasözlerinin anlamı; Söz sanatları ve anlatım özellikleri bildiren sözcükler
Cümlede Anlam: Cümle yorumu ve kesin yargıya ulaşma; Neden-sonuç, amaç-sonuç ve koşul-sonuç ilişkisi; Öznel ve nesnel yargı, tanım ve karşılaştırma cümleleri; Örtülü anlam ve önyargı-varsayım
Paragrafta Anlam: Ana düşünce ve konu; Yardımcı düşünceler ve paragrafta değinilmeyen; Paragrafın yapısı: giriş, gelişme, sonuç; Anlatım biçimleri ve düşünceyi geliştirme yolları
Paragraf Akışı: Paragraf tamamlama; Akışı bozan cümle; Cümle sıralama ve paragrafı ikiye bölme; Metin karşılaştırma ve çıkarım
Ses Bilgisi ve Yazım: Ünlü ve ünsüz uyumları, ses olayları; Büyük harflerin kullanımı; Birleşik ve ayrı yazılan sözcükler (de, ki, mi); Sayıların, kısaltmaların ve tarihlerin yazımı
Noktalama: Nokta, virgül ve noktalı virgül; İki nokta, üç nokta ve soru işareti; Tırnak, kesme ve kısa çizgi; Noktalama sorularında öncül çözümü
Dil Bilgisi: Sözcük türleri (isim, sıfat, zamir, zarf, edat, bağlaç, ünlem); Fiil, fiilimsi ve ek fiil; Sözcükte yapı: kök, gövde, yapım ve çekim ekleri; Cümlenin ögeleri ve cümle türleri
Anlatım Bozuklukları ve Sözel Mantık: Anlamsal anlatım bozuklukları; Yapısal anlatım bozuklukları; Sıralama ve yerleştirme soruları; Koşullu çıkarım ve tablo yorumlama
""")
add("kpss", "matematik", "KM", "Matematik (Genel Yetenek · Sayısal)", "Genel Yetenek", KPSS, MEB_LABEL, CORE_KPSS, """
Temel Kavramlar: Sayı kümeleri ve tek-çift, pozitif-negatif kuralları; Ardışık sayılar ve terim sayısı; Basamak analizi ve sayı çözümleme; Asal sayılar ve asal çarpanlara ayırma
Bölünebilme, EBOB ve EKOK: Bölme ve kalan bağıntısı; Bölünebilme kuralları; EBOB ve EKOK uygulamaları; Bölen sayısı ve faktöriyel
Rasyonel Sayılar ve Oran-Orantı: Rasyonel ve ondalık sayılarda işlemler; Sıralama ve kesir karşılaştırma; Doğru ve ters orantı; Bileşik orantı
Üslü, Köklü ve Çarpanlara Ayırma: Üslü ifadelerin kuralları; Köklü ifadeler ve paydayı rasyonelleştirme; Özdeşlikler ve çarpanlara ayırma; Sadeleştirme soruları
Denklemler ve Eşitsizlikler: Birinci dereceden denklemler; Eşitsizlikler ve aralıklar; Mutlak değerli denklem ve eşitsizlikler; Denklem kurma
Sayı, Kesir ve Yaş Problemleri: Sayı problemleri; Kesir problemleri; Yaş problemleri; Havuz ve işçi problemleri
Yüzde, Faiz ve Karışım Problemleri: Yüzde problemleri; Kâr-zarar problemleri; Basit faiz; Karışım problemleri
Hareket ve Grafik Problemleri: Hareket problemleri (zıt yön, aynı yön, ortalama hız); Tablo ve grafik yorumlama; Rutin olmayan problemler; Saat ve takvim problemleri
Kümeler, Fonksiyonlar ve İşlem: Kümeler ve kesişim-birleşim problemleri; Fonksiyon kavramı ve bileşke; İşlem ve modüler aritmetik; Sayısal mantık ve örüntüler
Sayma, Olasılık ve Geometri: Permütasyon ve kombinasyon; Olasılık; Üçgenlerde açı, alan ve benzerlik; Dörtgenler, çember ve katı cisimler
""")
add("kpss", "tarih", "KTR", "Tarih (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, CORE_KPSS, """
İslamiyet Öncesi Türk Tarihi: Asya Hun ve Kök Türk devletleri; Uygurlar ve yerleşik hayata geçiş; Kurultay, kut ve töre anlayışı; İlk Türk devletlerinde ekonomi ve kültür
İlk Türk-İslam Devletleri: Karahanlılar ve Gazneliler; Büyük Selçuklu Devleti ve Dandanakan, Malazgirt; İlk Türk-İslam eserleri; İkta sistemi ve devlet teşkilatı
Türkiye Selçuklu Devleti ve Beylikler: Anadolu'da ilk Türk beylikleri; Türkiye Selçuklu siyasi tarihi (Miryokefalon, Kösedağ); Selçuklu kültür ve medeniyeti; İkinci beylikler dönemi
Osmanlı Kuruluş ve Yükselme: Kuruluş dönemi padişahları ve fetihler; İstanbul'un fethi ve sonuçları; Yükselme dönemi seferleri; Osmanlı'nın Akdeniz hâkimiyeti
Osmanlı Duraklama, Gerileme ve Dağılma: Duraklama dönemi isyanları ve ıslahatlar; Gerileme dönemi antlaşmaları (Karlofça, Küçük Kaynarca); Dağılma dönemi ve Tanzimat, Islahat Fermanı; Meşrutiyet dönemleri
Osmanlı Kültür ve Medeniyeti: Merkez ve taşra teşkilatı; Divan-ı Hümayun ve ordu; Tımar sistemi ve toprak yönetimi; Eğitim, hukuk ve ekonomi
XX. Yüzyıl Başı ve Birinci Dünya Savaşı: Trablusgarp ve Balkan savaşları; Birinci Dünya Savaşı'nda Osmanlı cepheleri; Mondros Ateşkes Antlaşması; Paris Konferansı ve Sevr
Millî Mücadele Hazırlık Dönemi: İşgaller ve cemiyetler; Mustafa Kemal'in Samsun'a çıkışı ve genelgeler; Erzurum ve Sivas kongreleri; Misak-ı Millî ve TBMM'nin açılışı
Kurtuluş Savaşı Cepheleri ve Lozan: Doğu ve güney cepheleri; Batı Cephesi muharebeleri; Mudanya Ateşkes Antlaşması; Lozan Barış Antlaşması
Atatürk İnkılapları: Siyasi alanda inkılaplar; Hukuk alanında inkılaplar; Eğitim ve kültür alanında inkılaplar; Toplumsal yaşam ve ekonomi alanında inkılaplar
Atatürk İlkeleri ve Dönemi İç-Dış Politika: Atatürk ilkeleri; Çok partili hayata geçiş denemeleri ve isyanlar; Atatürk dönemi dış politika (Musul, Boğazlar, Hatay); Balkan ve Sadabat paktları
Çağdaş Türk ve Dünya Tarihi: İkinci Dünya Savaşı ve Türkiye; Soğuk Savaş dönemi ve ittifaklar; Yumuşama dönemi ve Türkiye; Küreselleşen dünya ve Türkiye
""")
add("kpss", "cografya", "KCO", "Türkiye Coğrafyası (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, CORE_KPSS, """
Coğrafi Konum: Matematik konum ve sonuçları; Özel konum ve sonuçları; Türkiye'nin sınırları ve komşuları; Yerel saat farkları
Yer Şekilleri: Türkiye'nin jeolojik oluşumu; Dağlar, platolar ve ovalar; Kıyı tipleri ve kıyı şekilleri; Fay hatları ve depremler
İklim ve Bitki Örtüsü: Türkiye'de iklim elemanları; İklim tipleri; Doğal bitki örtüsü; Toprak tipleri ve erozyon
Su Kaynakları: Akarsular ve havzaları; Göller ve oluşumlarına göre türleri; Yer altı suları ve kaynaklar; Barajlar ve su yönetimi
Nüfus ve Yerleşme: Nüfus sayımları ve nüfusun gelişimi; Nüfusun dağılışı ve etkileyen faktörler; Göçler; Yerleşme tipleri
Tarım ve Hayvancılık: Tarım ürünleri ve yetiştirme koşulları; Sanayi bitkileri; Hayvancılık türleri ve bölgeleri; Ormancılık ve balıkçılık
Madenler, Enerji ve Sanayi: Maden kaynakları ve çıkarıldığı yerler; Enerji kaynakları; Sanayi kolları ve sanayi bölgeleri; Yenilenebilir enerji
Ulaşım, Ticaret, Turizm ve Bölgeler: Ulaşım ağları; Dış ticaret ve limanlar; Turizm bölgeleri ve doğal-kültürel miras; Coğrafi bölgeler ve bölgesel kalkınma projeleri
""")
add("kpss", "vatandaslik", "KV", "Vatandaşlık (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, CORE_KPSS, """
Hukukun Temel Kavramları: Sosyal düzen kuralları ve hukuk kuralının özellikleri; Yaptırım türleri; Hukukun kaynakları; Hukukun dalları
Kişiler ve Haklar: Gerçek ve tüzel kişiler; Hak ve fiil ehliyeti; Hakların kazanılması ve kaybedilmesi; Yerleşim yeri ve hısımlık
Anayasal Gelişmeler: Sened-i İttifak, Tanzimat ve Islahat Fermanları; 1876 Kanun-ı Esasi ve meşrutiyet; 1921, 1924 ve 1961 anayasaları; 1982 Anayasası ve değişiklikler
1982 Anayasası Temel İlkeler: Başlangıç ilkeleri ve değiştirilemez maddeler; Devletin temel nitelikleri; Anayasanın üstünlüğü ve bağlayıcılığı; Anayasa değişikliği usulü
Temel Hak ve Ödevler: Kişinin hakları ve ödevleri; Sosyal ve ekonomik haklar; Siyasi haklar ve ödevler; Hakların sınırlanması ve olağanüstü hâl
Yasama: TBMM'nin oluşumu, seçimler ve milletvekilliği; TBMM'nin görev ve yetkileri; Kanun yapım süreci; Denetim yolları
Yürütme: Cumhurbaşkanının seçimi ve görevleri; Cumhurbaşkanlığı kararnamesi; Cumhurbaşkanı yardımcıları ve bakanlar; Olağanüstü hâl yönetimi
Yargı ve İdare: Yargı bağımsızlığı ve HSK; Yüksek mahkemeler ve Anayasa Mahkemesi; Merkezî ve yerinden yönetim; Kamu görevlileri ve idari yargı
""")

# ALES ve DGS ayrı programlardır (puan türü ve aday kitlesi farklı); alt başlıklar MEB ortaöğretim müfredatıdır.
SAY = """
Sayı Kümeleri ve Basamak: Sayı kümeleri ve tek-çift kuralları; Basamak analizi; Ardışık sayılar; Asal çarpanlar
Bölünebilme, EBOB ve EKOK: Bölme-kalan bağıntısı; Bölünebilme kuralları; EBOB-EKOK problemleri; Bölen sayısı
Rasyonel Sayılar ve Oran-Orantı: Rasyonel sayılarda işlem; Sıralama ve karşılaştırma; Doğru-ters orantı; Bileşik orantı
Üslü-Köklü İfadeler ve Çarpanlara Ayırma: Üslü ifadeler; Köklü ifadeler; Özdeşlikler; Sadeleştirme
Denklemler, Eşitsizlik ve Mutlak Değer: Birinci dereceden denklemler; Eşitsizlikler; Mutlak değer; Denklem kurma
Sayı, Kesir ve Yaş Problemleri: Sayı problemleri; Kesir problemleri; Yaş problemleri; İşçi ve havuz problemleri
Yüzde, Karışım ve Hareket Problemleri: Yüzde ve kâr-zarar; Karışım; Hareket; Faiz
Sayısal Mantık ve Grafik Yorumlama: Sayısal akıl yürütme ve örüntüler; Tablo ve grafik yorumlama; Şekil-sayı ilişkisi; Sembolik işlem soruları
Sayma ve Olasılık: Permütasyon; Kombinasyon; Olasılık; Kümeler problemleri
Geometri: Üçgende açı ve alan; Dörtgenler; Çember ve daire; Katı cisimler ve analitik geometri temelleri
"""
SOZ = """
Sözcükte Anlam: Gerçek, mecaz ve terim anlam; Eş, zıt ve yakın anlam; Deyim ve kalıp ifadeler; Bağlamda sözcük seçimi
Cümlede Anlam: Cümle yorumu; Anlam ilişkileri; Öznel-nesnel yargı; Örtülü anlam ve varsayım
Paragrafta Ana Düşünce: Ana düşünce ve konu; Yardımcı düşünceler; Paragrafta değinilmeyen; Yazarın amacı ve tutumu
Paragraf Yapısı: Paragraf tamamlama; Akışı bozan cümle; Cümle sıralama; Paragrafı ikiye bölme
Metin Yorumu ve Çıkarım: Metinden çıkarılabilecek yargı; Güçlendiren ve zayıflatan ifade; Karşılaştırmalı metinler; Uzun metin soruları
Dil Bilgisi ve Anlatım Bozuklukları: Sözcük türleri; Cümlenin ögeleri; Anlamsal anlatım bozuklukları; Yapısal anlatım bozuklukları
Sözel Akıl Yürütme: Sıralama soruları; Yerleştirme ve eşleştirme; Koşullu çıkarım; Gruplama soruları
Tablo ve Şema Soruları: Tablo kurma adımları; Kesin-olası ayrımı; Ek bilgiyle yeniden kurma; Süre yönetimi ve soru seçimi
"""
add("ales", "sayisal", "AS", "Sayısal", "Sayısal", ["osym_ales_2026", "meb_yks_2026"], MEB_LABEL, CORE_AKIL, SAY)
add("ales", "sozel", "AZ", "Sözel", "Sözel", ["osym_ales_2026", "meb_yks_2026"], MEB_LABEL, CORE_AKIL, SOZ)
add("dgs", "sayisal", "DS", "Sayısal", "Sayısal", ["osym_dgs_2026", "meb_yks_2026"], MEB_LABEL, CORE_AKIL, SAY)
add("dgs", "sozel", "DZ", "Sözel", "Sözel", ["osym_dgs_2026", "meb_yks_2026"], MEB_LABEL, CORE_AKIL, SOZ)

add("yds", "yabanci-dil", "Y", "Yabancı Dil", "Yabancı Dil", ["osym_yds_2026"], YDS_LABEL, CORE_YDS, """
Sözcük Bilgisi — İsim ve Fiil: Akademik isimler; Akademik fiiller; Bağlamda anlam çıkarma; Eş anlamlı akademik sözcükler
Sözcük Bilgisi — Sıfat, Zarf ve Kalıplar: Akademik sıfatlar; Zarflar ve derece ifadeleri; Phrasal verb kalıpları; Edat kalıpları ve eşdizimler
Zamanlar ve Zaman Uyumu: Present ve past zamanlar; Perfect zamanlar; Future ifadeleri; Zaman uyumu ipuçları
Kipler, Edilgen ve Koşul Cümleleri: Modal fiiller; Edilgen yapı; Koşul cümleleri; Wish ve unreal yapılar
Bağlaçlar ve Geçiş İfadeleri: Zıtlık bağlaçları; Neden-sonuç bağlaçları; Ekleme ve örnekleme ifadeleri; Zaman ve koşul bağlaçları
Yan Cümleler ve İsim-Fiiller: Relative clause; Noun clause; Gerund ve infinitive; Kısaltılmış yan cümleler
Cloze Test: Paragrafta sözcük boşluğu; Paragrafta dil bilgisi boşluğu; Bağlaç boşluğu; Eleme ve bağlam ipuçları
Cümle Tamamlama: Bağlaç-anlam uyumu; Zaman uyumu; Yan cümle tamamlama; Karşıtlık ve neden-sonuç tamamlama
Çeviri: İngilizceden Türkçeye çeviri; Türkçeden İngilizceye çeviri; Özne-yüklem eşleştirme; Bağlaç ve zaman eşlemesi
Okuduğunu Anlama: Ana fikir soruları; Detay ve çıkarım soruları; Referans ve kelime soruları; Yazarın tutumu ve amaç
Paragraf Soruları: Paragraf tamamlama; Akışı bozan cümle; Anlamca en yakın cümle; Diyalog tamamlama
Süre ve Sınav Stratejisi: Soru türüne göre süre planı; Okuma stratejileri (skimming, scanning); Şık eleme stratejileri; Yanlış çeldirici türleri
""")

TUS = ["osym_tus_2026", "yok_ucep_2020"]
TUS_SPEC = [
("anatomi", "AN", "Anatomi", "Temel Tıp Bilimleri", CORE_TEMEL, """
Üst Ekstremite: Pleksus brakiyalis ve dalları; Omuz ve kol kasları, rotator manşet; Ön kol ve el kasları, karpal tünel; Üst ekstremite sinir yaralanmaları (radial, ulnar, median)
Alt Ekstremite: Pleksus lumbosakralis ve dalları; Kalça ve uyluk kasları, femoral üçgen; Bacak ve ayak kasları, tarsal tünel; Alt ekstremite sinir yaralanmaları (femoral, siyatik, peroneal)
Baş ve Boyun: Kafatası delikleri ve geçen yapılar; Boyun üçgenleri ve tiroid bölgesi; Yüz kasları ve parotis bölgesi; Larinks ve farinks
Kraniyal Sinirler: Göz hareketlerini yöneten sinirler (III, IV, VI); Trigeminal ve fasiyal sinir; Glossofaringeal, vagus ve aksesuar sinir; Kraniyal sinir lezyon bulguları
Nöroanatomi: Beyin lobları ve fonksiyonel alanlar; Beyin sapı ve serebellum; Omurilik yolları (kortikospinal, spinotalamik, dorsal kolon); Beyin damarları ve Willis poligonu
Toraks: Kalbin yüzleri, odacıkları ve kapakları; Koroner arterler ve iletim sistemi; Akciğer segmentleri ve plevra; Mediasten bölümleri
Abdomen: Ön karın duvarı ve inguinal kanal; Peritoneal boşluk ve periton yapıları; Mide, karaciğer, safra yolları ve pankreas; Portal ven ve portokaval anastomozlar
Pelvis ve Perine: Pelvis kemikleri ve tabanı; Mesane, üreter ve prostat; Uterus, over ve bağlar; Perine ve pudendal sinir
""" ),
("histoloji", "HI", "Histoloji ve Embriyoloji", "Temel Tıp Bilimleri", CORE_TEMEL, """
Hücre: Hücre zarı ve taşıma; Organeller ve hücre iskeleti; Hücre bağlantıları; Hücre döngüsü ve apoptoz
Epitel ve Bağ Dokusu: Epitel türleri ve bezler; Bağ dokusu hücreleri ve lifleri; Kıkırdak dokusu; Kemik dokusu ve kemikleşme
Kas, Sinir ve Kan: Kas dokusu türleri ve kasılma birimi; Sinir dokusu ve glia hücreleri; Kan hücreleri ve hematopoez; Lenfoid organlar
Dolaşım, Solunum ve Deri: Damar duvarı katmanları; Solunum yolu epiteli ve alveol; Deri katmanları ve ekleri; Meme bezi
Sindirim Sistemi Histolojisi: Ağız boşluğu, dil ve diş histolojisi; Mide ve bağırsak duvarı; Karaciğer lobülü ve safra kesesi; Pankreas ekzokrin ve endokrin bölümü
Üriner, Endokrin ve Üreme Histolojisi: Nefron histolojisi; Hipofiz, tiroid ve böbrek üstü bezi; Testis ve spermatogenez; Over, oogenez ve uterus döngüsü
Erken Embriyoloji: Gametogenez ve fertilizasyon; İlk iki hafta: implantasyon ve bilaminer disk; Gastrulasyon ve germ katmanları; Nörülasyon ve somitler
Organogenez ve Anomaliler: Kalp gelişimi ve konjenital kalp anomalileri; Faringeal arklar ve türevleri; Gastrointestinal ve ürogenital gelişim; Teratojenler ve kritik dönemler
""" ),
("fizyoloji", "FZ", "Fizyoloji", "Temel Tıp Bilimleri", CORE_TEMEL, """
Hücre Fizyolojisi: Membran taşıma mekanizmaları; Dinlenim membran potansiyeli; Aksiyon potansiyeli ve iletim; Sinaps ve nöromüsküler kavşak
Kas Fizyolojisi: İskelet kası kasılma mekanizması; Düz kas kasılması; Kas tipleri ve motor ünite; Kalp kası özellikleri
Sinir Sistemi Fizyolojisi: Duyu reseptörleri ve ağrı yolları; Motor kontrol, bazal ganglionlar ve serebellum; Otonom sinir sistemi; Uyku, öğrenme ve hipotalamus
Kardiyovasküler Fizyoloji: Kalp döngüsü ve kalp sesleri; Kalp debisi ve Frank-Starling yasası; Kan basıncı düzenlenmesi; Mikrodolaşım ve Starling kuvvetleri
Solunum Fizyolojisi: Akciğer hacim ve kapasiteleri; Gaz değişimi ve ventilasyon-perfüzyon; Oksijen ve karbondioksit taşınması; Solunumun düzenlenmesi
Böbrek Fizyolojisi: Glomerüler filtrasyon ve klirens; Tübüler geri emilim ve salgı; İdrar konsantrasyonu ve ADH; Asit-baz dengesi
Sindirim Fizyolojisi: Gastrointestinal hormonlar; Mide asidi salgısı ve düzenlenmesi; Sindirim ve emilim; Gastrointestinal motilite
Endokrin ve Üreme Fizyolojisi: Hipotalamus-hipofiz ekseni; Tiroid ve böbrek üstü hormonları; Kalsiyum metabolizması ve insülin-glukagon; Üreme hormonları ve menstrüel döngü
""" ),
("biyokimya", "BK", "Tıbbi Biyokimya", "Temel Tıp Bilimleri", CORE_TEMEL, """
Proteinler ve Enzimler: Aminoasitler ve protein yapısı; Hemoglobin ve miyoglobin; Enzim kinetiği ve inhibisyon; Klinik tanıda enzimler
Karbonhidrat Metabolizması: Glikoliz ve düzenlenmesi; Glukoneogenez ve glikojen metabolizması; Pentoz fosfat yolu ve G6PD eksikliği; Glikojen depo hastalıkları
Enerji Metabolizması: Sitrik asit döngüsü; Elektron taşıma zinciri ve oksidatif fosforilasyon; İnhibitörler ve ayrıştırıcılar; Mitokondriyal hastalıklar
Lipid Metabolizması: Yağ asidi sentezi ve yıkımı; Keton cisimleri; Kolesterol sentezi ve lipoproteinler; Dislipidemiler ve sfingolipidozlar
Aminoasit ve Nükleotid Metabolizması: Üre döngüsü ve hiperamonyemi; Aminoasit metabolizma bozuklukları (fenilketonüri, alkaptonüri); Pürin ve pirimidin metabolizması; Gut ve Lesch-Nyhan sendromu
Vitaminler ve Mineraller: Suda çözünen vitaminler ve eksiklikleri; Yağda çözünen vitaminler; Demir metabolizması; Eser elementler
Moleküler Biyoloji: DNA replikasyonu ve onarımı; Transkripsiyon ve translasyon; Gen ifadesinin düzenlenmesi; Moleküler tanı yöntemleri (PCR, blotlama)
Hormon Biyokimyası ve Klinik Biyokimya: Hormon reseptörleri ve sinyal iletimi; Hem sentezi ve porfiriler; Bilirubin metabolizması ve sarılık; Karaciğer ve böbrek fonksiyon testleri
""" ),
("mikrobiyoloji", "MB", "Tıbbi Mikrobiyoloji", "Temel Tıp Bilimleri", CORE_TEMEL, """
Genel Bakteriyoloji ve Sterilizasyon: Bakteri yapısı ve virülans faktörleri; Bakteri genetiği ve direnç mekanizmaları; Sterilizasyon ve dezenfeksiyon; Boyama ve kültür yöntemleri
İmmünoloji: Doğal ve kazanılmış bağışıklık; Antikor yapısı ve kompleman; Aşırı duyarlılık reaksiyonları; İmmün yetmezlikler ve transplantasyon immünolojisi
Gram Pozitif Bakteriler: Stafilokoklar; Streptokoklar ve enterokoklar; Korinebakteriler ve Listeria; Klostridyumlar ve Bacillus
Gram Negatif Bakteriler: Neisseria türleri; Enterobakteriler; Pseudomonas ve Acinetobacter; Haemophilus, Bordetella, Brucella ve Legionella
Özel Bakteriler: Mikobakteriler; Spiroketler (Treponema, Borrelia, Leptospira); Klamidya, Riketsiya ve Mikoplazma; Helicobacter ve Campylobacter
DNA Virüsleri: Herpes virüsleri; Hepatit B virüsü; Papilloma ve polyoma virüsleri; Adenovirüs ve poksvirüsler
RNA Virüsleri: Hepatit A, C, D ve E virüsleri; HIV ve retrovirüsler; İnfluenza, paramiksovirüsler ve koronavirüsler; Enterovirüsler, rotavirüs ve kuduz virüsü
Mantarlar ve Parazitler: Yüzeyel ve sistemik mantar enfeksiyonları; Fırsatçı mantarlar (Candida, Aspergillus, Pneumocystis); Protozoonlar (Plasmodium, Leishmania, Toxoplasma); Helmintler
""" ),
("patoloji", "PT", "Tıbbi Patoloji", "Temel Tıp Bilimleri", CORE_TEMEL, """
Hücre Hasarı ve İnflamasyon: Hücre zedelenmesi ve nekroz türleri; Apoptoz ve adaptasyonlar; Akut inflamasyon ve medyatörler; Kronik ve granülomatöz inflamasyon
Hemodinami ve Neoplazi: Ödem, tromboz ve emboli; Şok ve infarktüs; Neoplazinin genel özellikleri; Onkogenler, tümör baskılayıcı genler ve tümör belirteçleri
Kardiyovasküler ve Solunum Patolojisi: Ateroskleroz ve vaskülitler; İskemik kalp hastalığı ve kardiyomiyopatiler; Pnömoniler ve tüberküloz patolojisi; Akciğer tümörleri
Gastrointestinal ve Hepatobiliyer Patoloji: Özofagus ve mide hastalıkları; İnflamatuvar bağırsak hastalıkları ve kolorektal tümörler; Hepatitler ve siroz; Pankreas ve safra yolu tümörleri
Böbrek ve Üriner Patoloji: Nefrotik ve nefritik sendromlar; Tübülointerstisyel hastalıklar; Böbrek tümörleri; Mesane ve prostat patolojisi
Hematopatoloji: Anemilerin patolojisi; Lösemiler; Lenfomalar; Plazma hücre neoplazileri
Endokrin, Meme ve Genital Patoloji: Tiroid hastalıkları ve tümörleri; Böbrek üstü ve hipofiz patolojisi; Meme tümörleri; Over, uterus ve testis tümörleri
Sinir Sistemi, Kemik ve Deri Patolojisi: Merkezi sinir sistemi tümörleri; Nörodejeneratif hastalıklar; Kemik ve yumuşak doku tümörleri; Deri tümörleri ve melanom
""" ),
("farmakoloji", "FA", "Tıbbi Farmakoloji", "Temel Tıp Bilimleri", CORE_TEMEL, """
Genel Farmakoloji: Farmakokinetik (emilim, dağılım, metabolizma, atılım); Farmakodinamik ve reseptörler; İlaç etkileşimleri ve sitokrom P450; Zehirlenmeler ve antidotlar
Otonom Sinir Sistemi İlaçları: Kolinerjik ilaçlar ve antikolinesterazlar; Antimuskarinik ilaçlar; Adrenerjik agonistler; Alfa ve beta blokerler
Kardiyovasküler İlaçlar: Antihipertansifler; Kalp yetmezliği ilaçları; Antiaritmikler; Antianjinal ilaçlar ve lipid düşürücüler
Kan ve Böbrek İlaçları: Antikoagülanlar; Antiagreganlar ve trombolitikler; Diüretikler; Anemi tedavisinde kullanılan ilaçlar
Santral Sinir Sistemi İlaçları: Sedatif-hipnotikler ve anksiyolitikler; Antiepileptikler; Antidepresanlar ve antipsikotikler; Opioidler ve genel anestezikler
Otakoidler, Solunum ve Sindirim İlaçları: NSAİİ ve parasetamol; Antihistaminikler ve astım ilaçları; Peptik ülser ilaçları; Antiemetikler ve laksatifler
Endokrin İlaçlar: İnsülin ve oral antidiyabetikler; Kortikosteroidler; Tiroid ve antitiroid ilaçlar; Seks hormonları ve osteoporoz ilaçları
Kemoterapötikler: Beta-laktam antibiyotikler; Protein sentezi inhibitörleri ve kinolonlar; Antitüberküloz, antiviral ve antifungal ilaçlar; Antineoplastik ilaçlar ve immünsüpresifler
""" ),
("dahiliye", "DA", "Dâhiliye", "Klinik Tıp Bilimleri", CORE_KLINIK, """
Kardiyoloji: Akut koroner sendromlar; Kalp yetmezliği; Hipertansiyon; Aritmiler ve atriyal fibrilasyon; Kapak hastalıkları ve infektif endokardit
Göğüs Hastalıkları: Astım ve KOAH; Pnömoniler; Pulmoner emboli; Akciğer kanseri; Sarkoidoz ve interstisyel akciğer hastalıkları
Gastroenteroloji ve Hepatoloji: Gastroözofageal reflü ve peptik ülser; Gastrointestinal kanama; İnflamatuvar bağırsak hastalıkları; Viral hepatitler; Siroz ve komplikasyonları
Nefroloji: Akut böbrek hasarı; Kronik böbrek hastalığı; Glomerülonefritler; Sıvı-elektrolit bozuklukları; Asit-baz bozuklukları
Endokrinoloji: Diabetes mellitus ve akut komplikasyonları; Tiroid hastalıkları; Böbrek üstü hastalıkları (Cushing, Addison, feokromositoma); Hipofiz hastalıkları; Kalsiyum metabolizması bozuklukları
Hematoloji: Demir eksikliği ve megaloblastik anemi; Hemolitik anemiler; Akut ve kronik lösemiler; Lenfomalar ve multipl miyelom; Kanama ve pıhtılaşma bozuklukları
Romatoloji: Romatoid artrit; Sistemik lupus eritematozus; Spondiloartropatiler; Vaskülitler; Gut ve kristal artropatiler
Enfeksiyon Hastalıkları ve Onkoloji: Sepsis ve septik şok; Menenjit ve ensefalit; HIV ve fırsatçı enfeksiyonlar; Tüberküloz; Onkolojik aciller
""" ),
("pediatri", "PE", "Pediatri", "Klinik Tıp Bilimleri", CORE_KLINIK, """
Büyüme-Gelişme ve Beslenme: Büyüme ve gelişme basamakları; Anne sütü ve beslenme; Malnütrisyon ve raşitizm; Aşılama takvimi
Yenidoğan: Yenidoğan sarılığı; Respiratuvar distres sendromu; Neonatal sepsis; Nekrotizan enterokolit ve prematüre sorunları
Çocuk Enfeksiyonları: Döküntülü hastalıklar; Menenjit ve febril nöbet; Üst ve alt solunum yolu enfeksiyonları; Akut gastroenterit ve dehidratasyon
Çocuk Kardiyoloji: Asiyanotik konjenital kalp hastalıkları; Siyanotik konjenital kalp hastalıkları; Akut romatizmal ateş; Kawasaki hastalığı
Çocuk Gastroenteroloji ve Nefroloji: Çölyak hastalığı ve malabsorpsiyon; Çocukluk çağı nefrotik sendromu; Akut poststreptokokal glomerülonefrit; İdrar yolu enfeksiyonu ve vezikoüreteral reflü
Çocuk Hematoloji ve Onkoloji: Çocukluk çağı anemileri ve talasemiler; İmmün trombositopeni; Akut lenfoblastik lösemi; Wilms tümörü ve nöroblastom
Çocuk Endokrin ve Metabolizma: Konjenital hipotiroidi; Tip 1 diyabet ve diyabetik ketoasidoz; Puberte bozuklukları ve boy kısalığı; Doğumsal metabolik hastalıklar
Genetik, Nöroloji ve Acil: Kromozom anomalileri (Down, Turner, Klinefelter); Kistik fibrozis; Epilepsi ve serebral palsi; Zehirlenmeler ve çocuk acilleri
""" ),
("cerrahi", "CE", "Cerrahi", "Klinik Tıp Bilimleri", CORE_KLINIK, """
Cerrahi Temeller: Sıvı-elektrolit ve şok; Yara iyileşmesi ve cerrahi enfeksiyonlar; Travma hastasına yaklaşım (ATLS); Yanıklar
Gastrointestinal Cerrahi: Akut apandisit; İntestinal obstrüksiyon; Kolorektal kanser; Anorektal hastalıklar
Hepatobiliyer ve Pankreas Cerrahisi: Kolelitiyazis ve akut kolesistit; Tıkanma sarılığı; Akut pankreatit; Pankreas kanseri
Mide, Özofagus ve Karın Duvarı: Özofagus hastalıkları ve kanseri; Peptik ülser komplikasyonları; Mide kanseri; Fıtıklar
Meme ve Endokrin Cerrahi: Meme kanseri; Benign meme hastalıkları; Tiroid nodülü ve kanseri; Hiperparatiroidi
Üroloji: Üriner sistem taşları; Benign prostat hiperplazisi; Prostat, mesane ve böbrek kanseri; Testis torsiyonu ve tümörleri
Ortopedi ve Nöroşirürji: Kırıklar ve komplikasyonları; Kemik tümörleri; Kafa travması ve kafa içi kanamalar; Bel fıtığı ve spinal travma
Damar, Göğüs ve Kalp Cerrahisi: Periferik arter hastalığı; Aort anevrizması ve diseksiyon; Derin ven trombozu ve varisler; Pnömotoraks ve göğüs travması
""" ),
("kadin-dogum", "KD", "Kadın Hastalıkları ve Doğum", "Klinik Tıp Bilimleri", CORE_KLINIK, """
Gebelik Fizyolojisi ve Takibi: Gebelik tanısı ve fizyolojik değişiklikler; Doğum öncesi bakım ve tarama testleri; Fetal iyilik halinin değerlendirilmesi; Teratojenler ve gebelikte ilaç kullanımı
Erken Gebelik Sorunları: Düşükler; Ektopik gebelik; Gestasyonel trofoblastik hastalık; Hiperemezis gravidarum
Gebelik Komplikasyonları: Preeklampsi ve eklampsi; Gestasyonel diyabet; Plasenta previa ve dekolman plasenta; Rh uygunsuzluğu ve erken membran rüptürü
Doğum ve Lohusalık: Normal doğum eylemi ve evreleri; Anormal doğum ve sezaryen endikasyonları; Doğum sonu kanama; Lohusalık dönemi enfeksiyonları
Jinekolojik Endokrinoloji: Menstrüel döngü bozuklukları; Polikistik over sendromu; Amenore; İnfertilite ve menopoz
Jinekolojik Enfeksiyonlar ve Benign Hastalıklar: Vajinitler; Pelvik inflamatuvar hastalık; Endometriozis; Leiomyoma uteri
Jinekolojik Onkoloji: Serviks kanseri ve tarama; Endometrium kanseri; Over tümörleri; Vulva kanseri ve premalign lezyonlar
Kontrasepsiyon ve Pelvik Taban: Hormonal kontrasepsiyon; Rahim içi araç ve bariyer yöntemler; Pelvik organ prolapsusu; Üriner inkontinans
""" ),
]
for suffix, prefix, subject, test, core, spec in TUS_SPEC:
    add("tus", suffix, prefix, subject, test, TUS, MED_LABEL, core, spec)

DUS = ["osym_dus_2026", "yok_ducep_2024", "yok_ucep_2020"]
DUS_SPEC = [
("anatomi", "AN", "Anatomi", "Temel Bilimler", CORE_TEMEL, """
Kafatası ve Çene Kemikleri: Maksilla ve mandibula; Kafatası delikleri ve geçen yapılar; Temporomandibular eklem; Pterygopalatin ve infratemporal fossa
Çiğneme ve Yüz Kasları: Çiğneme kasları ve sinirleri; Mimik kasları ve fasiyal sinir; Dil kasları ve dil sinirleri; Yumuşak damak ve farinks kasları
Baş-Boyun Sinirleri: Trigeminal sinir dalları; Dental anestezide hedef sinirler; Fasiyal ve glossofaringeal sinir; Otonom gangliyonlar ve tükürük bezi innervasyonu
Baş-Boyun Damar ve Lenf: Eksternal karotis arter dalları; Baş-boyun venleri ve kavernöz sinüs; Lenf düğümleri ve drenaj; Boyun üçgenleri ve fasya boşlukları
Ağız Boşluğu ve Tükürük Bezleri: Ağız boşluğu sınırları; Parotis, submandibular ve sublingual bezler; Damak ve dişeti anatomisi; Burun ve paranazal sinüsler
Sistemik Anatomi: Toraks ve kalbin temel anatomisi; Abdomen organları; Üst ve alt ekstremite temel anatomisi; Merkezi sinir sistemi temel yapıları
""" ),
("histoloji", "HI", "Histoloji ve Embriyoloji", "Temel Bilimler", CORE_TEMEL, """
Temel Dokular: Epitel ve bağ dokusu; Kıkırdak ve kemik dokusu; Kas ve sinir dokusu; Kan ve lenfoid doku
Diş Gelişimi: Diş gelişiminin evreleri; Mine oluşumu (amelogenez); Dentin oluşumu (dentinogenez); Kök gelişimi ve Hertwig kını
Diş Dokuları: Mine yapısı; Dentin ve pulpa; Sement; Periodonsiyum
Ağız Mukozası ve Tükürük Bezi Histolojisi: Ağız mukozası tipleri; Dil papillaları; Tükürük bezi histolojisi; Dişeti ve dentogingival bileşke
Baş-Yüz Embriyolojisi: Faringeal arklar ve türevleri; Yüz ve damak gelişimi; Yarık dudak-damak oluşumu; Dil ve tiroid gelişimi
Genel Embriyoloji: Gametogenez ve fertilizasyon; Germ katmanları ve türevleri; Nöral krista türevleri; Teratojenler ve kritik dönemler
""" ),
("fizyoloji", "FZ", "Fizyoloji", "Temel Bilimler", CORE_TEMEL, """
Hücre, Sinir ve Kas: Membran taşıma ve aksiyon potansiyeli; Sinaps ve nöromüsküler kavşak; İskelet ve düz kas kasılması; Ağrı fizyolojisi ve dental ağrı
Kardiyovasküler ve Solunum: Kalp döngüsü ve kalp debisi; Kan basıncı düzenlenmesi; Akciğer hacimleri ve gaz değişimi; Solunumun düzenlenmesi
Kan Fizyolojisi: Kan hücreleri; Hemostaz ve pıhtılaşma; Kan grupları; İmmün sistemin fizyolojisi
Sindirim ve Ağız Fizyolojisi: Tükürük salgısı ve işlevleri; Çiğneme ve yutma; Tat duyusu; Mide-bağırsak salgıları
Böbrek ve Sıvı Dengesi: Glomerüler filtrasyon; Tübüler işlevler; Asit-baz dengesi; Sıvı-elektrolit dengesi
Endokrin Fizyoloji: Hipofiz ve tiroid; Böbrek üstü bezi; Kalsiyum-fosfat düzenlenmesi; İnsülin ve glukoz düzenlenmesi
""" ),
("biyokimya", "BK", "Biyokimya", "Temel Bilimler", CORE_TEMEL, """
Proteinler ve Enzimler: Aminoasitler ve protein yapısı; Kollajen sentezi ve bozuklukları; Enzim kinetiği ve inhibisyon; Klinik enzimler
Karbonhidrat ve Enerji Metabolizması: Glikoliz ve glukoneogenez; Glikojen metabolizması; Sitrik asit döngüsü ve oksidatif fosforilasyon; Pentoz fosfat yolu
Lipid ve Aminoasit Metabolizması: Yağ asidi metabolizması; Kolesterol ve lipoproteinler; Üre döngüsü; Aminoasit metabolizma bozuklukları
Vitamin ve Mineraller: Suda çözünen vitaminler; Yağda çözünen vitaminler; Kalsiyum, fosfor ve flor metabolizması; Demir ve eser elementler
Moleküler Biyokimya: DNA replikasyonu ve onarımı; Transkripsiyon ve translasyon; Nükleotid metabolizması; Moleküler tanı yöntemleri
Ağız Biyokimyası: Tükürük bileşimi; Mine ve dentinin kimyasal yapısı; Dental plak ve çürük biyokimyası; Hormon biyokimyası
""" ),
("mikrobiyoloji", "MB", "Mikrobiyoloji", "Temel Bilimler", CORE_TEMEL, """
Genel Mikrobiyoloji ve Sterilizasyon: Bakteri yapısı ve genetiği; Sterilizasyon ve dezenfeksiyon; Diş hekimliğinde enfeksiyon kontrolü; Antibiyotik direnç mekanizmaları
İmmünoloji: Doğal ve kazanılmış bağışıklık; Antikorlar ve kompleman; Aşırı duyarlılık reaksiyonları; İmmün yetmezlikler
Ağız Mikrobiyolojisi: Ağız florası; Dental plak oluşumu; Çürük etkeni mikroorganizmalar; Periodontal patojenler
Bakteriler: Stafilokok ve streptokoklar; Anaeroblar ve aktinomisetler; Mikobakteriler; Treponema ve diğer spiroketler
Virüsler: Herpes virüsleri ve ağız lezyonları; Hepatit virüsleri ve diş hekimliğinde bulaş; HIV ve ağız bulguları; Diğer viral enfeksiyonlar (kabakulak, el-ayak-ağız)
Mantarlar ve Parazitler: Kandidiyazis; Sistemik mantar enfeksiyonları; Protozoonlar; Helmintler
""" ),
("patoloji", "PT", "Patoloji", "Temel Bilimler", CORE_TEMEL, """
Genel Patoloji: Hücre zedelenmesi ve nekroz; İnflamasyon ve onarım; Hemodinamik bozukluklar; Neoplazinin genel özellikleri
Ağız Mukozası Lezyonları: Beyaz lezyonlar ve lökoplaki; Kırmızı lezyonlar ve eritroplaki; Ülseratif ve veziküler lezyonlar; Liken planus
Çene Kistleri: Odontojenik kistler; Non-odontojenik kistler; Psödokistler; Kistlerde ayırıcı tanı
Odontojenik Tümörler: Ameloblastom; Odontoma ve diğer mikst tümörler; Keratokistik lezyonlar; Mezenkimal odontojenik tümörler
Kemik ve Tükürük Bezi Patolojisi: Fibro-osseöz lezyonlar; Osteomiyelit ve osteonekroz; Tükürük bezi tümörleri; Sistemik hastalıkların ağız bulguları
Ağız Kanserleri ve Sistemik Patoloji: Skuamöz hücreli karsinom; Ağızda lenfoma ve metastazlar; Kan hastalıklarının ağız bulguları; Diş anomalileri
""" ),
("farmakoloji", "FA", "Farmakoloji", "Temel Bilimler", CORE_TEMEL, """
Genel Farmakoloji: Farmakokinetik; Farmakodinamik; İlaç etkileşimleri; Gebelikte ve çocuklarda ilaç kullanımı
Lokal Anestezikler: Etki mekanizması ve sınıflandırma; Vazokonstriktörler; Maksimum doz ve toksisite; Lokal anestezi komplikasyonları
Analjezikler ve Antiinflamatuvarlar: NSAİİ; Parasetamol; Opioid analjezikler; Kortikosteroidler
Antimikrobiyaller: Beta-laktamlar; Makrolidler, klindamisin ve metronidazol; Profilaksi ve endokardit profilaksisi; Antifungal ve antiviral ilaçlar
Sistemik Hastalıklarda İlaçlar: Antikoagülan ve antiagregan ilaçlar; Antihipertansifler ve kardiyak ilaçlar; Antidiyabetikler; Bifosfonatlar ve çene osteonekrozu
Santral Sinir Sistemi ve Acil İlaçlar: Sedasyon ve anksiyolitikler; Genel anestezikler; Diş hekimliğinde acil ilaçlar; Antiepileptikler ve ağız yan etkileri
""" ),
("biyoloji-genetik", "BG", "Biyoloji ve Genetik", "Temel Bilimler", CORE_TEMEL, """
Hücre Biyolojisi: Hücre zarı ve organeller; Hücre döngüsü ve bölünme; Apoptoz; Hücre sinyal iletimi
Kalıtım: Mendel kalıtımı; Otozomal kalıtım örüntüleri; X'e bağlı kalıtım; Mitokondriyal kalıtım
Kromozom Anomalileri: Sayısal kromozom anomalileri; Yapısal kromozom anomalileri; Down sendromunun ağız bulguları; Sitogenetik yöntemler
Moleküler Genetik: Gen yapısı ve ifadesi; Mutasyon türleri; Onkogenler ve tümör baskılayıcı genler; Moleküler tanı yöntemleri
Diş ve Kraniyofasiyal Genetik: Amelogenezis imperfekta; Dentinogenezis imperfekta; Ektodermal displazi; Yarık dudak-damak genetiği
Populasyon ve Klinik Genetik: Hardy-Weinberg dengesi; Genetik danışmanlık; Kraniyofasiyal sendromlar; Farmakogenetik
""" ),
("restoratif", "RE", "Restoratif Diş Tedavisi", "Klinik Bilimler", CORE_KLINIK, """
Diş Çürüğü: Çürük etiyolojisi ve patogenezi; Çürük tanı yöntemleri; Çürük risk değerlendirmesi; Çürük önleme ve flor
Kavite Hazırlığı: Black kavite sınıflaması; Kavite hazırlama ilkeleri; Minimal invaziv yaklaşım; Pulpa koruma ve kaide
Amalgam ve Kompozit: Amalgam özellikleri ve uygulama; Kompozit rezin bileşimi; Polimerizasyon büzülmesi; Kompozit uygulama tekniği
Adeziv Sistemler ve Cam İyonomer: Mine ve dentin bağlanması; Adeziv sistem kuşakları; Cam iyonomer simanlar; Rezin modifiye cam iyonomerler
Estetik Diş Hekimliği: Diş renklenmeleri; Beyazlatma yöntemleri; İndirekt restorasyonlar (inley, onley); Lamina veneerler
Restorasyon Başarısızlıkları ve Özel Durumlar: Sekonder çürük ve mikrosızıntı; Postoperatif hassasiyet; Servikal lezyonlar ve abfraksiyon; Restorasyon tamiri
""" ),
("protetik", "PR", "Protetik Diş Tedavisi", "Klinik Bilimler", CORE_KLINIK, """
Tam Protezler: Dişsiz ağız anatomisi; Ölçü yöntemleri; Çene ilişkileri ve dikey boyut; Tam protez sorunları
Hareketli Bölümlü Protezler: Kennedy sınıflaması; Protez bileşenleri ve kroşeler; Ana bağlayıcılar; Tasarım ilkeleri
Sabit Protezler: Kron ve köprü endikasyonları; Diş preparasyonu ilkeleri; Ölçü ve geçici restorasyonlar; Simantasyon
Dental Materyaller: Ölçü maddeleri; Dental alçılar ve mumlar; Dental alaşımlar; Dental seramikler ve zirkonya
İmplant Üstü Protezler: İmplant planlaması; Osseointegrasyon; İmplant üstü protez tipleri; İmplant komplikasyonları
Oklüzyon ve TME: Oklüzyon kavramları; Artikülatörler; Temporomandibular bozukluklar; Maksillofasiyal protezler
""" ),
("cerrahi", "CE", "Ağız, Diş ve Çene Cerrahisi", "Klinik Bilimler", CORE_KLINIK, """
Diş Çekimi ve Gömük Dişler: Çekim endikasyon ve kontrendikasyonları; Çekim teknikleri; Gömük üçüncü molarlar; Çekim komplikasyonları ve alveolit
Lokal Anestezi ve Sedasyon: Lokal anestezi teknikleri; Anestezi komplikasyonları; Sedasyon yöntemleri; Genel anestezi endikasyonları
Odontojenik Enfeksiyonlar: Enfeksiyonun yayılım yolları; Fasyal boşluk enfeksiyonları; Ludwig anjini; Antibiyotik tedavisi ve drenaj
Çene Yüz Travmaları: Mandibula kırıkları; Maksilla ve Le Fort kırıkları; Zigoma ve orbita kırıkları; Dentoalveoler travmalar
Kist, Tümör ve Preprotetik Cerrahi: Kist tedavi yöntemleri (enükleasyon, marsupyalizasyon); Benign tümörlerin cerrahisi; Preprotetik cerrahi; Dental implant cerrahisi
Tıbbi Riskli Hasta ve Acil: Antikoagülan kullanan hasta; Bifosfonata bağlı osteonekroz; Endokardit riskli hasta; Diş hekimliğinde tıbbi acil durumlar
""" ),
("radyoloji", "RA", "Ağız, Diş ve Çene Radyolojisi", "Klinik Bilimler", CORE_KLINIK, """
Radyasyon Fiziği ve Korunma: X-ışını oluşumu; Radyasyonun biyolojik etkileri; Radyasyondan korunma ilkeleri; Doz kavramları
Radyografi Teknikleri: Periapikal teknikler (paralel, açıortay); Bitewing ve okluzal radyografi; Panoramik radyografi; Konik ışınlı bilgisayarlı tomografi
Görüntü Kalitesi ve Hatalar: Görüntü kalitesini etkileyen faktörler; Teknik hatalar; Dijital radyografi; Normal radyografik anatomi
Radyolüsent Lezyonlar: Periapikal lezyonlar; Kistlerin radyografik görünümü; Multiloküler lezyonlar; Ayırıcı tanı
Radyoopak ve Mikst Lezyonlar: Radyoopak lezyonlar; Mikst lezyonlar; Fibro-osseöz lezyonların görünümü; Kalsifikasyonlar
Oral Tanı ve Sistemik Hastalıklar: Anamnez ve klinik muayene; Sistemik hastalıkların ağız bulguları; Ağız mukozası lezyonlarında tanı; TME görüntüleme
""" ),
("periodontoloji", "PD", "Periodontoloji", "Klinik Bilimler", CORE_KLINIK, """
Periodonsiyum ve Etiyoloji: Periodonsiyumun yapısı; Dental plak biyofilmi; Diştaşı ve lokal faktörler; Konak yanıtı
Periodontal Hastalık Sınıflaması: Gingivitis türleri; Periodontitis evre ve derecelendirmesi; Nekrotizan periodontal hastalıklar; Sistemik hastalıklara bağlı periodontal durumlar
Periodontal Tanı: Klinik muayene ve sondalama; Radyografik değerlendirme; Risk faktörleri (sigara, diyabet); Prognoz belirleme
Cerrahi Olmayan Tedavi: Plak kontrolü; Diştaşı temizliği ve kök yüzeyi düzleştirme; Antimikrobiyal tedavi; İdame tedavisi
Periodontal Cerrahi: Flep operasyonları; Rezektif cerrahi; Rejeneratif tedavi; Mukogingival cerrahi
Peri-implant ve Periodontal-Sistemik İlişki: Peri-implant mukozit ve peri-implantitis; Periodonsiyum ve sistemik hastalıklar; Gebelik ve periodonsiyum; Periodontal-endodontik lezyonlar
""" ),
("ortodonti", "OR", "Ortodonti", "Klinik Bilimler", CORE_KLINIK, """
Büyüme ve Gelişim: Kraniyofasiyal büyüme; Büyüme dönemlerinin belirlenmesi; Diş sürmesi ve dişlenme dönemleri; Büyüme teorileri
Maloklüzyonlar: Angle sınıflaması; Sınıf II maloklüzyon; Sınıf III maloklüzyon; Açık ve derin kapanış
Ortodontik Tanı: Model analizi; Sefalometrik analiz; Yer analizi; Fonksiyonel değerlendirme
Ortodontik Biyomekanik: Diş hareketinin biyolojisi; Kuvvet türleri; Ankraj; Ortodontik tedavinin yan etkileri
Ortodontik Apareyler: Hareketli apareyler; Fonksiyonel apareyler; Sabit apareyler; Ortopedik apareyler
Koruyucu ve Önleyici Ortodonti: Yer tutucular; Kötü alışkanlıklar; Seri çekim; Pekiştirme ve nüks
""" ),
("endodonti", "EN", "Endodonti", "Klinik Bilimler", CORE_KLINIK, """
Pulpa ve Periapikal Hastalıklar: Pulpa hastalıklarının sınıflaması; Periapikal hastalıklar; Tanı testleri (vitalite, perküsyon); Ağrının ayırıcı tanısı
Kök Kanal Anatomisi: Kanal morfolojisi; Dişlere göre kanal sayıları; Giriş kavitesi; Çalışma boyu belirleme
Kök Kanal Tedavisi: Kanal şekillendirme teknikleri; İrrigasyon solüsyonları; Kanal içi medikamanlar; Kanal dolum yöntemleri
Vital Pulpa Tedavileri: İndirekt ve direkt kuafaj; Pulpotomi; Kalsiyum hidroksit ve MTA; Rejeneratif endodonti
Endodontik Cerrahi ve Komplikasyonlar: Apikal rezeksiyon; Alet kırılması ve perforasyon; Endodontik aciller; Kanal tedavisinde başarısızlık
Travma ve Rezorpsiyonlar: Kron ve kök kırıkları; Lüksasyon yaralanmaları; Avülsiyon ve replantasyon; İnternal ve eksternal rezorpsiyon
""" ),
("pedodonti", "PO", "Çocuk Diş Hekimliği", "Klinik Bilimler", CORE_KLINIK, """
Çocuk Gelişimi ve Davranış Yönetimi: Çocukta psikolojik gelişim; Davranış yönlendirme teknikleri; Sedasyon ve genel anestezi; Engelli çocuklarda diş tedavisi
Süt Dişleri: Süt dişi morfolojisi; Süt dişlerinde sürme ve düşme; Süt dişi pulpa tedavileri; Paslanmaz çelik kronlar
Erken Çocukluk Çağı Çürüğü: Etiyoloji ve risk faktörleri; Önleme yöntemleri; Fissür örtücüler; Topikal ve sistemik flor
Çocuklarda Dental Travma: Süt dişi travmaları; Genç sürekli diş travmaları; Apeksifikasyon ve apeksogenez; Travma sonrası takip
Diş Anomalileri: Sayı anomalileri; Şekil ve boyut anomalileri; Yapı anomalileri; Sürme anomalileri
Çocuklarda Sistemik Durumlar ve Yer Tutucular: Sistemik hastalıkların ağız bulguları; Çocukta ilaç dozları; Yer tutucular; Çocukta lokal anestezi
""" ),
]
for suffix, prefix, subject, test, core, spec in DUS_SPEC:
    add("dus", suffix, prefix, subject, test, DUS, MED_LABEL, core, spec)

def main():
    from exam_trees import EXAM, BADGE
    reg = json.load(open(REG, encoding="utf-8"))
    keep = [p for p in reg["programs"] if not p["id"].startswith(tuple(f"{k}-2026-deep-" for k in EXAM))]
    added, seen = [], set()
    letters = "abcçdefgğh"
    for kind, suffix, prefix, subject, test, sources, label, core, topics in T:
        pid = f"{kind}-2026-deep-{suffix}"
        assert 6 <= len(topics) <= 16, pid
        src = sources[0] if kind == "yds" else ("yok_ducep_2024" if kind == "dus" else sources[-1])
        units = []
        for i, (title, subs) in enumerate(topics, 1):
            assert 3 <= len(subs) <= 6, (pid, title)
            outs = []
            for j, s in enumerate(subs):
                code = f"{EXAM[kind]}.D{prefix}.{i}.{letters[j]}"
                assert code not in seen; seen.add(code)
                outs.append({"code": code, "text": s, "topic": title, "grade": None,
                             "limitations": [label, core], "quotas": {}, "sourceId": src})
            units.append({"title": title, "outcomes": outs})
        added.append({
            "id": pid, "kind": kind, "grade": None, "subjectKey": f"{kind}-{suffix}", "subject": subject,
            "label": f"{EXAM[kind]} · {subject}", "programVersion": f"{kind}_deep_2026", "badge": BADGE[kind],
            "scope": f"{label}. ÖSYM testi: {test}. {core}.", "sourceIds": sources, "units": units, "exams": {},
        })
    reg["programs"] = keep + added
    json.dump(reg, open(REG, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    tot = {}
    for p in added:
        t = tot.setdefault(p["kind"], [0, 0, 0]); t[0] += 1; t[1] += len(p["units"]); t[2] += sum(len(u["outcomes"]) for u in p["units"])
    print(tot)

if __name__ == "__main__":
    main()

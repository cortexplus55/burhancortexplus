"""
KPSS / ALES / DGS / YDS / TUS / DUS konu ağaçları (1 Kasım 2026) -> registry.json (yalnız ekleme).

Dürüstlük kuralı: ÖSYM bu sınavlar için konu listesi yayımlamaz; kılavuzlar yalnız test adını, kapsam cümlesini ve
soru sayısını verir. Bu yüzden her program ve her alt başlık etiketini taşır:
  KPSS/ALES/DGS/YDS: "Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir" (YDS: soru türleri ÖSYM'den)
  TUS/DUS:          "Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir" (UÇEP 2020 / DUÇEP-2024)
Kullanım: python3 exam_trees.py  (registry.json yerinde güncellenir; mevcut programlara dokunulmaz)
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
REG = ROOT / "src/lib/curriculum/registry.json"
MEB_LABEL = "Konu ağacı MEB müfredatına dayanır — resmî ÖSYM listesi değildir"
YDS_LABEL = "Soru türleri ÖSYM kılavuzundandır; alt başlıklar resmî ÖSYM listesi değildir"
MED_LABEL = "Tıp/Akademik Müfredat Konu Ağacı — resmî ÖSYM listesi değildir"

NEW_SOURCES = {
    "yok_ucep_2020": {
        "id": "yok_ucep_2020",
        "url": "https://egitim.yok.gov.tr/documentFiles/17594056261.Mezuniyet%20%C3%96ncesi%20T%C4%B1p%20E%C4%9Fitimi%20-%20Ulusal%20%C3%87ekirdek%20E%C4%9Fitim%20Program%C4%B1%202020.pdf",
        "sha256": "b407fc9e9ee7a9c5ad73c1726af127b7ec01e5c816a05fec70600a2a6976a57d",
        "program_version": "ucep_2020",
        "publisher": "YÖK",
        "title": "Mezuniyet Öncesi Tıp Eğitimi Ulusal Çekirdek Eğitim Programı 2020 (UÇEP)",
        "fetched_at": "2026-11-01T22:00:00+03:00",
        "page": "https://egitim.yok.gov.tr/tr/page/499",
    },
    "yok_ducep_2024": {
        "id": "yok_ducep_2024",
        "url": "https://egitim.yok.gov.tr/documentFiles/17594056261.Mezuniyet%20%C3%96ncesi%20Di%C5%9F%20Hekimli%C4%9Fi%20Ulusal%20%C3%87ekirdek%20E%C4%9Fitim%20Program%C4%B1.pdf",
        "sha256": "545fd3e1397e396242567c6e76cb30c5dc14d1ebd4a9b89e477b363cd6444591",
        "program_version": "ducep_2024",
        "publisher": "YÖK",
        "title": "Mezuniyet Öncesi Diş Hekimliği Ulusal Çekirdek Eğitim Programı (DUÇEP-2024)",
        "fetched_at": "2026-11-01T22:00:00+03:00",
        "page": "https://egitim.yok.gov.tr/tr/page/499",
    },
}

# (kind, id-son-eki, kod öneki, ders adı, ÖSYM test adı, kaynaklar, etiket, [(konu, [alt başlıklar])])
T = []
def add(kind, suffix, prefix, subject, test, sources, label, topics):
    T.append((kind, suffix, prefix, subject, test, sources, label, topics))

KPSS = ["osym_kpss_2026", "meb_yks_2026"]
add("kpss", "turkce", "KT", "Türkçe (Genel Yetenek · Sözel)", "Genel Yetenek", KPSS, MEB_LABEL, [
    ("Sözcükte Anlam", ["Gerçek, mecaz ve terim anlam", "Eş, zıt ve yakın anlamlı sözcükler", "Deyimler ve atasözleri"]),
    ("Cümlede Anlam", ["Cümle yorumu ve anlam ilişkileri", "Neden-sonuç, amaç-sonuç ve koşul cümleleri", "Öznel ve nesnel yargı"]),
    ("Paragraf", ["Ana düşünce ve yardımcı düşünceler", "Paragrafın yapısı ve akışı", "Anlatım biçimleri ve düşünceyi geliştirme yolları"]),
    ("Ses Bilgisi, Yazım ve Noktalama", ["Ses olayları", "Yazım kuralları", "Noktalama işaretleri"]),
    ("Dil Bilgisi", ["Sözcük türleri", "Sözcükte yapı (kök, ek)", "Cümlenin ögeleri ve cümle türleri", "Anlatım bozuklukları"]),
    ("Sözel Mantık", ["Sıralama ve yerleştirme", "Koşullu çıkarım", "Tablo ve şema yorumlama"]),
])
add("kpss", "matematik", "KM", "Matematik (Genel Yetenek · Sayısal)", "Genel Yetenek", KPSS, MEB_LABEL, [
    ("Temel Kavramlar ve Sayılar", ["Sayı kümeleri ve basamak analizi", "Ardışık sayılar", "Asal sayılar ve tek-çift sayılar"]),
    ("Bölünebilme ve Rasyonel Sayılar", ["Bölme ve bölünebilme kuralları", "EBOB ve EKOK", "Rasyonel ve ondalık sayılar"]),
    ("Üslü ve Köklü İfadeler, Denklemler", ["Üslü ve köklü ifadeler", "Çarpanlara ayırma", "Birinci dereceden denklemler ve eşitsizlikler", "Mutlak değer"]),
    ("Problemler", ["Sayı, kesir ve yaş problemleri", "Yüzde, kâr-zarar ve faiz", "Karışım, işçi ve hareket problemleri"]),
    ("Kümeler, Fonksiyonlar ve Olasılık", ["Kümeler ve fonksiyonlar", "Permütasyon ve kombinasyon", "Olasılık ve veri yorumlama"]),
    ("Sayısal Mantık ve Geometri", ["Sayısal akıl yürütme ve örüntüler", "Üçgenler ve çokgenler", "Çember, alan ve hacim"]),
])
add("kpss", "tarih", "KTR", "Tarih (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, [
    ("İslamiyet Öncesi ve İlk Türk-İslam Devletleri", ["İlk Türk devletleri ve kültürü", "İlk Türk-İslam devletleri", "Türkiye Selçuklu Devleti"]),
    ("Osmanlı Devleti Siyasi Tarihi", ["Kuruluş ve yükselme dönemleri", "Duraklama ve gerileme dönemleri", "Dağılma dönemi ve Birinci Dünya Savaşı"]),
    ("Osmanlı Kültür ve Medeniyeti", ["Devlet yönetimi ve ordu", "Toprak düzeni ve ekonomi", "Islahat hareketleri"]),
    ("Kurtuluş Savaşı Hazırlık ve Muharebeler", ["Mondros ve işgaller", "Kongreler ve Misak-ı Millî", "Cepheler ve Lozan Antlaşması"]),
    ("Atatürk İlke ve İnkılapları", ["Siyasi ve hukuki inkılaplar", "Eğitim, kültür ve toplumsal inkılaplar", "Atatürk ilkeleri"]),
    ("Çağdaş Türk ve Dünya Tarihi", ["Atatürk dönemi dış politika", "İkinci Dünya Savaşı ve sonrası", "Soğuk Savaş ve küreselleşme"]),
])
add("kpss", "cografya", "KCO", "Türkiye Coğrafyası (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, [
    ("Türkiye'nin Coğrafi Konumu", ["Matematik ve özel konum", "Konumun sonuçları"]),
    ("Yer Şekilleri ve İklim", ["Türkiye'nin yer şekilleri", "İklim tipleri ve bitki örtüsü", "Akarsular, göller ve toprak"]),
    ("Nüfus ve Yerleşme", ["Nüfusun dağılışı ve özellikleri", "Göçler", "Yerleşme tipleri"]),
    ("Tarım ve Hayvancılık", ["Tarım ürünleri ve yetiştirme alanları", "Hayvancılık türleri"]),
    ("Madenler, Enerji ve Sanayi", ["Maden ve enerji kaynakları", "Sanayi kolları ve bölgeleri"]),
    ("Ulaşım, Ticaret ve Turizm", ["Ulaşım ağları", "Dış ticaret", "Turizm bölgeleri"]),
])
add("kpss", "vatandaslik", "KV", "Vatandaşlık (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, [
    ("Hukukun Temel Kavramları", ["Hukuk kuralları ve yaptırım", "Hukukun dalları", "Kişi, ehliyet ve haklar"]),
    ("Anayasa Hukuku ve Anayasal Gelişmeler", ["Türk anayasal gelişmeleri", "1982 Anayasası'nın temel ilkeleri"]),
    ("Temel Hak ve Ödevler", ["Kişi hakları", "Sosyal, ekonomik ve siyasi haklar"]),
    ("Yasama", ["TBMM'nin yapısı ve görevleri", "Kanun yapım süreci"]),
    ("Yürütme ve Yargı", ["Cumhurbaşkanı ve yürütme", "Yargı organları ve yüksek mahkemeler"]),
    ("İdare Hukuku", ["Merkezî ve yerinden yönetim", "Kamu görevlileri"]),
])
add("kpss", "guncel", "KG", "Güncel Bilgiler (Genel Kültür)", "Genel Kültür", KPSS, MEB_LABEL, [
    ("Türkiye ve Dünyada Güncel Gelişmeler", ["Siyasi gelişmeler", "Ekonomik gelişmeler"]),
    ("Bilim, Teknoloji ve Sağlık", ["Bilimsel ve teknolojik gelişmeler", "Sağlık alanındaki gelişmeler"]),
    ("Uluslararası Kuruluşlar", ["Türkiye'nin üye olduğu kuruluşlar", "Kuruluşların merkez ve amaçları"]),
    ("Kültür, Sanat ve Spor", ["Kültür ve sanat etkinlikleri", "Önemli spor organizasyonları"]),
    ("Çevre ve Sürdürülebilirlik", ["İklim değişikliği ve çevre anlaşmaları", "Enerji ve doğal kaynaklar"]),
])

ALES = ["osym_ales_2026", "meb_yks_2026"]
DGS = ["osym_dgs_2026", "meb_yks_2026"]
SAY = [
    ("Temel Kavramlar ve Sayılar", ["Sayı kümeleri ve basamak", "Bölünebilme, EBOB ve EKOK", "Rasyonel sayılar ve oran-orantı"]),
    ("Cebirsel İfadeler ve Denklemler", ["Üslü ve köklü ifadeler", "Çarpanlara ayırma", "Denklemler ve eşitsizlikler"]),
    ("Problemler", ["Sayı ve kesir problemleri", "Yüzde, kâr-zarar ve karışım", "İşçi ve hareket problemleri"]),
    ("Veri, Sayma ve Olasılık", ["Tablo ve grafik yorumlama", "Permütasyon ve kombinasyon", "Olasılık"]),
    ("Sayısal Akıl Yürütme ve Geometri", ["Sayısal mantık ve örüntüler", "Üçgen, dörtgen ve çember", "Alan ve hacim"]),
]
SOZ = [
    ("Sözcük ve Cümlede Anlam", ["Sözcükte anlam", "Cümle yorumu ve anlam ilişkileri"]),
    ("Paragrafta Anlam", ["Ana düşünce ve yardımcı düşünce", "Paragraf yapısı ve akışı"]),
    ("Paragraf Tamamlama ve Akış", ["Boşluk doldurma", "Akışı bozan cümle", "Cümle sıralama"]),
    ("Dil Bilgisi ve Anlatım Bozuklukları", ["Sözcük türleri ve cümle ögeleri", "Anlatım bozuklukları", "Yazım ve noktalama"]),
    ("Sözel Akıl Yürütme", ["Sıralama ve yerleştirme", "Koşullu çıkarım", "Metinden çıkarım"]),
]
add("ales", "sayisal", "AS", "Sayısal", "Sayısal", ALES, MEB_LABEL, SAY)
add("ales", "sozel", "AZ", "Sözel", "Sözel", ALES, MEB_LABEL, SOZ)
add("dgs", "sayisal", "DS", "Sayısal", "Sayısal", DGS, MEB_LABEL, SAY)
add("dgs", "sozel", "DZ", "Sözel", "Sözel", DGS, MEB_LABEL, SOZ)

add("yds", "yabanci-dil", "Y", "Yabancı Dil", "Yabancı Dil", ["osym_yds_2026"], YDS_LABEL, [
    ("Sözcük Bilgisi", ["Bağlamda sözcük seçimi", "Phrasal verb ve edat kalıpları", "Eş anlam ve sözcük türetme"]),
    ("Dil Bilgisi", ["Zamanlar ve kipler", "Bağlaçlar ve geçiş ifadeleri", "Yan cümleler ve edilgen yapı"]),
    ("Cloze Test", ["Paragrafta sözcük boşluğu", "Paragrafta dil bilgisi boşluğu"]),
    ("Cümle Tamamlama", ["Bağlaç ve anlam uyumu", "Zaman uyumu"]),
    ("Çeviri", ["İngilizceden Türkçeye", "Türkçeden İngilizceye"]),
    ("Okuduğunu Anlama", ["Okuma parçası soruları", "Paragraf tamamlama ve anlamca yakın cümle", "Diyalog tamamlama ve akışı bozan cümle"]),
])

TUS = ["osym_tus_2026", "yok_ucep_2020"]
for suffix, prefix, subject, test, topics in [
    ("anatomi", "AN", "Anatomi", "Temel Tıp Bilimleri", [
        ("Kemikler ve Eklemler", ["Üst ve alt ekstremite kemikleri", "Kafatası ve omurga", "Eklemler"]),
        ("Kaslar ve Ekstremiteler", ["Üst ekstremite kasları ve pleksus brakiyalis", "Alt ekstremite kasları ve pleksus lumbosakralis"]),
        ("Baş-Boyun ve Nöroanatomi", ["Kraniyal sinirler", "Beyin ve omurilik", "Baş-boyun bölgesi"]),
        ("Toraks", ["Kalp ve büyük damarlar", "Akciğerler ve mediasten"]),
        ("Abdomen ve Pelvis", ["Gastrointestinal organlar", "Ürogenital organlar ve pelvis"])]),
    ("histoloji", "HI", "Histoloji ve Embriyoloji", "Temel Tıp Bilimleri", [
        ("Hücre ve Temel Dokular", ["Hücre yapısı", "Epitel ve bağ dokusu", "Kas ve sinir dokusu"]),
        ("Organ Sistemleri Histolojisi", ["Dolaşım ve solunum sistemi", "Sindirim sistemi", "Üriner ve endokrin sistem"]),
        ("Genel Embriyoloji", ["Gametogenez ve fertilizasyon", "Gelişimin ilk haftaları"]),
        ("Sistem Embriyolojisi", ["Kalp ve damar gelişimi", "Baş-boyun ve farengeal arklar", "Ürogenital gelişim"])]),
    ("fizyoloji", "FZ", "Fizyoloji", "Temel Tıp Bilimleri", [
        ("Hücre ve Sinir-Kas Fizyolojisi", ["Membran taşınımı ve potansiyeller", "Sinaps ve kas kasılması"]),
        ("Kardiyovasküler Fizyoloji", ["Kalbin elektriksel aktivitesi", "Hemodinami ve kan basıncı"]),
        ("Solunum ve Böbrek Fizyolojisi", ["Ventilasyon ve gaz değişimi", "Glomerüler filtrasyon ve asit-baz"]),
        ("Sindirim ve Endokrin Fizyolojisi", ["Gastrointestinal hormonlar", "Endokrin bezler"]),
        ("Nörofizyoloji", ["Duyu ve motor sistemler", "Otonom sinir sistemi"])]),
    ("biyokimya", "BK", "Tıbbi Biyokimya", "Temel Tıp Bilimleri", [
        ("Biyomoleküller ve Enzimler", ["Proteinler ve aminoasitler", "Enzim kinetiği"]),
        ("Karbonhidrat Metabolizması", ["Glikoliz ve glukoneogenez", "Glikojen metabolizması ve pentoz fosfat yolu"]),
        ("Lipit ve Aminoasit Metabolizması", ["Yağ asidi sentezi ve yıkımı", "Lipoproteinler", "Üre döngüsü ve aminoasit hastalıkları"]),
        ("Enerji Metabolizması ve Vitaminler", ["Sitrik asit döngüsü ve oksidatif fosforilasyon", "Vitaminler ve mineraller"]),
        ("Moleküler Biyoloji ve Klinik Biyokimya", ["DNA, RNA ve protein sentezi", "Hormon biyokimyası", "Klinik laboratuvar"])]),
    ("mikrobiyoloji", "MB", "Tıbbi Mikrobiyoloji", "Temel Tıp Bilimleri", [
        ("Genel Mikrobiyoloji", ["Bakteri yapısı ve genetiği", "Sterilizasyon ve dezenfeksiyon"]),
        ("İmmünoloji", ["Doğal ve edinsel bağışıklık", "Aşırı duyarlılık ve immün yetmezlik"]),
        ("Bakteriyoloji", ["Gram pozitif ve gram negatif bakteriler", "Mikobakteriler ve diğer bakteriler"]),
        ("Viroloji", ["DNA virüsleri", "RNA virüsleri ve hepatit virüsleri"]),
        ("Mikoloji ve Parazitoloji", ["Mantarlar", "Protozoonlar ve helmintler"])]),
    ("patoloji", "PA", "Tıbbi Patoloji", "Temel Tıp Bilimleri", [
        ("Hücre Hasarı ve İnflamasyon", ["Hücre hasarı ve ölümü", "Akut ve kronik inflamasyon"]),
        ("Hemodinamik Bozukluklar ve İmmünopatoloji", ["Tromboz, emboli ve şok", "İmmün sistem hastalıkları"]),
        ("Neoplazi ve Genetik Hastalıklar", ["Tümör biyolojisi", "Genetik ve pediatrik hastalıklar"]),
        ("Sistemik Patoloji I", ["Kardiyovasküler ve solunum sistemi", "Gastrointestinal sistem ve karaciğer"]),
        ("Sistemik Patoloji II", ["Böbrek ve ürogenital sistem", "Endokrin, kemik ve sinir sistemi"])]),
    ("farmakoloji", "FA", "Tıbbi Farmakoloji", "Temel Tıp Bilimleri", [
        ("Genel Farmakoloji", ["Farmakokinetik", "Farmakodinamik"]),
        ("Otonom Sinir Sistemi İlaçları", ["Kolinerjik ilaçlar", "Adrenerjik ilaçlar"]),
        ("Kardiyovasküler ve Böbrek İlaçları", ["Antihipertansifler ve diüretikler", "Antiaritmikler ve antikoagülanlar"]),
        ("Santral Sinir Sistemi İlaçları", ["Antidepresan ve antipsikotikler", "Antiepileptikler ve anestezikler"]),
        ("Kemoterapötikler ve Endokrin İlaçlar", ["Antimikrobiyaller", "Antineoplastikler", "Hormonlar ve antagonistleri"])]),
    ("dahiliye", "DA", "Dâhiliye Grubu", "Klinik Tıp Bilimleri", [
        ("Kardiyoloji", ["Koroner arter hastalığı", "Kalp yetmezliği ve aritmiler"]),
        ("Göğüs Hastalıkları", ["Astım ve KOAH", "Pnömoni ve akciğer kanseri"]),
        ("Gastroenteroloji ve Hepatoloji", ["Peptik ülser ve inflamatuvar barsak hastalığı", "Hepatitler ve siroz"]),
        ("Nefroloji ve Endokrinoloji", ["Akut ve kronik böbrek hastalığı", "Diyabet, tiroid ve adrenal hastalıklar"]),
        ("Hematoloji ve Onkoloji", ["Anemiler", "Lösemi ve lenfomalar"]),
        ("Romatoloji ve Enfeksiyon Hastalıkları", ["İnflamatuvar romatizmal hastalıklar", "Sepsis ve sık enfeksiyonlar"])]),
    ("pediatri", "PE", "Pediatri", "Klinik Tıp Bilimleri", [
        ("Yenidoğan", ["Yenidoğan muayenesi ve sarılık", "Prematürite ve solunum sıkıntısı"]),
        ("Büyüme-Gelişme ve Beslenme", ["Büyüme izlemi", "Beslenme bozuklukları", "Aşılama"]),
        ("Çocuk Enfeksiyon Hastalıkları", ["Döküntülü hastalıklar", "Menenjit ve solunum yolu enfeksiyonları"]),
        ("Çocuk Kardiyoloji ve Nefroloji", ["Doğumsal kalp hastalıkları", "Nefrotik ve nefritik sendrom"]),
        ("Metabolik, Genetik ve Endokrin Hastalıklar", ["Doğumsal metabolik hastalıklar", "Kromozom anomalileri", "Çocukluk çağı endokrin hastalıkları"])]),
    ("cerrahi", "CE", "Cerrahi Grubu", "Klinik Tıp Bilimleri", [
        ("Genel Cerrahi İlkeleri", ["Sıvı-elektrolit ve şok", "Yara iyileşmesi ve cerrahi enfeksiyonlar"]),
        ("Travma ve Acil Cerrahi", ["Travmaya yaklaşım", "Akut karın"]),
        ("Gastrointestinal Cerrahi", ["Mide ve barsak hastalıkları", "Hepatobiliyer ve pankreas cerrahisi"]),
        ("Meme, Endokrin ve Damar Cerrahisi", ["Meme hastalıkları", "Tiroid ve paratiroid cerrahisi", "Periferik damar hastalıkları"]),
        ("Cerrahi Branşlar", ["Ortopedi ve üroloji", "Beyin cerrahisi ve çocuk cerrahisi"])]),
    ("kadin-dogum", "KD", "Kadın Hastalıkları ve Doğum", "Klinik Tıp Bilimleri", [
        ("Gebelik Fizyolojisi ve Doğum", ["Gebelik tanısı ve izlemi", "Normal doğum ve doğum eylemi"]),
        ("Gebelik Komplikasyonları", ["Hipertansif bozukluklar", "Kanamalar ve erken doğum"]),
        ("Jinekolojik Endokrinoloji ve İnfertilite", ["Menstrüel siklus bozuklukları", "İnfertilite ve menopoz"]),
        ("Jinekolojik Onkoloji", ["Serviks ve endometrium kanserleri", "Over tümörleri"])]),
]:
    add("tus", suffix, prefix, subject, test, TUS, MED_LABEL, topics)

DUS = ["osym_dus_2026", "yok_ducep_2024", "yok_ucep_2020"]
for suffix, prefix, subject, test, topics in [
    ("anatomi", "AN", "Anatomi", "Temel Bilimler", [
        ("Baş-Boyun Kemikleri", ["Kafatası kemikleri", "Mandibula ve maksilla"]),
        ("Çiğneme Kasları ve Temporomandibular Eklem", ["Çiğneme ve mimik kasları", "Temporomandibular eklem"]),
        ("Kraniyal Sinirler", ["Trigeminal sinir", "Fasiyal ve diğer kraniyal sinirler"]),
        ("Ağız Boşluğu ve Damar-Lenf Yapıları", ["Ağız boşluğu ve tükürük bezleri", "Baş-boyun damarları ve lenf drenajı"])]),
    ("histoloji", "HI", "Histoloji ve Embriyoloji", "Temel Bilimler", [
        ("Temel Dokular", ["Epitel ve bağ dokusu", "Kemik ve kıkırdak"]),
        ("Diş Gelişimi", ["Odontogenez evreleri", "Mine ve dentin oluşumu"]),
        ("Ağız Dokuları Histolojisi", ["Pulpa ve periodonsiyum", "Oral mukoza ve tükürük bezleri"]),
        ("Baş-Boyun Embriyolojisi", ["Farengeal arklar", "Yüz ve damak gelişimi"])]),
    ("fizyoloji", "FZ", "Fizyoloji", "Temel Bilimler", [
        ("Hücre ve Sinir-Kas Fizyolojisi", ["Membran potansiyelleri", "Kas kasılması"]),
        ("Kan ve Dolaşım Fizyolojisi", ["Kan ve hemostaz", "Kalp ve dolaşım"]),
        ("Solunum ve Böbrek Fizyolojisi", ["Gaz değişimi", "Böbrek ve asit-baz dengesi"]),
        ("Sindirim, Endokrin ve Ağız Fizyolojisi", ["Tükürük salgısı ve çiğneme", "Endokrin sistem"])]),
    ("biyokimya", "BK", "Tıbbi Biyokimya", "Temel Bilimler", [
        ("Biyomoleküller ve Enzimler", ["Proteinler", "Enzimler"]),
        ("Metabolizma", ["Karbonhidrat metabolizması", "Lipit ve aminoasit metabolizması"]),
        ("Vitaminler ve Mineraller", ["Vitaminler", "Kalsiyum, fosfor ve mineralizasyon"]),
        ("Moleküler Biyokimya ve Hormonlar", ["Nükleik asitler", "Hormon biyokimyası"])]),
    ("mikrobiyoloji", "MB", "Tıbbi Mikrobiyoloji", "Temel Bilimler", [
        ("Genel Mikrobiyoloji ve Sterilizasyon", ["Bakteri yapısı", "Sterilizasyon ve dezenfeksiyon"]),
        ("İmmünoloji", ["Bağışıklık sistemi", "Aşırı duyarlılık"]),
        ("Ağız Mikrobiyolojisi", ["Dental plak ve çürük mikrobiyolojisi", "Periodontal patojenler"]),
        ("Viroloji ve Mikoloji", ["Hepatit ve herpes virüsleri", "Kandida ve diğer mantarlar"])]),
    ("patoloji", "PA", "Tıbbi Patoloji", "Temel Bilimler", [
        ("Hücre Hasarı ve İnflamasyon", ["Hücre hasarı", "İnflamasyon ve onarım"]),
        ("Neoplazi", ["Tümör biyolojisi", "Baş-boyun tümörleri"]),
        ("Ağız Patolojisi", ["Odontojenik kist ve tümörler", "Oral mukoza lezyonları"]),
        ("Sistemik Patoloji", ["Kemik hastalıkları", "Tükürük bezi hastalıkları"])]),
    ("farmakoloji", "FA", "Tıbbi Farmakoloji", "Temel Bilimler", [
        ("Genel Farmakoloji", ["Farmakokinetik", "Farmakodinamik"]),
        ("Lokal Anestezikler ve Analjezikler", ["Lokal anestezikler", "NSAİİ ve opioidler"]),
        ("Antimikrobiyaller", ["Antibiyotikler", "Antifungal ve antiviral ilaçlar"]),
        ("Otonom ve Kardiyovasküler İlaçlar", ["Otonom sinir sistemi ilaçları", "Antikoagülanlar ve antihipertansifler"])]),
    ("biyoloji-genetik", "BG", "Tıbbi Biyoloji ve Genetik", "Temel Bilimler", [
        ("Hücre Biyolojisi", ["Hücre organelleri", "Hücre döngüsü ve bölünme"]),
        ("Moleküler Biyoloji", ["DNA replikasyonu ve onarımı", "Gen ifadesi"]),
        ("Kalıtım ve Genetik Hastalıklar", ["Kalıtım kalıpları", "Kromozom anomalileri"]),
        ("Kraniyofasiyal Genetik", ["Dudak-damak yarıkları", "Diş gelişim anomalilerinin genetiği"])]),
    ("restoratif", "RE", "Restoratif Diş Tedavisi", "Klinik Bilimler", [
        ("Diş Çürüğü", ["Çürük etiyolojisi ve tanısı", "Çürük önleme"]),
        ("Kavite Hazırlığı", ["Kavite sınıflaması", "Kavite preparasyon ilkeleri"]),
        ("Restoratif Materyaller", ["Kompozit rezinler ve adeziv sistemler", "Amalgam ve cam iyonomer"]),
        ("Estetik Uygulamalar", ["Beyazlatma", "Direkt ve indirekt estetik restorasyonlar"])]),
    ("protetik", "PR", "Protetik Diş Tedavisi", "Klinik Bilimler", [
        ("Tam Protezler", ["Ölçü ve çene ilişkileri", "Diş dizimi ve oklüzyon"]),
        ("Hareketli Bölümlü Protezler", ["Sınıflama", "Protez parçaları ve tasarım"]),
        ("Sabit Protezler", ["Kron ve köprü preparasyonu", "Seramik ve metal sistemler"]),
        ("İmplant Üstü Protezler ve Oklüzyon", ["İmplant üstü protez", "Oklüzyon ve TME bozuklukları"])]),
    ("cerrahi", "CR", "Ağız, Diş ve Çene Cerrahisi", "Klinik Bilimler", [
        ("Lokal Anestezi ve Diş Çekimi", ["Lokal anestezi teknikleri", "Diş çekimi ve komplikasyonlar"]),
        ("Gömülü Dişler ve Preprotetik Cerrahi", ["Gömülü dişler", "Preprotetik cerrahi"]),
        ("Enfeksiyonlar ve Kistler", ["Odontojenik enfeksiyonlar", "Çene kistleri"]),
        ("Travma ve Ortognatik Cerrahi", ["Maksillofasiyal travma", "Ortognatik cerrahi"]),
        ("Tıbbi Riskli Hasta", ["Sistemik hastalıklı hastaya yaklaşım", "Acil durumlar"])]),
    ("radyoloji", "RA", "Ağız, Diş ve Çene Radyolojisi", "Klinik Bilimler", [
        ("Radyasyon Fiziği ve Korunma", ["X-ışını oluşumu", "Radyasyondan korunma"]),
        ("Görüntüleme Teknikleri", ["İntraoral ve panoramik radyografi", "Konik ışınlı bilgisayarlı tomografi"]),
        ("Radyografik Yorumlama", ["Normal anatomi", "Çene lezyonlarının radyolojisi"]),
        ("Oral Tanı", ["Anamnez ve muayene", "Oral mukoza hastalıkları"])]),
    ("periodontoloji", "PD", "Periodontoloji", "Klinik Bilimler", [
        ("Periodonsiyumun Yapısı", ["Dişeti ve periodontal ligament", "Alveol kemiği"]),
        ("Periodontal Hastalıkların Sınıflaması ve Etiyolojisi", ["Güncel sınıflama", "Dental plak ve risk faktörleri"]),
        ("Periodontal Tedavi", ["Başlangıç tedavisi", "Periodontal cerrahi"]),
        ("Peri-implant Hastalıklar ve İdame", ["Peri-implantitis", "Periodontal idame"])]),
    ("ortodonti", "OR", "Ortodonti", "Klinik Bilimler", [
        ("Büyüme ve Gelişim", ["Kraniyofasiyal büyüme", "Dentisyon gelişimi"]),
        ("Malokluzyon ve Teşhis", ["Malokluzyon sınıflaması", "Sefalometri"]),
        ("Biyomekanik ve Apareyler", ["Diş hareketi biyomekaniği", "Sabit ve hareketli apareyler"]),
        ("Koruyucu ve Önleyici Ortodonti", ["Yer tutucular", "Kötü alışkanlıklar"])]),
    ("endodonti", "EN", "Endodonti", "Klinik Bilimler", [
        ("Pulpa ve Periapikal Hastalıklar", ["Pulpa hastalıkları", "Periapikal lezyonlar"]),
        ("Kök Kanal Anatomisi ve Giriş Kavitesi", ["Kök kanal morfolojisi", "Giriş kavitesi"]),
        ("Kanal Şekillendirme ve Dolum", ["Şekillendirme ve irrigasyon", "Kanal dolum teknikleri"]),
        ("Vital Pulpa Tedavileri ve Travma", ["Kuafaj ve pulpotomi", "Dental travma ve rejeneratif endodonti"])]),
    ("pedodonti", "PO", "Çocuk Diş Hekimliği", "Klinik Bilimler", [
        ("Çocuk Hastada Davranış Yönetimi", ["Davranış yönlendirme teknikleri", "Sedasyon ve genel anestezi"]),
        ("Süt Dişleri ve Erken Çocukluk Çürüğü", ["Süt dişi morfolojisi", "Erken çocukluk çağı çürüğü"]),
        ("Koruyucu Uygulamalar", ["Fluorid uygulamaları", "Fissür örtücüler"]),
        ("Süt Dişi Pulpa Tedavileri ve Travma", ["Pulpotomi ve pulpektomi", "Çocuklarda dental travma"])]),
]:
    add("dus", suffix, prefix, subject, test, DUS, MED_LABEL, topics)

EXAM = {"kpss": "KPSS", "ales": "ALES", "dgs": "DGS", "yds": "YDS", "tus": "TUS", "dus": "DUS"}
BADGE = {
    "kpss": "ÖSYM 2026 KPSS Kılavuzu (test) · MEB 2026 YKS kazanımları (alt başlık)",
    "ales": "ÖSYM 2026 ALES Kılavuzu (test) · MEB ortaöğretim müfredatı (alt başlık)",
    "dgs": "ÖSYM 2026 DGS Kılavuzu (test) · MEB ortaöğretim müfredatı (alt başlık)",
    "yds": "ÖSYM 2026 YDS Kılavuzu (soru türleri)",
    "tus": "ÖSYM 2026 TUS Kılavuzu (test) · YÖK UÇEP 2020 (alt başlık)",
    "dus": "ÖSYM 2026 DUS Kılavuzu (test) · YÖK DUÇEP-2024 / UÇEP 2020 (alt başlık)",
}

def main():
    reg = json.load(open(REG, encoding="utf-8"))
    reg["sources"].update(NEW_SOURCES)
    keep = [p for p in reg["programs"] if not p["id"].startswith(tuple(f"{k}-2026-tree-" for k in EXAM))]
    added = []
    for kind, suffix, prefix, subject, test, sources, label, topics in T:
        pid = f"{kind}-2026-tree-{suffix}"
        units = []
        for i, (title, subs) in enumerate(topics, 1):
            letters = "abcçdefgğh"
            units.append({"title": title, "outcomes": [
                {"code": f"{EXAM[kind]}.{prefix}.{i}.{letters[j]}", "text": s, "topic": title, "grade": None,
                 "limitations": [label], "quotas": {}, "sourceId": ("yok_ducep_2024" if kind == "dus" else sources[-1]) if kind != "yds" else sources[0]}
                for j, s in enumerate(subs)]})
        added.append({
            "id": pid, "kind": kind, "grade": None, "subjectKey": f"{kind}-{suffix}", "subject": subject,
            "label": f"{EXAM[kind]} · {subject}", "programVersion": f"{kind}_tree_2026", "badge": BADGE[kind],
            "scope": f"{label}. ÖSYM testi: {test}.", "sourceIds": sources, "units": units, "exams": {},
        })
    reg["programs"] = keep + added
    json.dump(reg, open(REG, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    for p in added:
        print(p["id"], len(p["units"]), sum(len(u["outcomes"]) for u in p["units"]))

if __name__ == "__main__":
    main()

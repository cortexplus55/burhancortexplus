/**
 * Öğretim ölçütü (20 Ekim 2026, kör kıyas: aynı belgeyle Astra ve Cortex dersleri yan yana).
 *
 * Doğruluk kapısı bizde güçlüydü (beş çiftin beşinde kaynağa sadakat), öğretim ise zayıf kalıyordu:
 * aynı bilgi iki ekranda yeniden anlatıldı, kaynağın kısaltması ("ayrı hukuk sistemi + uluslararası
 * sözleşme") açıklanmadan aktarıldı, "eş yönlü" terimi tanımlanmadan soruldu, kutunun işini anlatan
 * boş cümleler ("sırasını hatırlatır") yazıldı. Yazar ve denetçi bu ölçütü AYNI metinle okur
 * (option-reference.ts gibi: yalnız metin, içe aktarma yok).
 *
 * Denetçi bu maddeleri 'medium' yazar: öğretimi zayıflatır ama yanlış bir şey öğretmez. İlk kavramda
 * tur açmaz (öğrenci bekliyor), sonraki kavramlarda en çok bir kavram içi tur (teacher-lesson-run.ts).
 *
 * 22 Ekim 2026, kör kıyas 2. tur: doğrulukta ve sınava hazırlıkta 20 yargının 20'si / 18'i bizden yana, öğrenci
 * gözünde 12'si Astra'dan yana. Yargıçların ortak cümlesi: "kaynağın tekrarı gibi okunuyor". Aynı bilgi ekran, kutu,
 * özet ve testte dört beş kez; "Örnek vaka" vaka değil; "Genel oy için verilen bilgi 1934 yılıdır"; ikinci soru ana
 * sorunun aynısı; çözümlü örnek adımsız ("b=10√2 bulursun"). 1., 6., 8. ve 9. maddeler bunun için genişledi.
 */
export const TEACHING_RUBRIC =
  "ÖĞRETİM ÖLÇÜTÜ: " +
  "1) Tekrar yok: bir bilgi bir kez anlatılır; sonraki ekran onu yeniden anlatmaz, üstüne kurar; kutunun gövdesi " +
  "hemen üstündeki cümleyi tekrar etmez (soru, açıklama ve özet tekrar sayılmaz). Aynı tabloyu ya da paragrafı ikinci " +
  "bir ekranda yeniden verme; bir kavramın ekranı sonraki kavramın bilgisini önceden anlatmaz. " +
  "2) Neden ve nasıl: kaynağın kısaltmasını ('ayrı hukuk sistemi + uluslararası sözleşme') olduğu gibi aktarma; ne " +
  "anlama geldiğini, neden ve nasıl öyle olduğunu kendi cümlenle, kaynağın bilgilerini birbirine bağlayarak anlat. " +
  "3) Terim ilk geçtiği yerde kaynağın kendi tanımıyla tek yan cümlede açıklanır; kaynağın Türkçe terimi önce, " +
  "yabancısı parantezde ('eş yönlü (koterminal)'). Kaynak terimi tanımlamıyorsa yalnız yabancı terimin birebir " +
  "Türkçe karşılığını ver; ne olduğunu dışarıdan anlatma. " +
  "4) Boş cümle yok: biçimi anlatan ('aynı sütunda yer almaz') ya da kutunun işini söyleyen ('sırasını hatırlatır', " +
  "'bu tablo farkı gösterir') cümle yazma. Ekran öğreterek açılır: çalışma öğüdü ('X'i değerlendirirken Y'ye bak', " +
  "'bu bilgileri ayrı ele al', 'birlikte düşün', 'karıştırma') bir ekranda en çok bir cümledir ve bilginin yerini tutmaz. " +
  "5) Döngüsel tanım yok: terim kendi adıyla ya da aynı kökle tanımlanmaz ('üniter devlet, üniter yapıdaki " +
  "devlettir' değil). " +
  "6) Soru ayırt ettirir ya da uygulatır: hemen üstteki cümleyi geri sormaz; şıklar aynı türdendir, kendini ele veren " +
  "konu dışı şık olmaz; yanlıştan sonra sorulan ikinci soru (review) öğrencinin en olası yanlışını YENİ bir " +
  "durumda ölçer: ana sorunun kökünü ve 'Doğrusu' cümlesini yeniden sormaz. 'Bir öğrenci … diyor / savunuyor / " +
  "yorumluyor' kalıbı durum değildir; durumu olayın kendisiyle kur (bir hasta, bir seçim, bir açı). " +
  "7) Özet her kavramın sınavda soruyu çözdüren kilit bilgisini (çoğu kez derste ==vurgulanan== bilgi) taşır; bir " +
  "kavramı özetten düşürme. " +
  "8) Çözümlü örnek ve hesap adımlarını gösterir: verilen → kullanılan kural → işlem → sonuç; sonucu 'bulursun' diye " +
  "atlamaz. " +
  "9) Kaynağı ve biçimini anma: 'notlarda belirtiliyor', 'kaynakta verilen', 'X için verilen bilgi 1934 yılıdır' yazma; " +
  "bilgiyi öğretmen gibi doğrudan söyle. Kaynak yalnız bir eşleşme veriyorsa ('Genel oy – 1934') eşleşmeyi doğal " +
  "yaz ('Genel oy: 1934'); terimin ne olduğunu kaynak tanımlamıyorsa onu yalnız bir 'Genel bilgi' kutusunda açıkla. " +
  "10) 'Örnek vaka' kutusu somut bir durumdur (kim, ne zaman, ne oldu) ve sonucu kavramdan çıkar; genel kuralı " +
  "('Bir çocuğun ölçümleri eğride izlenir') yeniden söyleyen kutu vaka değildir.";

/**
 * Kaynak kuralının dar istisnası (20 Ekim 2026, ürün sahibinin kararı). Ölçütün 2. ve 3. maddesi
 * kaynak kuralıyla çakışıyordu: neden cümlesi ve terimin Türkçe karşılığı denetçiden "kaynakta
 * dayanağı yok" (A) alıp tur döndürecekti. İstisna dar: dışarıdan tanım yine yalnız "Genel bilgi"
 * kutusunda. Yazarın kaynak kuralı ve denetçinin A maddesi bu cümleyi aynen okur.
 */
export const SOURCE_LINK_EXEMPTION =
  "Kaynaktaki iki bilgiyi birbirine bağlayan neden cümlesi ve yabancı bir terimin birebir Türkçe karşılığı yeni " +
  "bilgi sayılmaz — sayı, eşik, kural ya da sonuç eklemedikleri sürece. Kaynakta tanımı olmayan bir terimin ne " +
  "olduğunu dışarıdan açıklamak ise yeni bilgidir: kavramın adını taşıyan 'note' kutusunda (tone 'general') yaz. " +
  "Başlığa 'Sınav Müfredatı Tamamlaması' yazma. Kaynağın " +
  "nedenini vermediği bir bilginin mekanizması da yeni bilgidir: yalnız 'Neden böyle?' kutusunda.";

/**
 * "Neden böyle?" kutusu (23 Ekim 2026, ürün sahibinin kararı). Üç kör ölçümün ortak eleştirisi "neden ve nasıl
 * yok, kaynağın tekrarı gibi" idi: kaynak kuralı yazarı yalnız kaynağın cümlelerine bağlıyordu. Kaynak bir bilgiyi
 * nedenini vermeden söylüyorsa nedeni etiketli bir kutuda anlatılır; kutu yeni sayı, eşik, kural ya da sonuç
 * taşımaz, denetçi doğruluğuna bakar (H). Etiketsiz dış bilgi hâlâ hata (A). Yazar ve denetçi bu metni aynen okur.
 */
export const WHY_NOTE_RULE =
  // İlk denemede "ekleyebilirsin" dokuz dersin hiçbirinde kutu yazdırmadı (23 Ekim 2026): kural artık her kavrama
  // bakmayı ister, emin olunmayan yerde yine yazdırmaz.
  "NEDEN KUTUSU: Her kavram için şunu sor: kaynak bu kavramın en önemli bilgisini (bir eşik, bir yasak, bir " +
  "sıralama, bir sınıflandırma, bir hesap kuralı) nedenini vermeden mi söylüyor? Öyleyse ve nedeni bilmek öğrencinin " +
  "hatırlamasını ya da iki kavramı ayırt etmesini kolaylaştırıyorsa o kavrama bir 'note' bloğu yaz: tone 'general', " +
  "başlık doğrudan kısa sorudur ('İnek sütü neden bir yaşından önce verilmez?'). " +
  "Başlığa önek koyma. Gövde 1-2 cümle mekanizma. Yeni sayı, eşik, kural, tarih ya da sonuç " +
  "eklemez; yalnız kaynakta zaten olan bilginin nedenini anlatır. Yalnız ders kitaplarında tartışmasız mekanizma; emin " +
  "değilsen yazma. Kavram başına en çok bir. Soru, 'corrected' ve özet buna dayanmaz; sorular kaynaktan çözülür. " +
  "Kaynak nedeni kendisi veriyorsa kutu açma, nedeni metinde anlat.";

/** Ders, test ve podcast istemlerinin sonuna eklenir. Model bu adları kendi cümlesi gibi yazmasın. */
export const STUDENT_LEAK_BAN =
  "ÇIKTI YASAĞI: İç kural adlarını ve şu ifadeleri çıktına yazma: sayı uydurma, kapsamı dışındadır, " +
  "Sınav Müfredatı Tamamlaması, görünmediği için, burada görünmedi, Ders: … Dönem …. " +
  "Şekildeki değer kaynakta yoksa o değeri kullanma ve görünmüyor diye de yazma. " +
  "Açıklamada 'cevap B'dir' veya 'doğru şık B' yazma; şıkkı içeriğiyle an.";

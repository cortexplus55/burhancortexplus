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
 */
export const TEACHING_RUBRIC =
  "ÖĞRETİM ÖLÇÜTÜ: " +
  "1) Tekrar yok: bir bilgi bir kez anlatılır; sonraki ekran onu yeniden anlatmaz, üstüne kurar; kutunun gövdesi " +
  "hemen üstündeki cümleyi tekrar etmez (soru, açıklama ve özet tekrar sayılmaz). " +
  "2) Neden ve nasıl: kaynağın kısaltmasını ('ayrı hukuk sistemi + uluslararası sözleşme') olduğu gibi aktarma; ne " +
  "anlama geldiğini, neden ve nasıl öyle olduğunu kendi cümlenle, kaynağın bilgilerini birbirine bağlayarak anlat. " +
  "3) Terim ilk geçtiği yerde kaynağın kendi tanımıyla tek yan cümlede açıklanır; kaynağın Türkçe terimi önce, " +
  "yabancısı parantezde ('eş yönlü (koterminal)'). Kaynak terimi tanımlamıyorsa yalnız yabancı terimin birebir " +
  "Türkçe karşılığını ver; ne olduğunu dışarıdan anlatma. " +
  "4) Boş cümle yok: biçimi anlatan ('aynı sütunda yer almaz') ya da kutunun işini söyleyen ('sırasını hatırlatır', " +
  "'bu tablo farkı gösterir') cümle yazma. " +
  "5) Döngüsel tanım yok: terim kendi adıyla ya da aynı kökle tanımlanmaz ('üniter devlet, üniter yapıdaki " +
  "devlettir' değil). " +
  "6) Soru ayırt ettirir ya da uygulatır: hemen üstteki cümleyi geri sormaz; şıklar aynı türdendir, kendini ele veren " +
  "konu dışı şık olmaz; yanlıştan sonra sorulan ikinci soru (review) öğrencinin en olası yanlışını ölçer. " +
  "7) Özet her kavramın sınavda soruyu çözdüren kilit bilgisini (çoğu kez derste ==vurgulanan== bilgi) taşır; bir " +
  "kavramı özetten düşürme.";

/**
 * Kaynak kuralının dar istisnası (20 Ekim 2026, ürün sahibinin kararı). Ölçütün 2. ve 3. maddesi
 * kaynak kuralıyla çakışıyordu: neden cümlesi ve terimin Türkçe karşılığı denetçiden "kaynakta
 * dayanağı yok" (A) alıp tur döndürecekti. İstisna dar: dışarıdan tanım yine yalnız "Genel bilgi"
 * kutusunda. Yazarın kaynak kuralı ve denetçinin A maddesi bu cümleyi aynen okur.
 */
export const SOURCE_LINK_EXEMPTION =
  "Kaynaktaki iki bilgiyi birbirine bağlayan neden cümlesi ve yabancı bir terimin birebir Türkçe karşılığı yeni " +
  "bilgi sayılmaz — sayı, eşik, kural ya da sonuç eklemedikleri sürece. Kaynakta tanımı olmayan bir terimin ne " +
  "olduğunu dışarıdan açıklamak ise yeni bilgidir: yalnız 'Genel bilgi' kutusunda (ders başına en çok iki).";

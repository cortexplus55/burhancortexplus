/**
 * İniş sayfasının sık sorulanları.
 *
 * Üç soru vardı ve ikisi yanlış şeyi cevaplıyordu. "Ücretsiz deneyebilir
 * miyim?" sorusuna verilen cevap "kayıt olmadan marketing sayfalarını
 * gezebilirsin"di — öğrencinin sorduğu bu değil; ürünü kullanıp
 * kullanamayacağını soruyor. "ChatGPT'den farkı ne?" cevabı da her AI
 * ürününün söyleyebileceği genel bir cümleydi.
 *
 * SSS itirazların öldüğü yerdir: buraya kadar gelmiş öğrenci ilgileniyor ama
 * bir şeye takılmış. Her cevabın ARKASINDA GERÇEKTEN VAR OLAN bir davranış
 * olmalı — burada verilen her söz kodda karşılığı olduğu için veriliyor.
 *
 * Bilerek yazılmayanlar: mobil uygulama (mağazada olup olmadığını
 * doğrulayamıyoruz) ve not garantisi (ölçemediğimiz bir şeyi vaat etmek).
 */

export type FaqItem = { q: string; a: string };

export const MARKETING_FAQ: FaqItem[] = [
  {
    q: "Cortex Plus tam olarak ne yapıyor?",
    a: "Ders notunu yüklüyorsun; içinden çalışılacak konular çıkarılıyor, her konu için anlatım, iki sunuculu podcast, test ve sözlü pratik üretiliyor. Hepsi senin notundan — genel bir ders anlatımı değil, elindeki materyalin kendisi.",
  },
  {
    q: "Ücretsiz kullanabilir miyim, kart istiyor musunuz?",
    a: "Kart istemiyoruz. Ücretsiz hesap her gün yenilenen 6 kredi alıyor ve bu krediyle bütün özellikler açık — kilitli özellik yok. Ücretli planlar özellik değil, hacim satıyor.",
  },
  {
    q: "ChatGPT'den farkı ne?",
    a: "ChatGPT senin notunu bilmiyor. Cortex Plus yüklediğin belgeye bağlı çalışıyor ve notunda olmayan bir şeyi uydurmak yerine \"bu notunda yok\" diyor. Sınavda nottan sorumluysan, doğru ama notta olmayan bir bilgi de seni yanlış yere götürür.",
  },
  {
    q: "Yanlış bilgi verirse ne olacak?",
    a: "Her cevap gönderilmeden önce ikinci bir denetimden geçiyor; geçemezse aynı soru daha güçlü bir modelle yeniden deneniyor. İki denemede de emin olamazsak sana yanlış bir şey göstermek yerine durumu söylüyoruz — ve o soru için kredin düşmüyor.",
  },
  {
    q: "Kendi notumdan mı öğretiyor, internetten mi?",
    a: "Sen seçiyorsun. \"Yalnızca belgem\" dersen notunun dışına çıkmıyor. \"Belge + genel bilgi\" dersen eksik kalan yeri tamamlıyor ama notunla çelişmiyor. Belgen yoksa konudan çalışıyorsun ve içeriğin belgenden gelmediği ekranda açıkça yazıyor.",
  },
  {
    q: "Ders notum yok, yine de kullanabilir miyim?",
    a: "Evet. Kurulumun ilk sorusu bu: \"Ders notum var\" ya da \"Belgem yok, konudan çalışayım\". İkincisini seçersen sınavında ne olduğunu anlatıyorsun, konuları birlikte çıkarıp planı kuruyoruz.",
  },
  {
    q: "Kredi ne demek, ne kadar yetiyor?",
    a: "Her AI işlemi kredi harcıyor: sohbet, quiz üretimi, podcast gibi. İşlemin kaç kredi olduğu yapmadan önce yazıyor — sürpriz yok. Ücretsiz hesapta günde 6 kredi her sabah yenileniyor.",
  },
  {
    q: "Kartım yok, nasıl ödeme yapabilirim?",
    a: "Planını kurduktan sonra veline ödeme isteği gönderebiliyorsun. Velin neye çalışacağını görüp ödemeyi kendi kartıyla yapıyor; hesap senin kalıyor.",
  },
  {
    q: "Hangi dersler var?",
    a: "Matematikten felsefeye on beş ders hazır duruyor. Listede olmayan bir ders için de kendi konunu yazıp başlayabilirsin — ders listesi bir sınır değil, kısayol.",
  },
  {
    q: "Telefondan çalışır mı?",
    a: "Evet, tarayıcıdan. Ayrı bir uygulama indirmen gerekmiyor; sohbet, podcast ve testler telefonda da çalışıyor.",
  },
  {
    q: "Aboneliğimi iptal edersem ne oluyor?",
    a: "İptal, o dönemin sonunda yenilemeyi durduruyor. Ödediğin dönem bitene kadar her şey açık kalıyor; sonrasında hesabın ücretsiz katmana dönüyor ve çalışmaların duruyor.",
  },
  {
    q: "Yüklediğim notlar ne oluyor?",
    a: "Belgelerin senin hesabına bağlı kalıyor ve dilediğin zaman silebiliyorsun. Kart bilgisi bizde hiç durmuyor; ödeme PayTR altyapısında alınıyor. Ayrıntılar KVKK ve gizlilik sayfalarında.",
  },
];

import type { Icon3DName } from "@/components/ui/icon-3d";

/**
 * Ana sayfanın bütün cümleleri (19 Ekim 2026, ürün sahibi: "misafire sistemimizde olmayan bir şey
 * gösteriyor muyuz, yalan vaat var mı?"). Tek kural: burada yazan her şey bugün üründe çalışıyor.
 * Eski sayfa saatli günlük plan, "net" analizi, Plus'ta "gelişmiş model" ve "öncelikli destek"
 * vaat ediyordu; hiçbiri yoktu. Bekçi: `tests/unit/marketing-claims.test.ts` yasak cümleleri tarar.
 *
 * Rakip adı geçmez: karşılaştırmalı reklam ancak doğrulanabilir ve kötülemeyen biçimde serbest;
 * kendi ölçtüğümüz sayıyı söylemek yeterli ve güvenli.
 */

export const HERO = {
  eyebrow: "Üniversite sınavları · KPSS · YKS · TUS",
  title: "Notunu yükle, sınava hazır bir yol çıksın.",
  /** Başlığın iki parçası: ikincisi ışıklı yazılır (sinematik kahraman, 19 Ekim 2026). */
  titleLead: "Notunu yükle,",
  titleAccent: "sınava hazır bir yol çıksın.",
  lead:
    "Cortex Plus ders notunu konulara ayırır; her konu için ders, podcast, test ve sözlü pratik hazırlar. Hepsi senin notuna dayanır; notunda olmayan sayı ya da kural uydurmaz.",
  primary: { label: "Ücretsiz başla", href: "/kayit" },
  secondary: { label: "Nasıl çalışıyor?", href: "#nasil" },
  fineprint: "Kart istemiyoruz · Her gün bir ders ücretsiz",
} as const;

/** Ölçülmüş ya da kodda kural olarak duran farklar; sayılar `docs/delivery/` ölçümlerinden. */
export const PROOF = [
  {
    stat: "Birkaç saniye",
    title: "Sıradaki dersin hazır bekler",
    body: "Sen bir dersi bitirirken sıradaki arka planda yazılır. Hazır ders açılınca beklemezsin.",
  },
  {
    stat: "İki öğretmen",
    title: "Dersler notuna karşı denetlenir",
    body: "Bir yapay zekâ yazar, ikincisi notuna karşı tek tek kontrol eder; sohbette notuna dayanan cevaplar da. Geçemeyen kısım sana gelmez.",
  },
  {
    stat: "Etiketli",
    title: "Notunda olmayan uydurulmaz",
    body: "Notunun dışındaki bilgi ancak \"Genel bilgi\" etiketiyle gelir. Neyin nottan geldiği hep belli.",
  },
  {
    stat: "₺0",
    title: "Kartsız başla",
    body: "Ücretsiz hesap her gün yenilenir. Abonelik kendiliğinden yenilenmez, sürpriz çekim olmaz.",
  },
] as const;

export const STEPS: { icon: Icon3DName; title: string; body: string }[] = [
  {
    icon: "bos-belge",
    title: "Notunu yükle",
    body: "PDF ya da taranmış not. Notun yoksa sınavını anlat, konudan başlayalım.",
  },
  {
    icon: "mufredat",
    title: "Yolun çıksın",
    body: "Notun bölüm bölüm konulara ayrılır ve sırayla yoluna dizilir. İstersen kısa bir seviye tespitiyle başlarsın.",
  },
  {
    icon: "ders",
    title: "Konuyu öğren",
    body: "Ekran ekran ders, iki sesli podcast, kartlar. Sınavda sorulacak yer turuncuyla işaretli.",
  },
  {
    icon: "yazili",
    title: "Sınavı provala",
    body: "Konu testi, yazılı deneme, sözlü deneme. Yanlışın neden yanlış olduğunu şık şık görürsün.",
  },
];

export type LandingFeature = {
  icon: Icon3DName;
  title: string;
  body: string;
  plusOnly?: boolean;
  /** Izgaradaki yer: "hero" iki sütun iki satır, "wide" iki sütun. */
  size?: "hero" | "wide";
};

/** Hazırlık yolundaki ve Araçlar'daki gerçek etkinlikler (`study-tools.ts`, `/araclar`). */
export const FEATURES: LandingFeature[] = [
  { icon: "ders", title: "Ders", body: "Kısa ekranlar, önce dene soruları, tablolar. Yanlış cevapta doğrusu hemen.", size: "hero" },
  { icon: "podcast", title: "Podcast", body: "Ada ve Kerem konuyu konuşarak anlatır. Yolda, serviste dinle.", plusOnly: true, size: "wide" },
  { icon: "video", title: "Video ders", body: "Bir dakikalık anlatım; sınavda sorulan bilgi ekranda büyük yazılı.", plusOnly: true },
  { icon: "kartlar", title: "Kartlar ve tekrar", body: "Zorlandığın kart önce gelir; aralıklı tekrarla unutmazsın." },
  { icon: "konu-testi", title: "Konu testi", body: "Her şıkkın neden doğru ya da yanlış olduğu ayrı ayrı açıklanır." },
  { icon: "dogru-yanlis", title: "Doğru / Yanlış", body: "Hızlı kontrol; yanlış cümlenin doğrusu yanında." },
  { icon: "yazili", title: "Yazılı deneme", body: "Çoktan seçmeli ve açık uçlu. İstersen kâğıda çöz, fotoğrafını çek.", plusOnly: true },
  { icon: "sozlu", title: "Sözlü deneme", body: "Sesli ya da yazılı cevapla; eksik bıraktığın yeri öğretmen bir kez sorar, sonunda not verir.", plusOnly: true },
  { icon: "ogretmen", title: "AI öğretmen", body: "Takıldığın yeri sor; cevap kendi notuna dayanır.", size: "wide" },
  { icon: "yildiz", title: "Düello ve yıldızlar", body: "Arkadaşına meydan oku, seriyi koru, haftalık sıralamada yüksel.", size: "wide" },
];

/** Gerçek bir dersin ekranları (Çocuk Sağlığı hazırlığı, kurucu hesabı, 18 Ekim 2026 yazımı). */
export const LESSON_SCENE = {
  topic: "Çocuklarda Enfeksiyon Hastalıkları",
  tryFirst: {
    prompt: "Çocukta tansiyon düşüklüğü görülmüyorsa dolaşım bozukluğu erken dönemde dışlanabilir.",
    answer: "Yanlış",
    corrected:
      "Çocuklar hipotansiyonu uzun süre kompanse edebildiği için dolaşım bozukluğunun erken bulguları önemlidir.",
  },
  /** Aynı dersin tablosundan bir soru (özellik ızgarasındaki küçük ders ekranı). */
  quiz: {
    prompt: "Makül, papül, vezikül ve kabuğun aynı anda görüldüğü hastalık hangisi?",
    options: ["Kızamık", "Suçiçeği", "Kızıl"],
    answer: "Suçiçeği",
  },
  screen: {
    heading: "Döküntülü hastalıkların ipuçları",
    before: "Döküntülü hastalıklarda tek başına döküntünün varlığı yeterli değildir. ",
    emphasis: "Döküntünün ne zaman çıktığı, nereden başladığı ve lezyonların aynı evrede olup olmadığı",
    after: " ayırıcı tanıya yardım eder.",
    table: {
      columns: ["Hastalık", "Tipik ipucu"],
      rows: [
        ["Kızamık", "Koplik lekeleri; yüzden başlayıp aşağı yayılan döküntü"],
        ["Suçiçeği", "Makül, papül, vezikül ve kabuk aynı anda"],
        ["Kızıl", "Zımpara hissi, çilek dili, Pastia çizgileri"],
      ],
    },
  },
} as const;

/**
 * Kahraman sahnesi: notun sayfası → yol → ders ekranı. Hepsi üründe olan ekranlardan (hazırlık yolu,
 * "Sınavda sorulur" kutusu, "+%X kazandın" kartı); sayılar örnek olduğu için yalnız kart içinde.
 */
export const STAGE = {
  note: {
    file: "Çocuk Sağlığı notu.pdf",
    heading: "Döküntülü hastalıklar",
    tip: "Suçiçeğinde makül, papül, vezikül ve kabuk aynı anda görülür.",
  },
  path: {
    title: "Yolun",
    subtitle: "Çocuk Sağlığı",
    nodes: [
      { label: "Seviye tespiti", state: "done" },
      { label: "Ders · Döküntülü hastalıklar", state: "next" },
      { label: "Konu testi", state: "todo" },
      { label: "Podcast", state: "todo", plus: true },
    ],
  },
  gain: { value: "+%12 kazandın", detail: "Konu hâkimiyeti %64" },
} as const;

export const TRUST = [
  {
    title: "Notuna sadık",
    body: "Ders ve test notundaki sayfalardan yazılır; belgende olmayan bilgi \"Genel bilgi\" diye ayrı kutuda gelir, soru ona dayanmaz. Podcast konuyu ders kitabı bilgisiyle açar; sayı, eşik ve sınıflandırma yine notundan.",
  },
  {
    title: "Öğretmen gözüyle",
    body: "Notundaki \"sınav ipucu\", \"akılda tut\" kutuları ve eşik değerleri ayıklanır; derste turuncu işaretle, testte soru olarak karşına çıkar.",
  },
  {
    title: "Yarım kalmaz",
    body: "Bir bölüm denetimden geçemezse ders yine açılır ve eksik kısmı adıyla söyleriz. Hiçbir şey hazırlanamazsa hakkın iade edilir.",
  },
] as const;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Cortex Plus tam olarak ne yapıyor?",
    a: "Ders notunu yüklüyorsun; içinden çalışılacak konular çıkarılıyor ve her konu için ders, podcast, test, kartlar ve sözlü pratik hazırlanıyor. Hepsi senin notuna dayanır; genel bir ders anlatımı değil.",
  },
  {
    q: "Ücretsiz neler yapabilirim?",
    a: "Kart istemiyoruz. Ücretsiz hesap her gün yenilenen bir hak alıyor: günde bir ders, bir test ya da iki sohbet mesajı. Bir sınav hazırlığı kurabilir, toplam 5 sayfa belge işletebilirsin. Fotoğraftan soru çözümü günde 3 kez ücretsiz. Podcast, sözlü ve yazılı deneme ve video ders bu günlük haktan büyük; onlar Plus'ta.",
  },
  {
    q: "Plus'ta ne değişiyor?",
    a: "Ayda yaklaşık 1.200 ders ya da 2.400 mesaj; podcast, sözlü ve yazılı deneme, video ders; belgenin tamamı, sınırsız hazırlık ve hazır içerik yokken daha hızlı yazım. Yapay zekâ modeli aynı; fark ne kadar ve ne kadar hızlı çalışabildiğinde.",
  },
  {
    q: "Notumda olmayan bir şeyi sorarsam?",
    a: "Varsayılan modda cevap önce notundan gelir; notunda yoksa \"Genel bilgiden:\" diye ayrı yazılır. \"Yalnızca belgem\" modunu seçersen notunun dışına hiç çıkmaz.",
  },
  {
    q: "Ders notum yok, yine de kullanabilir miyim?",
    a: "Evet. Kurulumda \"Belgem yok\" de, sınavını ve konularını anlat; aynı yol konudan kurulur ve içeriğin belgenden gelmediği ekranda yazar.",
  },
  {
    q: "İçerik yanlış olursa ne oluyor?",
    a: "Her ders kavram kavram, her test soru soru ikinci bir yapay zekâ tarafından notuna karşı denetleniyor. Düzelmeyen kısım sana gösterilmiyor. Yine de hata görürsen ekrandaki \"Eğitmene yaz\" ya da Destek ile bize ilet; 24 saat içinde dönüyoruz.",
  },
  {
    q: "Kartım yok, nasıl ödeme yaparım?",
    a: "Ödeme PayTR ile banka kartı ya da kredi kartıyla alınır; velinin kartıyla da ödeyebilirsin, hesap senin kalır. Kart bilgisi bize gelmez.",
  },
  {
    q: "Abonelik kendiliğinden yenilenir mi?",
    a: "Hayır. Dönem bitmeden hatırlatırız; yenilemezsen hesabın ücretsize döner, çalışmaların yerinde kalır.",
  },
  {
    q: "Telefondan çalışır mı?",
    a: "Evet, tarayıcıdan. İndirmen gereken bir uygulama yok; ders, podcast ve testler telefonda da çalışıyor.",
  },
];

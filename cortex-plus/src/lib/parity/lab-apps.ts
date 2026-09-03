/** Lab-style app catalog (Astra /lab parity — Cortex routes where available) */

export type LabApp = {
  id: string;
  title: string;
  subject: "Matematik" | "Fizik" | "Kimya" | "Biyoloji" | "Genel";
  href: string;
  category: "mini" | "sim" | "tool";
  blurb?: string;
};

export const LAB_FEATURED_IDS = ["gunes", "periyodik", "grafik"] as const;

function lab(id: string) {
  return `/uygulamalar/lab/${id}`;
}

export const LAB_APPS: LabApp[] = [
  { id: "grafik", title: "Grafik çizici", subject: "Matematik", href: lab("grafik"), category: "sim", blurb: "Fonksiyonları çiz, kaydır ve eğriyi anında gör." },
  { id: "denklem", title: "Denklem çözücü", subject: "Matematik", href: lab("denklem"), category: "tool" },
  { id: "geometri", title: "Geometri", subject: "Matematik", href: lab("geometri"), category: "sim" },
  { id: "trigonometri", title: "Trigonometri", subject: "Matematik", href: lab("trigonometri"), category: "mini" },
  { id: "integral", title: "İntegral", subject: "Matematik", href: lab("integral"), category: "tool" },
  { id: "olasilik", title: "Olasılık", subject: "Matematik", href: lab("olasilik"), category: "mini" },
  { id: "faiz", title: "Faiz laboratuvarı", subject: "Matematik", href: lab("faiz"), category: "sim", blurb: "Aynı para, aynı oran — basit ve bileşik faiz yan yana." },
  { id: "renk", title: "Renk modelleri", subject: "Fizik", href: lab("renk"), category: "sim" },
  { id: "devre", title: "Elektrik devreleri", subject: "Fizik", href: lab("devre"), category: "sim" },
  { id: "kuvvet", title: "Kuvvet ve hareket", subject: "Fizik", href: lab("kuvvet"), category: "sim" },
  { id: "gunes", title: "Güneş sistemi", subject: "Fizik", href: lab("gunes"), category: "sim", blurb: "Gezegenleri gez; ölçek, yörünge ve mesafeyi keşfet." },
  { id: "dalga", title: "Dalga simülasyonu", subject: "Fizik", href: lab("dalga"), category: "sim" },
  { id: "momentum", title: "Momentum", subject: "Fizik", href: lab("momentum"), category: "mini" },
  { id: "molekul", title: "Molekül yapıları", subject: "Kimya", href: lab("molekul"), category: "sim" },
  { id: "periyodik", title: "Periyodik tablo", subject: "Kimya", href: lab("periyodik"), category: "tool", blurb: "Elementlere tıkla; grup, periyot ve özellikleri incele." },
  { id: "tepkime", title: "Kimyasal tepkimeler", subject: "Kimya", href: lab("tepkime"), category: "sim" },
  { id: "asit", title: "Asit-baz", subject: "Kimya", href: lab("asit"), category: "mini" },
  { id: "hucre", title: "Hücre yapısı", subject: "Biyoloji", href: lab("hucre"), category: "sim" },
  { id: "dna", title: "DNA & genetik", subject: "Biyoloji", href: "/flashcardlar", category: "tool" },
  { id: "ekosistem", title: "Ekosistem", subject: "Biyoloji", href: lab("ekosistem"), category: "sim" },
  { id: "fotosentez", title: "Fotosentez", subject: "Biyoloji", href: lab("fotosentez"), category: "mini" },
  { id: "foto-coz", title: "Fotoğraftan çöz", subject: "Genel", href: "/soru-coz", category: "tool" },
  { id: "flashcard", title: "Flashcard stüdyo", subject: "Genel", href: "/flashcardlar", category: "tool" },
  { id: "quiz-maker", title: "Quiz oluştur", subject: "Genel", href: "/quizler", category: "tool" },
  { id: "plan", title: "Çalışma planı", subject: "Genel", href: "/calisma-plani", category: "tool" },
  { id: "deneme", title: "Deneme sınavı", subject: "Genel", href: "/deneme-sinavlari", category: "tool" },
  { id: "docs", title: "Doküman asistanı", subject: "Genel", href: "/dokumanlar", category: "tool" },
  { id: "ilerleme", title: "İlerleme panosu", subject: "Genel", href: "/ilerleme", category: "tool" },
  { id: "sohbet", title: "Sohbet geçmişi", subject: "Genel", href: "/sohbetler", category: "tool" },
  { id: "egik-atis", title: "Eğik atış", subject: "Fizik", href: lab("egik-atis"), category: "sim", blurb: "Hangi açı en uzağa atar? Simetriyi kendin gör." },
  { id: "sarkac", title: "Sarkaç", subject: "Fizik", href: lab("sarkac"), category: "sim", blurb: "Periyodu ne belirler? Kütleyi oynat ve şaşır." },
  { id: "dalga-girisimi", title: "Dalga girişimi", subject: "Fizik", href: lab("dalga-girisimi"), category: "sim", blurb: "İki dalga üst üste binince faz farkı her şeyi değiştirir." },
  { id: "serbest-dusus", title: "Serbest düşüş", subject: "Fizik", href: lab("serbest-dusus"), category: "sim", blurb: "Boşlukta tüy de çekiç de aynı anda düşer. Havada ne oluyor?" },
  { id: "turev-teget", title: "Türev ve teğet", subject: "Matematik", href: lab("turev-teget"), category: "sim", blurb: "Türev bir sayı değil, her noktada değişen bir eğim." },
  { id: "riemann", title: "Riemann toplamı", subject: "Matematik", href: lab("riemann"), category: "sim", blurb: "Dikdörtgen sayısını artır, hatanın eridiğini gör." },
  { id: "fonksiyon-analizi", title: "Fonksiyon analizi", subject: "Matematik", href: lab("fonksiyon-analizi"), category: "sim", blurb: "f, f′ ve f″ alt alta — ilişkiyi tek bakışta oku." },
  { id: "vektorler", title: "Vektörler", subject: "Matematik", href: lab("vektorler"), category: "sim", blurb: "|a| + |b| neden bileşkenin boyu değil?" },
  { id: "donel-cisimler", title: "Dönel cisimler", subject: "Matematik", href: lab("donel-cisimler"), category: "sim", blurb: "Eğriyi döndür, hacmini dilim dilim gör." },
  { id: "ph-karistirici", title: "pH karıştırıcı", subject: "Kimya", href: lab("ph-karistirici"), category: "sim", blurb: "Derişimi 10 katına çıkar, pH neden sadece 1 birim kayıyor?" },
  { id: "gaz-yasalari", title: "Gaz yasaları", subject: "Kimya", href: lab("gaz-yasalari"), category: "sim", blurb: "Boyle, Charles, Gay-Lussac — hepsi tek denklemin yüzleri." },
  { id: "tepkime-hizi", title: "Tepkime hızı", subject: "Kimya", href: lab("tepkime-hizi"), category: "sim", blurb: "10 derece neden hızı ikiye katlıyor?" },
  { id: "molekul-geometrisi", title: "Molekül geometrisi", subject: "Kimya", href: lab("molekul-geometrisi"), category: "sim", blurb: "Su neden düz değil? Görünmeyen çiftleri aç, gör." },
  { id: "populasyon", title: "Popülasyon dinamiği", subject: "Biyoloji", href: lab("populasyon"), category: "sim", blurb: "Üstel büyümenin başı neden düz görünür?" },
  { id: "enzim-kinetigi", title: "Enzim kinetiği", subject: "Biyoloji", href: lab("enzim-kinetigi"), category: "sim", blurb: "Substrat artınca hız neden bir yerden sonra artmıyor?" },
  { id: "punnett", title: "Punnett karesi", subject: "Biyoloji", href: lab("punnett"), category: "sim", blurb: "Genotip 1:2:1 iken fenotip neden 3:1?" },
  { id: "mercek", title: "Mercekte görüntü", subject: "Fizik", href: lab("mercek"), category: "sim", blurb: "Görüntü ne zaman gerçek, ne zaman sanal olur?" },
  { id: "monte-carlo", title: "Monte Carlo ile π", subject: "Matematik", href: lab("monte-carlo"), category: "sim", blurb: "Rastgele nokta atarak π nasıl bulunur?" },
  { id: "normal-dagilim", title: "Normal dağılım", subject: "Matematik", href: lab("normal-dagilim"), category: "sim", blurb: "68-95-99,7 kuralı nereden geliyor?" },
  { id: "ozyineleme", title: "Özyinelemeli diziler", subject: "Matematik", href: lab("ozyineleme"), category: "sim", blurb: "Başlangıç değişse de oran neden altın orana gidiyor?" },
  { id: "sozsuz-ispat", title: "Sözsüz ispat", subject: "Matematik", href: lab("sozsuz-ispat"), category: "sim", blurb: "(a+b)² neden a² + b² değil? Kayıp alanı gör." },
  { id: "cift-sarkac", title: "Çift sarkaç", subject: "Fizik", href: lab("cift-sarkac"), category: "sim", blurb: "İki sarkaç, binde bir fark. Ne kadar sürede ayrılırlar?" },
];

export const LAB_FILTERS = [
  "Tümü",
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Genel",
] as const;

export function labCategoryCounts() {
  return {
    mini: LAB_APPS.filter((a) => a.category === "mini").length,
    sim: LAB_APPS.filter((a) => a.category === "sim").length,
    tool: LAB_APPS.filter((a) => a.category === "tool").length,
  };
}

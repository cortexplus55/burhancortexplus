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

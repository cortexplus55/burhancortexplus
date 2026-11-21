/*
  "⋮ Daha fazla" menüsünün özel ders komutları (öğretmen v3, teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibinin
  istemi). Menüde altı komut var; dokunulan komutun `prompt`u öğrencinin mesajı olarak gider. Sunucu aynı metni
  `moreCommandFromMessage` ile tanır ve o tura komutun kuralını ekler (ekranda yazan metin ile modele giden yönerge tek
  kaynaktan). Ders, konu ya da kişi adı yok.
*/

export type MoreCommandId = "private_lesson" | "explain_simple" | "key_concepts" | "connect_concepts" | "find_gaps" | "check_understanding";

export type MoreCommand = {
  id: MoreCommandId;
  /** Menüde görünen ad (sonundaki ▸ ekranda çizilir). */
  label: string;
  /** Öğrencinin mesajı olarak giden metin. */
  prompt: string;
};

export const MORE_COMMANDS: readonly MoreCommand[] = [
  {
    id: "private_lesson",
    label: "Bana özel ders ver",
    prompt: "Bana bu konuda özel ders ver: kısa kısa anlat, arada bana soru sorarak ilerleyelim.",
  },
  {
    id: "explain_simple",
    label: "5 yaşındaymışım gibi anlat",
    prompt: "Bunu bana 5 yaşındaymışım gibi, çok basit anlat.",
  },
  {
    id: "key_concepts",
    label: "Temel kavramları vurgula",
    prompt: "Bu konunun temel kavramlarını vurgula: hangileri olmazsa olmaz, kısaca ne anlama geliyorlar?",
  },
  {
    id: "connect_concepts",
    label: "Kavramlar arasında bağlantı kur",
    prompt: "Bu konudaki kavramlar arasında bağlantı kur: hangisi hangisine nasıl bağlanıyor?",
  },
  {
    id: "find_gaps",
    label: "Eksik olduğum noktaları bul",
    prompt: "Eksik olduğum noktaları bul: nerelerde zorlandığıma bakıp önce neyi kapatmamız gerektiğini söyle.",
  },
  {
    id: "check_understanding",
    label: "Konuyu ne kadar iyi anladığımı test et",
    prompt: "Konuyu ne kadar iyi anladığımı test et: bana birer birer soru sor, cevabımı bekle.",
  },
];

const fold = (text: string) => text.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
const BY_PROMPT = new Map(MORE_COMMANDS.map((command) => [fold(command.prompt), command]));

/** Mesaj menüdeki bir komutun metniyse komutu döndürür (öğrenci metni elle değiştirdiyse komut sayılmaz). */
export function moreCommandFromMessage(message: string): MoreCommand | null {
  const text = fold(String(message ?? "").replace(/^\s*\[[^\]\n]{1,40}\]\s*/, ""));
  return BY_PROMPT.get(text) ?? null;
}

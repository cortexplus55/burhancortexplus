import type { StudioToolId } from "@/lib/learning/studio-next";

/**
 * Stüdyoların açılış sohbeti.
 *
 * Stüdyolar eskiden tek satırlık bir formla açılıyordu: "Konu" yazan bir kutu
 * ve bir düğme. Boş kutu, ne yazacağını bilmeyen öğrenciyi orada bırakıyordu.
 * Şimdi öğretmen soruyu soruyor ve üç somut örnek veriyor; öğrenci ya birine
 * dokunuyor ya kendi konusunu yazıyor.
 *
 * Öneriler bilerek farklı derslerden: tek dersten üç örnek verirsen stüdyonun
 * yalnızca o derse çalıştığı sanılıyor.
 */
export type StudioIntro = {
  /** Öğretmenin ilk mesajı — soru sormalı, tanıtım yapmamalı. */
  greeting: string;
  /** Dokununca doğrudan başlatan örnekler. */
  suggestions: string[];
};

export const STUDIO_INTRO: Record<StudioToolId, StudioIntro> = {
  podcast: {
    greeting:
      "Seninle bir podcast hazırlayalım 🎙️ Hangi konu üzerine olsun? İstersen üzerinde çalıştığın konuyu anlat, istersen aklındaki başlığı yaz — gerisini ben kurarım.",
    suggestions: ["Hücre bölünmesi", "Türev nedir, ne işe yarar?", "Kurtuluş Savaşı"],
  },
  quiz: {
    greeting:
      "Seni test edelim. Hangi konudan sorular hazırlayayım? Konuyu ne kadar dar yazarsan sorular o kadar isabetli olur.",
    suggestions: ["Üslü sayılar", "Newton'un hareket yasaları", "İngilizce zamanlar"],
  },
  flash: {
    greeting:
      "Tekrar kartları hazırlayalım. Hangi konunun kavramlarını ezberlemek istiyorsun?",
    suggestions: ["Türev kuralları", "Organeller ve görevleri", "Tarih terimleri"],
  },
  tf: {
    greeting:
      "Doğru–yanlış turu kuralım. Hangi konuda iddiaları test edelim? Karıştırdığın konular bu turda en çok işe yarar.",
    suggestions: ["Fotosentez", "Asit ve bazlar", "Coğrafi konum"],
  },
  sozlu: {
    greeting:
      "Sözlü sınav provası yapalım. Hangi konudan soracağım? Gerçek sözlü gibi olacak: soru gelir, sen konuşursun, sonunda not alırsın.",
    suggestions: ["Kurtuluş Savaşı", "Hücre zarından taşıma", "Edebi akımlar"],
  },
  yazili: {
    greeting:
      "Yazılı hazırlayalım. Hangi konudan sekiz soru çıkarayım? Sonunda notunu ve eksik kaldığın yerleri de vereceğim.",
    suggestions: ["Fonksiyonlar", "Elektrik devreleri", "Paragraf soruları"],
  },
};

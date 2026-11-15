import { calloutOf, quoteBlockText } from "@/lib/markdown-core";

/*
  Faz 13A · ÖĞRETMEN HİSSİ (teacher.v2), 15 Kasım 2026. Burhan D1 onayı: "13A'ya geç (teacher.v2 arkasında)".
  Kaynak: docs/ogretmen-hissi/PROMPT.md §4 A ve I, EK-4, EK-6, EK-7.

  A · Tek hamle: öğretmen turu ≤90 kelime (sert tavan 110), ≤1 soru, en çok 1 destek kutusu. "Akılda kalsın" (ve onun
      "Tekrarıma ekle" düğmesi) SORU SORAN mesajda yer almaz: soru cevabı ele vermesin (EK-4). Çipler en çok 3.
  I · Öğrenciye iç sistem dili yok ("hazırlık parçaları", "eşleşen bölüm bulunamadı", "kaynak bloğu").

  İki katman: istem (bu turun kuralı, `ONE_MOVE_MARKUP`) ve kod (`settleOneMove`, modelsiz, yalnız siler; cümle
  yazmaz). Kod akan taslağı değiştirmez: bitişte kayıtlı metin akan metnin yerini alır (EK-7, öğrencinin gördüğü ve
  saklanan metin aynı). Model çağrısı ya da bekleten denetim eklenmez (EK-6). Bayrak kapalıyken hiçbiri çalışmaz.
*/

export const TEACHER_V2_FLAG = "teacher.v2";

/** Tek hamlenin sınırları (PROMPT §4 A). */
export const ONE_MOVE_WORDS = 90;
export const ONE_MOVE_HARD_CAP = 110;
export const ONE_MOVE_MAX_CHIPS = 3;

/**
 * teacher.v2 açıkken `CHAT_TEACHING_MARKUP`'ın yerine geçen öğretim dili. İşaretler aynı (ekran aynı çizer); değişen:
 * kutu zorunluluğu kalktı (en çok bir), "Akılda kalsın" yalnız soru sormayan mesajda, tur kısa ve tek hamle.
 */
export const ONE_MOVE_MARKUP =
  "TEK HAMLE (kesin; bu kural öbür biçim kurallarından önce gelir):\n" +
  `- Bu turun cevabı en çok ${ONE_MOVE_WORDS} kelime (asla ${ONE_MOVE_HARD_CAP}'u geçme). Bir şey öğret ya da bir şey sor; ikisini birden uzatma.\n` +
  "- En çok BİR soru sor ve mesajı o soruyla bitir. Soru sorduğun mesajda cevabı söyleyen ya da ele veren hiçbir şey yazma: sonuç, formülün o soruya uygulanmış hâli, kutu, örnek çözüm yok.\n" +
  "- En çok BİR destek kutusu kullan (yalnız biri: 💡 Benzetme, ⚠️ Sık hata, 📌 Sınav ipucu, 🤔 Neden böyle?, 🧠 Ezber kodu). Kutu zorunlu değil; gerekmiyorsa hiç koyma.\n" +
  "- \"> ✅ Akılda kalsın:\" kutusunu YALNIZ soru sormayan mesajda kullan: öğrenci az önce doğru cevap verdiyse ya da konuyu kapatıyorsan. Soru soran mesajda asla.\n" +
  "- Sınav ipucu kutusu ana metnin söylediğini tekrar etmez; yeni bir şey söylemiyorsa koyma.\n" +
  "- Kilit bilgi cümlenin içinde ==…== (en çok 1), terim **koyu**, tek başına formül kendi satırında $$…$$.\n" +
  "- Öğrenciye iç sistem dili yazma: 'hazırlık parçaları', 'eşleşen bölüm/parça bulunamadı', 'kaynak bloğu', 'pasaj', 'not bu sohbette' gibi ifadeler yok. Konu öğrencinin notunda yoksa yalnız şunu söyle: 'Bu konu notunda yok; ders kitabı bilgisiyle anlatıyorum.'\n" +
  "- Seçili bağlam 'Genel' ise öğrencinin hazırlıklarının ya da derslerinin adını anma.\n" +
  "- Uzlaşıma bağlı konularda (işaret uzlaşımı, birim sistemi, tanım farkı) önce öğrencinin dersinin hangi uzlaşımı kullandığını sor ya da iki uzlaşımı da adıyla yaz; birini sessizce varsayma.";

/** Destek kutuları (Akılda kalsın hariç): en çok biri kalır. */
const SUPPORT_KINDS = new Set(["exam", "mistake", "analogy", "why", "mnemonic"]);

/** Öğrenciye gitmemesi gereken iç sistem dili (I). Cümle silinir; yerine cümle yazılmaz. */
const INTERNAL_LANGUAGE =
  /hazırlık\s+parçalar|eşleşen\s+(?:bölüm|parça)|kaynak\s+bloğu|notundaki\s+parçalar|pasajlarda|not\s+bu\s+sohbette\s+görünmüyor|dosyayı\s+yeniden\s+yükle/iu;

type Block = { text: string; kind: string | null; quoted: boolean };

function blocksOf(text: string): Block[] {
  return text.split(/\n{2,}/).map((raw) => {
    const quoted = /^\s*>/.test(raw);
    const inner = quoted ? quoteBlockText(raw.trim()) ?? "" : "";
    return { text: raw, quoted, kind: quoted ? calloutOf(inner)?.kind ?? null : null };
  });
}

/** Metnin soru sorup sormadığı: kutuların dışındaki düz metinde "?" ile biten bir cümle. */
export function asksQuestion(text: string): boolean {
  return blocksOf(text)
    .filter((block) => !block.quoted)
    .some((block) => /\?\s*(?:\*\*)?\s*$/mu.test(block.text.replace(/\$\$[\s\S]*?\$\$/g, "")));
}

export function wordCount(text: string): number {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/[>#*=_`|-]/g, " ")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export type OneMoveResult = {
  text: string;
  /** Soru soran mesajdan çıkarılan "Akılda kalsın". */
  removedRemember: boolean;
  /** Birden fazla destek kutusundan çıkarılanlar. */
  removedBoxes: number;
  /** Silinen iç sistem dili cümleleri. */
  internalStripped: number;
};

function stripInternalLanguage(block: string): { text: string; count: number } {
  let count = 0;
  const sentences = block.split(/(?<=[.!?])\s+/u);
  const kept = sentences.filter((sentence) => {
    if (INTERNAL_LANGUAGE.test(sentence)) {
      count += 1;
      return false;
    }
    return true;
  });
  return { text: kept.join(" "), count };
}

/**
 * Tek hamle kuralının kod katmanı (yalnız siler): soru soran mesajda "Akılda kalsın" çıkar; birden çok destek kutusu
 * varsa ilki kalır; iç sistem dili cümlesi silinir. Kelime tavanında kod kesmez (cümleyi yarım bırakmamak için); ölçü
 * günlüğe gider.
 */
export function settleOneMove(text: string): OneMoveResult {
  const question = asksQuestion(text);
  let removedRemember = false;
  let removedBoxes = 0;
  let internalStripped = 0;
  let supportSeen = 0;
  const kept: string[] = [];
  for (const block of blocksOf(text)) {
    if (block.kind === "remember") {
      if (question) {
        removedRemember = true;
        continue;
      }
    } else if (block.kind && SUPPORT_KINDS.has(block.kind)) {
      supportSeen += 1;
      if (supportSeen > 1) {
        removedBoxes += 1;
        continue;
      }
    }
    if (!block.quoted) {
      const cleaned = stripInternalLanguage(block.text);
      internalStripped += cleaned.count;
      if (cleaned.text.trim()) kept.push(cleaned.text);
      continue;
    }
    kept.push(block.text);
  }
  return { text: kept.join("\n\n"), removedRemember, removedBoxes, internalStripped };
}

/** Turun anonim ölçüsü (PROMPT §9): kişisel içerik yok, yalnız sayılar. */
export function oneMoveMetrics(text: string): { words: number; questions: number; boxes: number; remember: boolean } {
  const blocks = blocksOf(text);
  const plain = blocks.filter((block) => !block.quoted).map((block) => block.text).join("\n");
  return {
    words: wordCount(text),
    questions: (plain.replace(/\$\$[\s\S]*?\$\$/g, "").match(/\?/g) ?? []).length,
    boxes: blocks.filter((block) => block.kind && SUPPORT_KINDS.has(block.kind)).length,
    remember: blocks.some((block) => block.kind === "remember"),
  };
}

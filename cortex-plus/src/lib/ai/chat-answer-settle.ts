/**
 * Sohbet cevabının son düzeni (15 Kasım 2026, ürün sahibi; canlı stres testi). Saf: istemci de kullanır.
 *
 * 1. Sahipsiz atıf: metindeki `[2]` ancak ekranda 2 numaralı bir kaynak kartı varsa kalır. Kaynak denetimi bir kaynağı
 *    düşürünce ya da hiç kaynak kartı çıkmayınca öğrenci karşılığı olmayan `[2]` görüyordu.
 * 2. Pedagojik bölüm etiketi: "Materyal dışı / Genel bilgiden" etiketi BİLGİ içindir. Benzetme kutusu, soru ve
 *    yönlendirme cümlesinden ibaret bir bölüm etiketsiz kalır; etiketli bilgi bölümü kalmayınca "kaynakta yok" satırı da
 *    düşer. Kod cümle yazmaz, yalnız etiket satırını siler.
 */

/** Markdown bağlantısı (`[1](/x)`) atıf değildir; yalnız çıplak `[n]`. */
const INLINE_REF = /[ \t]?\[(\d{1,2})\](?!\()/g;

/** Metinde geçen çıplak atıf numaraları. */
export function inlineReferences(text: string): number[] {
  return [...new Set([...text.matchAll(INLINE_REF)].map((match) => Number(match[1])))];
}

/**
 * Karşılığı olmayan atıfları siler. `allowed` boşsa bütün çıplak atıflar gider. Kod bloğu (```) içine dokunulmaz.
 */
export function stripOrphanCitations(text: string, allowed: Iterable<number> = []): string {
  const keep = new Set(allowed);
  return text
    .split(/(```[\s\S]*?```)/)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(INLINE_REF, (match, ref: string) => (keep.has(Number(ref)) ? match : "")),
    )
    .join("");
}

const OUTSIDE_LINE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Materyal dışı|Genel bilgiden|Outside the material)(?:\s*—\s*kaynak gösterilmez)?\s*:?(?:\*\*)?\s*:?\s*/i;
const DOC_LINE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Belgeden\s*:?(?:\*\*)?\s*:?\s*/i;
/** Etiket satırı yalnız etiketse ya da etiket satırın başındaysa (ardından metin). */
const IS_OUTSIDE_LABEL = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Materyal dışı|Genel bilgiden|Outside the material)(?:\s*—\s*kaynak gösterilmez)?\s*(?::|(?:\*\*)?\s*$)/i;
const IS_DOC_LABEL = /^\s*(?:#{1,6}\s*)?(?:\*\*)?Belgeden\b\s*(?::|(?:\*\*)?\s*$)/i;
const ABSENCE_LINE = /^\s*(?:Bu,\s*(?:yüklediğin kaynakta yok\s*[—–-]\s*genel bilgiyle anlatıyorum\s*:?|belgede yok\.?)|This is not in the material\.?)\s*$/i;

/** `inline`: etiketin ardında aynı satırda metin vardı ("Materyal dışı: …"). */
type Segment = { kind: "plain" | "doc" | "outside"; label: string; inline: boolean; lines: string[] };

function segments(text: string): Segment[] {
  const out: Segment[] = [{ kind: "plain", label: "", inline: false, lines: [] }];
  for (const line of text.split("\n")) {
    const kind = IS_OUTSIDE_LABEL.test(line) ? "outside" : IS_DOC_LABEL.test(line) ? "doc" : null;
    if (!kind) {
      out[out.length - 1].lines.push(line);
      continue;
    }
    const rest = line.replace(kind === "outside" ? OUTSIDE_LINE : DOC_LINE, "");
    const inline = Boolean(rest.trim());
    out.push({ kind, label: inline ? line.slice(0, line.length - rest.length) : line, inline, lines: inline ? [rest] : [] });
  }
  return out;
}

/**
 * Bölüm yalnız öğretim aracından mı oluşuyor: benzetme kutusu (`> 💡`), soru cümlesi, sunucu işareti. Bilgi taşıyan
 * (rakam, formül, tanım cümlesi) bir satır varsa bölüm bilgi bölümüdür ve etiketi kalır.
 */
export function pedagogicalOnly(body: string): boolean {
  let factual = "";
  let inAnalogy = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      inAnalogy = false;
      continue;
    }
    if (/^>\s*💡/u.test(line)) {
      inAnalogy = true;
      continue;
    }
    if (inAnalogy && line.startsWith(">")) continue;
    inAnalogy = false;
    if (/^\[\[[^\]]+\]\]$/.test(line)) continue;
    // Soru cümleleri öğretim aracıdır (kontrol sorusu, davet).
    factual += ` ${line.replace(/[^.!?\n]*\?/g, " ")}`;
  }
  const letters = factual.replace(/[^\p{L}]/gu, "").length;
  return letters < 40 && !/\d|=/.test(factual);
}

/**
 * Pedagojik bölümlerin "Materyal dışı" etiketini siler; etiketli bilgi bölümü kalmazsa "kaynakta yok" satırını da.
 * `redirect`: tur bir stüdyo yönlendirmesi (test, kart, deneme isteği); bu turda belge-dışı bilgi yazılmaz, rakamsız
 * ve formülsüz bölümün etiketi kalkar.
 */
export function settlePedagogicalLabels(text: string, options: { redirect?: boolean } = {}): string {
  if (!/Materyal dışı|Genel bilgiden|Outside the material|kaynakta yok|belgede yok|not in the material/i.test(text)) {
    return text;
  }
  const parts = segments(text);
  let labeledOutside = 0;
  let quieted = 0;
  const kept = parts.map((part) => {
    if (part.kind !== "outside") return part;
    const body = part.lines.join("\n");
    const quiet = pedagogicalOnly(body) || (options.redirect === true && !/\d|=/.test(body));
    if (quiet) {
      quieted += 1;
      return { ...part, label: "" };
    }
    labeledOutside += 1;
    return part;
  });
  // "Kaynakta yok" satırı yalnız etiketi kalkan bölüm içindi: başka etiketli bilgi bölümü varsa ya da hiçbir bölümün
  // etiketi kalkmadıysa (model bütün cevabı genel bilgi diye açıkladı) satır kalır.
  // Yönlendirme turunda bilgi anlatılmaz; "kaynakta yok" satırı orada hiç anlamlı değil.
  const dropAbsence = labeledOutside === 0 && (quieted > 0 || options.redirect === true);
  return kept
    .map((part) => {
      const lines = dropAbsence ? part.lines.filter((line) => !ABSENCE_LINE.test(line)) : part.lines;
      if (!part.label) return lines.join("\n");
      if (part.inline && lines.length) return [`${part.label}${lines[0]}`, ...lines.slice(1)].join("\n");
      return [part.label, ...lines].join("\n");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

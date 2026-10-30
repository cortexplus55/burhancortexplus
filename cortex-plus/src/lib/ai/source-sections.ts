/**
 * "Belgem + Genel Bilgi" modunda model yanıtı iki bölüme ayırır:
 * `Belgeden:` ve `Genel bilgiden:`. Bu etiketler düz metin olarak geliyordu;
 * öğrenci hangi cümlenin belgeden geldiğini ayırt edemiyordu.
 *
 * Bu dönüşüm yalnızca satır başındaki etiketleri Markdown başlığa çevirir;
 * içerik ve kaynak numaraları değişmez. Etiket yoksa metin aynen döner.
 */
const DOC_LABEL = /^\s*(?:#+\s*)?(?:\*\*)?Belgeden\s*:(?:\*\*)?\s*$/im;
const GENERAL_LABEL = /^\s*(?:#+\s*)?(?:\*\*)?Genel bilgiden\s*:(?:\*\*)?\s*$/im;
const OUTSIDE_LABEL = /^\s*(?:#+\s*)?(?:\*\*)?Materyal dışı\s*:(?:\*\*)?\s*$/im;
const OUTSIDE_EN_LABEL = /^\s*(?:#+\s*)?(?:\*\*)?Outside the material\s*:(?:\*\*)?\s*$/im;
const DOC_INLINE = /^\s*(?:\*\*)?Belgeden\s*:(?:\*\*)?\s*(?=\S)/im;
const GENERAL_INLINE = /^\s*(?:\*\*)?Genel bilgiden\s*:(?:\*\*)?\s*(?=\S)/im;
const OUTSIDE_INLINE = /^\s*(?:\*\*)?Materyal dışı\s*:(?:\*\*)?\s*(?=\S)/im;
const OUTSIDE_EN_INLINE = /^\s*(?:\*\*)?Outside the material\s*:(?:\*\*)?\s*(?=\S)/im;

export const DOC_HEADING = "#### Belgeden";
export const GENERAL_HEADING = "#### Genel bilgiden — kaynak gösterilmez";
/** Düz `####` başlık cümleye yapışınca ekranda ham markdown kalıyordu. */
export const OUTSIDE_HEADING = "[[rozet:Materyal dışı]]";
export const OUTSIDE_HEADING_EN = "[[rozet:Outside the material]]";

export function hasSourceSections(content: string): boolean {
  return /Belgeden\s*:/i.test(content)
    || /Genel bilgiden\s*:/i.test(content)
    || /#{1,6}\s*(?:Belgeden|Genel bilgiden)/i.test(content)
    || /Materyal dışı\s*:/i.test(content)
    || /Outside the material\s*:/i.test(content)
    || /#{1,6}\s*Materyal dışı/i.test(content)
    || /#{1,6}\s*Outside the material/i.test(content);
}

/**
 * Başlık her zaman kendi satırında, önü ve arkası boş (30 Ekim 2026, canlı tur): model ya da önceki mesaj başlığı
 * cümlenin arkasına yapıştırınca ("… belirtiliyor.#### Genel bilgiden") ekranda ham "####" kalıyordu.
 */
function isolateHeadings(content: string): string {
  return content.replace(
    /[ \t]*(#{1,6}[ \t]*(?:Belgeden|Genel bilgiden(?:[ \t]*—[ \t]*kaynak gösterilmez)?))[ \t]*:?[ \t]*\n*/g,
    "\n\n$1\n\n",
  );
}

/** Cevap yalnız genel bilgiden mi (belge bölümü yok): kaynak çipleri gösterilmez. */
export function generalOnlyAnswer(content: string): boolean {
  return /Genel bilgiden/i.test(content) && !/Belgeden/i.test(content);
}

export function formatSourceSections(content: string): string {
  if (!hasSourceSections(content)) return content;
  return isolateHeadings(content)
    .replace(/#{1,6}\s*Materyal dışı/gi, OUTSIDE_HEADING)
    .replace(/#{1,6}\s*Outside the material/gi, OUTSIDE_HEADING_EN)
    .replace(DOC_LABEL, DOC_HEADING)
    .replace(GENERAL_LABEL, GENERAL_HEADING)
    .replace(OUTSIDE_LABEL, OUTSIDE_HEADING)
    .replace(OUTSIDE_EN_LABEL, OUTSIDE_HEADING_EN)
    .replace(DOC_INLINE, `${DOC_HEADING}\n\n`)
    .replace(GENERAL_INLINE, `${GENERAL_HEADING}\n\n`)
    .replace(OUTSIDE_INLINE, `\n\n${OUTSIDE_HEADING}\n\n`)
    .replace(OUTSIDE_EN_INLINE, `\n\n${OUTSIDE_HEADING_EN}\n\n`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

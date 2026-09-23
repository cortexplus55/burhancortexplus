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
const DOC_INLINE = /^\s*(?:\*\*)?Belgeden\s*:(?:\*\*)?\s*(?=\S)/im;
const GENERAL_INLINE = /^\s*(?:\*\*)?Genel bilgiden\s*:(?:\*\*)?\s*(?=\S)/im;

export const DOC_HEADING = "#### Belgeden";
export const GENERAL_HEADING = "#### Genel bilgiden — kaynak gösterilmez";

export function hasSourceSections(content: string): boolean {
  return /Belgeden\s*:/i.test(content) || /Genel bilgiden\s*:/i.test(content);
}

export function formatSourceSections(content: string): string {
  if (!hasSourceSections(content)) return content;
  return content
    .replace(DOC_LABEL, DOC_HEADING)
    .replace(GENERAL_LABEL, GENERAL_HEADING)
    .replace(DOC_INLINE, `${DOC_HEADING}\n\n`)
    .replace(GENERAL_INLINE, `${GENERAL_HEADING}\n\n`);
}

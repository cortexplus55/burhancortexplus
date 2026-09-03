import katex from "katex";

/**
 * Model çıktısındaki LaTeX'i güvenli HTML'e çevirir.
 *
 * Prompt'lar (bkz. `tutor-style.ts`) modele LaTeX kullanmasını söylüyordu ama
 * hiçbir renderer bunu işlemiyordu; ekranda ham `$...$` görünüyordu. Bu modül
 * hem sohbet markdown'ı hem ders gövdesi tarafından paylaşılır.
 *
 * Güvenlik: metin parçaları çağıran tarafta escape edilir; buradan yalnızca
 * KaTeX'in kendi ürettiği işaretleme döner. `trust: false` ile `\href`,
 * `\htmlClass` gibi HTML enjekte edebilen komutlar kapalıdır.
 */

export type MathSegment =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

/**
 * `$$...$$` (blok) ve `$...$` (satır içi) parçalarını ayırır.
 *
 * Tek `$` para birimi olarak da kullanılabildiği için, satır içi eşleşme
 * yalnızca açılıştan hemen sonra ve kapanıştan hemen önce boşluk olmayan bir
 * karakter varsa geçerli sayılır — "5 $ ve 10 $" gibi metinler bozulmaz.
 */
export function splitMath(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g;
  let cursor = 0;

  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: input.slice(cursor, match.index) });
    }
    const block = match[1];
    const inline = match[2];
    if (typeof block === "string") {
      segments.push({ type: "math", value: block.trim(), display: true });
    } else if (typeof inline === "string") {
      segments.push({ type: "math", value: inline.trim(), display: false });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < input.length) {
    segments.push({ type: "text", value: input.slice(cursor) });
  }
  return segments;
}

/** Formülü KaTeX ile render eder; hatalı LaTeX çökertmez, kırmızı gösterilir. */
export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: false,
      output: "html",
    });
  } catch {
    // KaTeX throwOnError:false ile de nadiren fırlatabiliyor; ham metne düş.
    return escapeHtml(tex);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Metinde işlenmeyi bekleyen matematik var mı — gereksiz işten kaçınmak için. */
export function hasMath(input: string): boolean {
  return /\$[^$\n]/.test(input);
}

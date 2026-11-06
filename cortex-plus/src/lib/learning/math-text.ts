// KaTeX'in biçimi formülü çizen modülle gelir (6 Kasım 2026): kök düzende her pazarlama sayfasına yükleniyordu.
import "katex/dist/katex.min.css";
import katex from "katex";
import "katex/contrib/mhchem";
import { escapeHtml, formulaStepNeedsKatex, plainFormulaStepHtml, textifyFormulaWords } from "@/lib/learning/math-split";

export {
  escapeHtml,
  hasMath,
  plainMath,
  splitMath,
  textifyFormulaWords,
  type MathSegment,
} from "@/lib/learning/math-split";

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
 *
 * mhchem: `\ce{H2O}` kimya formülleri için.
 */

/** Formülü KaTeX ile render eder; hatalı LaTeX çökertmez, düz metne düşer. */
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
    return escapeHtml(tex);
  }
}

/**
 * Çizimli videonun formül adımı (30 Ekim 2026, canlı tur). TeX sözdizimi (`\`, `^`, `_`, `{}`) taşımayan adım
 * ("Genel fiyat düzeyi ↑ sürekli ve belirgin", "MV = PY") düz yazıyla çizilir: boşluk, Türkçe harf ve tahtanın yazı
 * tipi korunur. TeX taşıyan adım KaTeX'e gider; içindeki kelimeler `\text{}` olur.
 */
export function formulaStepHtml(step: string): string {
  if (formulaStepNeedsKatex(step)) return renderMath(textifyFormulaWords(step), true);
  return plainFormulaStepHtml(step);
}

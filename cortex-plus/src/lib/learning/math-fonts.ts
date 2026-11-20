/**
 * KaTeX yazı tiplerini önceden ısıtma (Faz 9, 20 Kasım 2026).
 *
 * Kusur (ürün sahibi, misafir turu 3. adım): "Formül & Kural → ÇİFT DERECELİ KÖK" kartında yalnız çıplak bir √
 * görünüyordu. Neden: KaTeX'in stil dosyası yazı tiplerini `font-display: block` ile tanımlar; tarayıcı yazı tipini
 * ancak formül ekrana ilk geldiğinde ister ve yazı tipi inene kadar (en çok ~3 sn, yavaş ağda sonra yedek yazı tipi)
 * harfleri görünmez çizer. Kök işareti ise bir SVG'dir ve hemen görünür: geriye "√" kalır. (Yazı tipi istekleri
 * 8 sn bekletilerek yerelde birebir üretildi.)
 *
 * Çare: formül ekrana gelmeden ÖNCE yazı tiplerini istemek. `document.fonts.load` yalnız stil dosyasında tanımlı bir
 * yüzü indirir; KaTeX'in stil dosyası yüklenmeden çağrılırsa hiçbir şey yapmaz (zararsız). Model ya da sunucu isteği
 * yok; yalnız tarayıcının zaten indireceği yazı tipleri erken istenir.
 */

/** Formüllerde en sık kullanılan yüzler: düz rakam ve işaretler, eğik harfler, büyük ayraçlar. */
export const MATH_FONT_FACES = ["1em KaTeX_Main", "italic 1em KaTeX_Math", "1em KaTeX_Size1"] as const;

/** Yazı tiplerini arka planda ister; tarayıcı desteklemezse ya da hata verirse sessiz. */
export function warmMathFonts(): void {
  if (typeof document === "undefined") return;
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== "function") return;
  for (const face of MATH_FONT_FACES) {
    try {
      void fonts.load(face).catch(() => undefined);
    } catch {
      /* yazı tipi listesi okunamazsa formül yine çizilir; yalnız ısıtma olmaz */
    }
  }
}

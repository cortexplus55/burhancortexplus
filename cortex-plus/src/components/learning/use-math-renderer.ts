"use client";

import * as mathText from "@/lib/learning/math-text";

/**
 * KaTeX çizici (6 Kasım 2026). Önce `import()` ile tembel yüklendi; ancak sunucuda çizilen formüller (örnek ders
 * sayfasının formül kartı, sınav sabahı kâğıdı, ders sayfası) hidrasyondan sonra parça gelene kadar ham TeX olarak
 * göründü. Bu yüzden çizici yine eşzamanlı: sunucu ve istemci aynı HTML'i üretir, yanıp sönme yok.
 *
 * Kalan kazanç: KaTeX CSS'i kökten çıktı (yalnız formül çizen bileşenler yükler) ve KaTeX'siz yardımcılar
 * `math-split.ts`'te; KaTeX yalnız formül bileşeni içeren sayfaların paketine girer.
 */
export type MathRenderer = typeof mathText;

/** Geriye dönük uyum: çizici her zaman hazır. */
export function loadMathRenderer(): Promise<MathRenderer> {
  return Promise.resolve(mathText);
}

/** `needed` doğruysa KaTeX çiziciyi döndürür, değilse `null`. */
export function useMathRenderer(needed: boolean): MathRenderer | null {
  return needed ? mathText : null;
}

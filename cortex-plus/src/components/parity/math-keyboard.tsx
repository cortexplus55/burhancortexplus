"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Matematik klavyesi.
 *
 * Önceki hâli tek sıra 19 sembollük düz bir şeritti. Astra'da bu, dört
 * kategoriye ayrılmış 30 tuşluk bir tuş takımı; ayrıca geri silme ve imleci
 * sola/sağa taşıma var — kullanıcı uzun bir ifadenin ortasına dönebiliyor.
 *
 * Tuşlar LaTeX yazıyor: mesajlar zaten KaTeX ile render ediliyor
 * (`lib/markdown.ts`), o yüzden ayrı bir matematik alanı yazmaya gerek yok.
 */

type Key = {
  /** Tuşun üzerinde görünen şey. */
  label: ReactNode;
  /** Metne eklenen LaTeX. */
  insert: string;
  /** Ekran okuyucu için — görsel etiket sembolse gerekli. */
  aria: string;
  /** Rakamlar Astra'da olduğu gibi vurgulu. */
  accent?: boolean;
};

type Category = {
  id: string;
  /** Sekme başlığı iki satır: Astra'da da öyle. */
  top: string;
  bottom: string;
  keys: Key[];
};

const sup = (base: string, exp: string): ReactNode => (
  <>
    {base}
    <sup>{exp}</sup>
  </>
);

const sub = (base: string, low: string): ReactNode => (
  <>
    {base}
    <sub>{low}</sub>
  </>
);

const frac = (top: string, bottom: string): ReactNode => (
  <span className="ap-mk-frac">
    <span>{top}</span>
    <span>{bottom}</span>
  </span>
);

const digit = (n: number): Key => ({
  label: String(n),
  insert: String(n),
  aria: String(n),
  accent: true,
});

/** Tek harf değişkenler — tekrarı azaltmak için. */
const letters = (chars: string[]): Key[] =>
  chars.map((c) => ({ label: <i>{c}</i>, insert: c, aria: `${c} harfi` }));

/** Yunan harfleri: etiket sembolün kendisi, LaTeX komutu ayrı. */
const greek = (pairs: [string, string][]): Key[] =>
  pairs.map(([glyph, command]) => ({
    label: glyph,
    insert: `\\${command} `,
    aria: command,
  }));

const CATEGORIES: Category[] = [
  {
    id: "temel",
    top: "+ −",
    bottom: "× ÷",
    keys: [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit),
      { label: <i>x</i>, insert: "x", aria: "x" },
      { label: <i>y</i>, insert: "y", aria: "y" },
      { label: <>√<i>x</i></>, insert: "\\sqrt{}", aria: "karekök" },
      { label: <><sup>n</sup>√<i>x</i></>, insert: "\\sqrt[n]{}", aria: "n. dereceden kök" },
      { label: sup("a", "2"), insert: "^{2}", aria: "kare" },
      { label: sup("x", "n"), insert: "^{}", aria: "üs" },
      { label: "(", insert: "(", aria: "parantez aç" },
      { label: ")", insert: ")", aria: "parantez kapat" },
      { label: "÷", insert: "\\div ", aria: "bölü" },
      { label: "<", insert: "<", aria: "küçüktür" },
      { label: ">", insert: ">", aria: "büyüktür" },
      { label: "×", insert: "\\times ", aria: "çarpı" },
      { label: "≤", insert: "\\le ", aria: "küçük eşit" },
      { label: "≥", insert: "\\ge ", aria: "büyük eşit" },
      { label: "−", insert: "-", aria: "eksi" },
      { label: frac("x", "y"), insert: "\\frac{}{}", aria: "kesir" },
      { label: "≠", insert: "\\neq ", aria: "eşit değil" },
      { label: ",", insert: ",", aria: "virgül" },
      { label: "=", insert: "=", aria: "eşittir" },
      { label: "+", insert: "+", aria: "artı" },
    ],
  },
  {
    id: "fonksiyon",
    top: "f(x) e",
    bottom: "log ln",
    keys: [
      { label: <i>e</i>, insert: "e", aria: "e sayısı" },
      { label: sub("log", "a"), insert: "\\log_{}", aria: "logaritma" },
      { label: "ln", insert: "\\ln ", aria: "doğal logaritma" },
      { label: <>|<i>a</i>|</>, insert: "\\left|\\right|", aria: "mutlak değer" },
      { label: sub("a", "b"), insert: "_{}", aria: "alt indis" },
      { label: "!", insert: "!", aria: "faktöriyel" },
      { label: "{", insert: "\\{", aria: "küme parantezi aç" },
      { label: "}", insert: "\\}", aria: "küme parantezi kapat" },
      { label: "[", insert: "[", aria: "köşeli parantez aç" },
      { label: "]", insert: "]", aria: "köşeli parantez kapat" },
      { label: "π", insert: "\\pi ", aria: "pi" },
      { label: "%", insert: "\\%", aria: "yüzde" },
      ...letters(["a", "b", "c", "d", "e", "f", "g", "h"]),
      ...letters(["i", "j", "k", "l", "m", "n", "o", "p", "r", "s"]),
    ],
  },
  {
    id: "trigonometri",
    top: "sin cos",
    bottom: "tan cot",
    keys: [
      { label: "sin", insert: "\\sin ", aria: "sinüs" },
      { label: "cos", insert: "\\cos ", aria: "kosinüs" },
      { label: "tan", insert: "\\tan ", aria: "tanjant" },
      { label: "cot", insert: "\\cot ", aria: "kotanjant" },
      { label: sup("sin", "-1"), insert: "\\arcsin ", aria: "arksinüs" },
      { label: sup("cos", "-1"), insert: "\\arccos ", aria: "arkkosinüs" },
      { label: sup("tan", "-1"), insert: "\\arctan ", aria: "arktanjant" },
      { label: sup("cot", "-1"), insert: "\\operatorname{arccot} ", aria: "arkkotanjant" },
      ...greek([
        ["α", "alpha"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"],
        ["ε", "epsilon"], ["ζ", "zeta"], ["η", "eta"], ["θ", "theta"],
        ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu"],
        ["ν", "nu"], ["ξ", "xi"], ["ο", "omicron"], ["ρ", "rho"],
        ["σ", "sigma"], ["τ", "tau"], ["υ", "upsilon"], ["φ", "phi"],
        ["χ", "chi"], ["ψ", "psi"],
      ]),
    ],
  },
  {
    id: "analiz",
    top: "lim dx",
    bottom: "∫ Σ ∞",
    keys: [
      { label: sub("lim", "x→a"), insert: "\\lim_{x \\to a} ", aria: "limit" },
      { label: "∫", insert: "\\int ", aria: "integral" },
      { label: <i>f′</i>, insert: "f'(x)", aria: "türev" },
      { label: <i>dx</i>, insert: "\\,dx", aria: "dx" },
      { label: "∞", insert: "\\infty ", aria: "sonsuz" },
      { label: "Σ", insert: "\\sum_{}^{}", aria: "toplam" },
      { label: frac("n", "k"), insert: "\\binom{n}{k}", aria: "kombinasyon" },
      { label: <>z̄</>, insert: "\\bar{z}", aria: "eşlenik" },
      { label: <>x⃗</>, insert: "\\vec{x}", aria: "vektör" },
      { label: "Π", insert: "\\prod_{}^{}", aria: "çarpım" },
      { label: "⟹", insert: "\\implies ", aria: "gerektirir" },
      { label: "⟺", insert: "\\iff ", aria: "ancak ve ancak" },
      { label: "∈", insert: "\\in ", aria: "elemanıdır" },
      { label: "∉", insert: "\\notin ", aria: "elemanı değildir" },
      { label: "∪", insert: "\\cup ", aria: "birleşim" },
      { label: "∩", insert: "\\cap ", aria: "kesişim" },
      { label: "∅", insert: "\\emptyset ", aria: "boş küme" },
      { label: "∧", insert: "\\land ", aria: "ve" },
      { label: "∨", insert: "\\lor ", aria: "veya" },
    ],
  },
];

export function MathKeyboard({
  onInsert,
  onBackspace,
  onMoveCaret,
  onClose,
}: {
  onInsert: (latex: string) => void;
  onBackspace: () => void;
  onMoveCaret: (direction: -1 | 1) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState(CATEGORIES[0].id);
  const category = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  return (
    <div className="ap-mk" role="group" aria-label="Matematik klavyesi">
      <div className="ap-mk-controls">
        <button
          type="button"
          className="ap-mk-ctrl"
          onClick={onBackspace}
          aria-label="Geri sil"
        >
          ⌫
        </button>
        <div className="ap-mk-caret">
          <button
            type="button"
            className="ap-mk-ctrl"
            onClick={() => onMoveCaret(-1)}
            aria-label="İmleci sola taşı"
          >
            ←
          </button>
          <button
            type="button"
            className="ap-mk-ctrl"
            onClick={() => onMoveCaret(1)}
            aria-label="İmleci sağa taşı"
          >
            →
          </button>
        </div>
        <button type="button" className="ap-mk-close" onClick={onClose}>
          Klavyeyi kapat <span aria-hidden>✕</span>
        </button>
      </div>

      <div className="ap-mk-tabs" role="tablist" aria-label="Sembol kategorileri">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active}
            className={cn("ap-mk-tab", c.id === active && "is-active")}
            onClick={() => setActive(c.id)}
          >
            <span>{c.top}</span>
            <span>{c.bottom}</span>
          </button>
        ))}
      </div>

      <div className="ap-mk-grid">
        {category.keys.map((key, i) => (
          <button
            key={`${category.id}-${i}`}
            type="button"
            className={cn("ap-mk-key", key.accent && "is-accent")}
            aria-label={key.aria}
            onClick={() => onInsert(key.insert)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}

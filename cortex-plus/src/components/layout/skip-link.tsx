"use client";

import { MAIN_CONTENT_ID } from "@/lib/ui/main-content";

/**
 * "İçeriğe atla" (20 Kasım 2026, Faz 3). Kökte, sayfanın ilk odaklanabilir öğesi; yalnız klavye odağında görünür.
 * Basınca odak ana içeriğe geçer (üst çubuğu ve menüyü tek tek gezmeden). Betik çalışmazsa bağlantının kendisi
 * aynı yere götürür.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="cx-skip-link"
      onClick={(event) => {
        // Kimliği taşımayan tek <main>'li sayfalar (ör. hata ekranı) için sayfanın <main>'i.
        const target = document.getElementById(MAIN_CONTENT_ID) ?? document.querySelector("main");
        if (!target) return;
        event.preventDefault();
        // Odaklanabilir olmayan <main> için: yalnız programla odaklanır, Tab sırasına girmez.
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
      }}
    >
      İçeriğe atla
    </a>
  );
}

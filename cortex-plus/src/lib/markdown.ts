import { renderMath } from "@/lib/learning/math-text";
import { renderMarkdownWith } from "@/lib/markdown-core";

/**
 * Markdown → güvenli HTML, formüller KaTeX'le eşzamanlı (sunucu sayfaları ve testler). Kurallar ve güvenlik
 * notları `markdown-core.ts`te; istemci bileşeni (`components/markdown.tsx`) aynı çekirdeği KaTeX'i tembel
 * yükleyerek kullanır (6 Kasım 2026).
 */
export function renderMarkdownToHtml(content: string): string {
  return renderMarkdownWith(content, renderMath);
}

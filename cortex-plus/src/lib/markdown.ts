import { escapeHtml, renderMath, splitMath } from "@/lib/learning/math-text";

/**
 * Metin biçimlendirmesi — girdi önce escape edilir, sonra sabit bir izin
 * listesi yeniden uygulanır.
 */
function formatText(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/**
 * Satır içi içerik: önce LaTeX parçaları ayrılır (KaTeX kendi güvenli
 * işaretlemesini üretir), kalan metin escape edilip biçimlendirilir. Formül
 * gövdesi escape'e girmez — aksi hâlde `\frac{a}{b}` içindeki karakterler
 * bozulurdu.
 */
function renderInline(text: string, breaks = false) {
  return splitMath(text)
    .map((segment) => {
      if (segment.type === "math") {
        return renderMath(segment.value, segment.display);
      }
      const html = formatText(segment.value);
      // Satır sonu dönüşümü yalnızca metne uygulanır; KaTeX çıktısına dokunmaz.
      return breaks ? html.replace(/\n/g, "<br />") : html;
    })
    .join("");
}

/**
 * Everything is escaped first and only a fixed allow-list of inline formatting
 * is re-applied, so model output can never inject markup or event handlers.
 * Math is the one exception: it is handed to KaTeX with `trust: false`, which
 * emits its own markup and rejects HTML-injecting commands like `\href`.
 */
export function renderMarkdownToHtml(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      if (trimmed.startsWith("```")) {
        const code = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
        return `<pre class="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>${escapeHtml(
          code,
        )}</code></pre>`;
      }

      if (/^#{1,3}\s/.test(trimmed)) {
        const level = trimmed.match(/^#+/)?.[0].length ?? 1;
        const size = level === 1 ? "text-lg" : level === 2 ? "text-base" : "text-sm";
        return `<p class="${size} font-semibold">${renderInline(
          trimmed.replace(/^#+\s*/, ""),
        )}</p>`;
      }

      if (/^(\d+\.|[-*])\s/.test(trimmed)) {
        const ordered = /^\d+\./.test(trimmed);
        const items = trimmed
          .split("\n")
          .map((line) => line.replace(/^(\d+\.|[-*])\s*/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${renderInline(item)}</li>`)
          .join("");
        return ordered
          ? `<ol class="list-decimal space-y-1 pl-5">${items}</ol>`
          : `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
      }

      return `<p>${renderInline(trimmed, true)}</p>`;
    })
    .join("");
}

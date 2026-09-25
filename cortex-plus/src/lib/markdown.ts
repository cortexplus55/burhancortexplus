import { escapeHtml, renderMath, splitMath } from "@/lib/learning/math-text";

/**
 * Metin biçimlendirmesi — girdi önce escape edilir, sonra sabit bir izin
 * listesi yeniden uygulanır.
 */
function formatText(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    /*
      Yalnızca site içi göreli bağlantı: `/dokumanlar/…?page=3#belge-onizleme`.
      Sunucu kaynak listesini bu biçimde üretiyor (chat route → citationHref);
      23 Eylül 2026'da canlıda ham `[ad](/yol)` metni olarak göründü, öğrenci
      kaynağa tıklayamıyordu. `//host`, `https:`, `javascript:` bilerek eşleşmez
      — model çıktısı dış adrese götüremez. Metin zaten escape edilmiş; href
      içinde `&amp;` tarayıcı tarafından geri çözülür.
    */
    .replace(
      /\[([^\]\n]+)\]\((\/(?!\/)[^\s)]*)\)/g,
      '<a href="$2" class="underline underline-offset-2 hover:opacity-80">$1</a>',
    );
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
const LIST_LINE = /^\s*(?:\d+\.|[-*])\s/;

/*
  "Kaynaklar:\n- [a](/x)" gibi bloklarda başlık satırı ile liste aynı
  paragrafta kalıyordu. Liste satırları ayrı bloğa alınır ki liste kuralı
  yakalasın.
*/
/**
 * "için:1. hesaplayın.2. bölün.3. seçin" gibi yapışık adımları gerçek listeye ayırır.
 * Liste, satır başında `1.` ile başlayan bloklardan üretiliyor; arada satır sonu yoksa
 * hepsi tek paragrafta kalıyordu.
 */
function expandGluedLists(content: string): string {
  return content.replace(
    /([:.])[ \t]*(1[.)][ \t]*\S[\s\S]*?)(?=\n\s*\n|$)/g,
    (full, punct: string, listBody: string) => {
      if (!/[.!?]\s*2[.)][ \t]*\S/.test(listBody) && !/\S2[.)][ \t]/.test(listBody)) return full;
      let list = listBody.replace(/([.!?])[ \t]*(?=[2-9]\d?[.)][ \t]*\S)/g, "$1\n");
      list = list.replace(/^(\d+[.)][^\n]*[.!?])[ \t]*([A-ZÇĞİÖŞÜ])/gm, "$1\n\n$2");
      return `${punct}\n\n${list}`;
    },
  );
}

function splitTrailingList(block: string): string[] {
  const lines = block.split("\n");
  let start = lines.length;
  while (start > 0 && LIST_LINE.test(lines[start - 1])) start -= 1;
  if (start === 0 || start === lines.length) return [block];
  return [lines.slice(0, start).join("\n"), lines.slice(start).join("\n")];
}

export function renderMarkdownToHtml(content: string): string {
  return expandGluedLists(content)
    .split(/\n{2,}/)
    .flatMap(splitTrailingList)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      if (trimmed.startsWith("```")) {
        const code = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
        return `<pre class="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>${escapeHtml(
          code,
        )}</code></pre>`;
      }

      if (/^#{1,6}\s/.test(trimmed)) {
        const level = trimmed.match(/^#+/)?.[0].length ?? 1;
        const size = level === 1 ? "text-lg" : level === 2 ? "text-base" : "text-sm";
        return `<p class="${size} font-semibold">${renderInline(
          trimmed.replace(/^#+\s*/, ""),
        )}</p>`;
      }

      if (/^(\d+\.|[-*])\s/.test(trimmed)) {
        const ordered = /^\d+\./.test(trimmed);
        const items = trimmed
          .split(/\n(?=\s*(?:\d+\.|[-*])\s)/)
          .map((line) => line.replace(/^(\d+\.|[-*])\s*/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${renderInline(item, true)}</li>`)
          .join("");
        return ordered
          ? `<ol class="list-decimal space-y-1 pl-5">${items}</ol>`
          : `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
      }

      return `<p>${renderInline(trimmed, true)}</p>`;
    })
    .join("");
}

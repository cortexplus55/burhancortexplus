import { escapeHtml, splitMath } from "@/lib/learning/math-split";

/**
 * Markdown çizicinin KaTeX'siz çekirdeği (6 Kasım 2026). Formül çizici dışarıdan verilir: sunucu
 * (`renderMarkdownToHtml`) KaTeX'i doğrudan, sohbet bileşeni yalnız formül varsa tembel yükleyerek verir.
 */
export type MathRender = (tex: string, display: boolean) => string;

/**
 * Metin biçimlendirmesi — girdi önce escape edilir, sonra sabit bir izin
 * listesi yeniden uygulanır.
 */
function formatText(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    /*
      Kilit bilgi (8 Kasım 2026, sohbet öğretim dili; dersteki EMPHASIS_RULE ile aynı işaret): ==…== turuncu
      fosforlu kalem. İç kısım boşlukla başlayıp bitemez ve "=" taşımaz: "a == b" gibi kod ya da eşitlik vurgu sayılmaz.
    */
    .replace(/==(?![\s=])([^=\n]{1,160}?)(?<![\s=])==/g, '<mark class="cp-key">$1</mark>')
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    /*
      Yalnızca site içi göreli bağlantı: `/dokumanlar/…?page=3#belge-onizleme`.
      Sunucu kaynak listesini bu biçimde üretiyor (chat route → citationHref);
      23 Eylül 2026'da canlıda ham `[ad](/yol)` metni olarak göründü, öğrenci
      kaynağa tıklayamıyordu. `//host`, `https:`, `javascript:` bilerek eşleşmez
      — model çıktısı dış adrese götüremez. Metin zaten escape edilmiş; href
      içinde `&amp;` tarayıcı tarafından geri çözülür. Ters bölü de yasak
      (6 Kasım 2026): tarayıcı `/\evil.com`'u `//evil.com` gibi okuyup dış
      adrese gider.
    */
    .replace(
      /\[([^\]\n]+)\]\((\/(?![/\\])[^\s)\\]*)\)/g,
      '<a href="$2" class="underline underline-offset-2 hover:opacity-80">$1</a>',
    );
}

/**
 * Satır içi içerik: önce LaTeX parçaları ayrılır (KaTeX kendi güvenli
 * işaretlemesini üretir), kalan metin escape edilip biçimlendirilir. Formül
 * gövdesi escape'e girmez — aksi hâlde `\frac{a}{b}` içindeki karakterler
 * bozulurdu.
 */
function renderInline(text: string, math: MathRender, breaks = false) {
  return splitMath(text)
    .map((segment) => {
      if (segment.type === "math") {
        return math(segment.value, segment.display);
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
const LIST_ITEM_SPLIT = /\n(?=\s*(?:\d+\.|[-*])\s)/;

/**
 * Numaralı liste mi, Türkçe sıra sayısı mı ("2. ay", "6. ay", "18. ayda")? Liste sırayla gider
 * ve kendi numarasından başlar (`start`); sayılar atlıyorsa satırlar olduğu gibi yazılır. Liste
 * sanılıp 1, 2, 3 diye yeniden numaralanırsa gerçek sayı kaybolur — kıyas ürününün dersinde
 * "2 ay / 6 ay / 9 ay" böyle "1 Ay / 2 Ay / 3 Ay" oldu (18 Ekim 2026, yan yana bakıldı).
 */
function orderedListStart(lines: string[]): number | null {
  const numbers = lines.map((line) => Number(line.match(/^\s*(\d+)\./)?.[1]));
  const first = numbers[0];
  if (!Number.isFinite(first)) return null;
  return numbers.every((value, index) => value === first + index) ? first : null;
}

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
    /([:.])[ \t]*(1[.)](?!\d)[ \t]*\S[\s\S]*?)(?=\n\s*\n|$)/g,
    (full, punct: string, listBody: string) => {
      if (!/[.!?]\s*2[.)](?!\d)[ \t]*\S/.test(listBody) && !/\D2[.)][ \t]/.test(listBody)) return full;
      let list = listBody.replace(/([.!?])[ \t]*(?=[2-9]\d?[.)](?!\d)[ \t]*\S)/g, "$1\n");
      list = list.replace(/^(\d+[.)][^\n]*[.!?])[ \t]*([A-ZÇĞİÖŞÜ])/gm, "$1\n\n$2");
      return `${punct}\n\n${list}`;
    },
  );
}

/**
 * Alıntı satırları bir arada ve çevresinden boş satırla ayrık kalsın: model kutuyu paragrafın hemen altına yazınca
 * paragrafla tek bloğa düşüyordu; kutunun içindeki boş satır (">") da kutuyu bölmesin.
 */
function separateQuoteBlocks(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    const isQuote = /^\s*>/.test(line);
    if (isQuote && !inQuote && out.length && out[out.length - 1].trim()) out.push("");
    if (!isQuote && inQuote && line.trim()) out.push("");
    out.push(isQuote && !line.replace(/^\s*>\s?/, "").trim() ? ">" : line);
    inQuote = isQuote;
  }
  return out.join("\n");
}

/**
 * Adımların arasına boş satır konunca ("1. …\n\n2. …") her adım ayrı liste oluyordu: sohbetin adım çizgisi yalnız
 * ilk adımda çıkıyor, öbürleri "start=2" ile düz numaraya düşüyordu (8 Kasım 2026, canlı ölçüm). Numarası bir
 * öncekinin devamı olan numaralı blok önceki listeye katılır.
 */
function mergeContinuingLists(blocks: string[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const previous = out[out.length - 1];
    const first = Number(block.trim().match(/^(\d+)\.\s/)?.[1]);
    if (previous != null && Number.isFinite(first) && /^\s*\d+\.\s/.test(previous)) {
      const numbers = [...previous.matchAll(/^\s*(\d+)\.\s/gm)].map((match) => Number(match[1]));
      const lines = previous.split("\n");
      const allItems = lines.every((line) => !line.trim() || /^\s*\d+\.\s/.test(line) || /^\s{2,}\S/.test(line));
      if (allItems && numbers.length && first === numbers[numbers.length - 1] + 1) {
        out[out.length - 1] = `${previous}\n${block.trim()}`;
        continue;
      }
    }
    out.push(block);
  }
  return out;
}

function splitTrailingList(block: string): string[] {
  const lines = block.split("\n");
  let start = lines.length;
  while (start > 0 && LIST_LINE.test(lines[start - 1])) start -= 1;
  if (start === 0 || start === lines.length) return [block];
  return [lines.slice(0, start).join("\n"), lines.slice(start).join("\n")];
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/*
  Öğretmen sohbeti iki kavramı tabloyla karşılaştırıyor ("| | Kavram A | Kavram B |").
  2 Ekim 2026'da canlıda tablo çizilmiyor, öğrenci ham çizgileri görüyordu.
  Tablodan önce ya da sonra boş satırsız gelen paragraf ayrı bloğa alınır.
*/
function splitTableBlock(block: string): string[] {
  const lines = block.split("\n");
  const start = lines.findIndex(
    (line, index) => TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[index + 1] ?? ""),
  );
  if (start < 0) return [block];
  let end = start + 2;
  while (end < lines.length && TABLE_ROW.test(lines[end])) end += 1;
  return [lines.slice(0, start).join("\n"), lines.slice(start, end).join("\n"), lines.slice(end).join("\n")].filter(
    (part) => part.trim(),
  );
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderTable(block: string, math: MathRender): string {
  const [head, , ...rows] = block.trim().split("\n");
  const header = tableCells(head);
  const headHtml = header.some(Boolean)
    ? `<thead><tr>${header.map((cell) => `<th>${renderInline(cell, math)}</th>`).join("")}</tr></thead>`
    : "";
  const bodyHtml = rows
    .map((row) => {
      const cells = tableCells(row);
      return `<tr>${header.map((_, index) => `<td>${renderInline(cells[index] ?? "", math)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div class="cp-md-table-wrap"><table class="cp-md-table">${headHtml}<tbody>${bodyHtml}</tbody></table></div>`;
}

/**
 * Öğretim kutuları (8 Kasım 2026, sohbet öğretim dili). Öğretmen bir bloğu alıntı satırıyla ("> ") ve bir etiketle
 * başlatır; ekran onu kendi tasarımıyla çizer. Etiket emoji ya da adla tanınır; tanınmayan alıntı sade alıntıdır.
 * Kutunun içi yine bu çiziciden geçer (liste, formül, kilit bilgi).
 */
export type CalloutKind = "exam" | "mistake" | "analogy" | "mnemonic" | "remember" | "why";

const CALLOUTS: { kind: CalloutKind; label: string; match: RegExp }[] = [
  { kind: "exam", label: "Sınav ipucu", match: /^(?:📌\s*)?(?:sınav ipucu)\s*[:：-]?\s*/i },
  { kind: "mistake", label: "Sık yapılan hata", match: /^(?:⚠️?\s*)?(?:sık yapılan hata|sık hata|dikkat)\s*[:：-]?\s*/i },
  { kind: "analogy", label: "Benzetme", match: /^(?:💡\s*)?(?:benzetme)\s*[:：-]?\s*/i },
  { kind: "mnemonic", label: "Ezber kodu", match: /^(?:🧠\s*)?(?:ezber kodu|hafıza kodu)\s*[:：-]?\s*/i },
  { kind: "remember", label: "Akılda kalsın", match: /^(?:✅\s*)?(?:akılda kalsın)\s*[:：-]?\s*/i },
  { kind: "why", label: "Neden böyle?", match: /^(?:🤔\s*)?(?:neden böyle\??)\s*[:：-]?\s*/i },
];

/** Satırların hepsi ">" ile başlıyorsa alıntı bloğunun iç metni; değilse null. */
export function quoteBlockText(block: string): string | null {
  const lines = block.split("\n");
  if (!lines.length || !lines.every((line) => /^\s*>/.test(line))) return null;
  return lines.map((line) => line.replace(/^\s*>\s?/, "")).join("\n").trim();
}

/** Alıntının etiketi: tür, görünen ad ve etiket çıkarılmış gövde. */
export function calloutOf(inner: string): { kind: CalloutKind; label: string; body: string } | null {
  for (const callout of CALLOUTS) {
    const head = inner.match(callout.match);
    if (head && head[0].trim()) {
      return { kind: callout.kind, label: callout.label, body: inner.slice(head[0].length).trim() };
    }
  }
  return null;
}

export function renderMarkdownWith(content: string, math: MathRender): string {
  return mergeContinuingLists(
    separateQuoteBlocks(expandGluedLists(content))
      .split(/\n{2,}/)
      .flatMap(splitTableBlock)
      .flatMap(splitTrailingList),
  )
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      if (TABLE_ROW.test(trimmed.split("\n")[0]) && TABLE_SEPARATOR.test(trimmed.split("\n")[1] ?? "")) {
        return renderTable(trimmed, math);
      }

      const quoted = quoteBlockText(trimmed);
      if (quoted != null) {
        const callout = calloutOf(quoted);
        if (!callout) return `<blockquote class="cp-md-quote">${renderMarkdownWith(quoted, math)}</blockquote>`;
        const body = callout.body ? renderMarkdownWith(callout.body, math) : "";
        return `<aside class="cp-callout cp-callout--${callout.kind}" data-callout="${callout.kind}"><p class="cp-callout-label">${callout.label}</p><div class="cp-callout-body">${body}</div></aside>`;
      }

      const mathOnly = splitMath(trimmed);
      if (mathOnly.length === 1 && mathOnly[0]?.type === "math" && mathOnly[0].display) {
        return `<div class="cp-md-formula">${math(mathOnly[0].value, true)}</div>`;
      }
      if (/^(?:dikkat|uyarı|alarm|önemli)\b/i.test(trimmed)) {
        return `<aside class="cp-md-warn">${renderInline(trimmed, math, true)}</aside>`;
      }

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
          math,
        )}</p>`;
      }

      const ordered = /^\d+\./.test(trimmed);
      const start = ordered ? orderedListStart(trimmed.split(LIST_ITEM_SPLIT)) : null;
      if (LIST_LINE.test(trimmed) && (!ordered || start != null)) {
        const items = trimmed
          .split(LIST_ITEM_SPLIT)
          .map((line) => line.replace(/^(\d+\.|[-*])\s+/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${renderInline(item, math, true)}</li>`)
          .join("");
        return ordered
          ? `<ol class="list-decimal space-y-1 pl-5"${start != null && start !== 1 ? ` start="${start}"` : ""}>${items}</ol>`
          : `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
      }

      return `<p>${renderInline(trimmed, math, true)}</p>`;
    })
    .join("");
}

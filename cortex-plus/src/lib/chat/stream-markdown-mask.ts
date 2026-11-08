/**
 * Akış maskesi (3 Kasım 2026, ürün sahibinin onayı): AI Öğretmen yanıtı akarken kapanmamış kalın/italik
 * işareti ("**Kurultay, dev") anlık ham yıldız olarak görünmesin diye son eşleşmemiş açılış işareti
 * geçici gizlenir. Yalnız akış sürerken uygulanır; akış bitince tam metin olduğu gibi çizilir.
 */
function markerPositions(text: string, marker: "**" | "__" | "*" | "=="): number[] {
  const out: number[] = [];
  const ch = marker[0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ch) continue;
    let run = 1;
    while (text[i + run] === ch) run++;
    if (marker === "*") {
      // Madde imi ("* " satır başında) işaret değildir.
      const lineStart = i === 0 || text[i - 1] === "\n";
      if (run === 1 && !(lineStart && /\s/.test(text[i + 1] ?? " "))) out.push(i);
      if (run === 3) out.push(i + 2);
    } else if (marker === "==") {
      // Kilit bilgi işareti tam iki "="; "===" ya da boşlukla çevrili "a == b" işaret değildir.
      if (run === 2 && !(/s/.test(text[i - 1] ?? " ") && /s/.test(text[i + 2] ?? " "))) out.push(i);
    } else if (run >= 2) {
      out.push(i);
    }
    i += run - 1;
  }
  return out;
}

function dropLastUnpaired(text: string, marker: "**" | "__" | "*" | "=="): string {
  const hits = markerPositions(text, marker);
  if (hits.length % 2 === 0) return text;
  const at = hits[hits.length - 1];
  return text.slice(0, at) + text.slice(at + marker.length);
}

export function maskStreamingMarkdown(text: string): string {
  // Açık kod bloğunda dokunma: yıldızlar orada içeriktir.
  if ((text.match(/```/g)?.length ?? 0) % 2 === 1) return text;
  // 8 Kasım 2026: kilit bilgi (==…==) de akarken ham görünmesin.
  return dropLastUnpaired(dropLastUnpaired(dropLastUnpaired(dropLastUnpaired(text, "**"), "__"), "*"), "==");
}

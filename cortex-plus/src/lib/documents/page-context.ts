/** Repeat physical page labels at section boundaries to disambiguate numbering. */
export function documentPageContext(pages: string[]): string {
  return pages.map((page, index) => {
    const label = `[Sayfa ${index + 1}]`;
    const lines = page.split("\n").map((line) => {
      const heading = line.trim().match(/^(\d{1,3})\s+([\p{L}][^\n]{0,100})$/u);
      return heading
        ? `${label} ${heading[2]} (bölüm numarası: ${heading[1]})`
        : line;
    });
    return `${label}\n${lines.join("\n")}\n[Sayfa ${index + 1} sonu]`;
  }).join("\n\n");
}

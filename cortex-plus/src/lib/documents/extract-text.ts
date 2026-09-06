/** Read actual PDF page streams, including compressed text and embedded fonts. */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<{ pages: string[]; ok: boolean }> {
  if (mimeType === "text/plain") {
    const text = buffer.toString("utf8").replace(/\u0000/g, "");
    return { pages: [text], ok: Boolean(text.trim()) };
  }
  if (mimeType !== "application/pdf") return { pages: [], ok: false };

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) =>
        "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
      ).join("").replace(/\u0000/g, "").trim());
      page.cleanup();
    }
    return { pages, ok: pages.some((page) => Boolean(page.trim())) };
  } finally {
    await task.destroy();
  }
}

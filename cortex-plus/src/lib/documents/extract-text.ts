/** pdfjs-dist 6 uses Promise.withResolvers (Node 22+); polyfill for Node 20 CI/runtimes. */
function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === "function") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise as any).withResolvers = function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

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

  ensurePromiseWithResolvers();
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

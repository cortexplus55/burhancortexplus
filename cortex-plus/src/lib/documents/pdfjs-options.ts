import { createRequire } from "node:module";
import path from "node:path";

/**
 * Shared pdfjs-dist load options for Node.
 *
 * pdfjs 6 decodes JBIG2 / JPEG2000 via WASM under `pdfjs-dist/wasm/`.
 * Without `wasmUrl`, office-copier scans (CCITT + JBIG2) render as blank
 * white PNGs and OCR silently reads nothing.
 */

function resolvePdfjsRoot(): string {
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve("pdfjs-dist/package.json"));
  } catch {
    return path.join(process.cwd(), "node_modules", "pdfjs-dist");
  }
}

/** Directory path for pdfjs asset loaders — must end with "/". */
function assetDir(absoluteDir: string): string {
  // pdfjs-dist checks for a literal "/" even on Windows. Node's filesystem
  // accepts forward slashes there, while a native trailing "\\" is rejected
  // before PDF parsing starts.
  return factoryDir(path.resolve(absoluteDir));
}

function factoryDir(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/*$/, "/");
}

export type PdfjsDocumentOptions = {
  data: Uint8Array;
  useSystemFonts: true;
  wasmUrl: string;
  standardFontDataUrl: string;
  cMapUrl: string;
  cMapPacked: true;
};

/** Absolute package asset directories ending with "/". Overridable in tests. */
export function resolvePdfjsAssetUrls(root = resolvePdfjsRoot()): {
  wasmUrl: string;
  standardFontDataUrl: string;
  cMapUrl: string;
} {
  return {
    wasmUrl: assetDir(path.join(root, "wasm")),
    standardFontDataUrl: assetDir(path.join(root, "standard_fonts")),
    cMapUrl: assetDir(path.join(root, "cmaps")),
  };
}

export function pdfjsDocumentOptions(
  data: Uint8Array,
  overrides?: Partial<
    Pick<PdfjsDocumentOptions, "wasmUrl" | "standardFontDataUrl" | "cMapUrl">
  >,
): PdfjsDocumentOptions {
  const assets = resolvePdfjsAssetUrls();
  return {
    data,
    useSystemFonts: true,
    wasmUrl: overrides?.wasmUrl ? factoryDir(overrides.wasmUrl) : assets.wasmUrl,
    standardFontDataUrl:
      overrides?.standardFontDataUrl ? factoryDir(overrides.standardFontDataUrl) : assets.standardFontDataUrl,
    cMapUrl: overrides?.cMapUrl ? factoryDir(overrides.cMapUrl) : assets.cMapUrl,
    cMapPacked: true,
  };
}

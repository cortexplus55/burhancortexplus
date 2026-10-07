import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pdfjsDocumentOptions,
  resolvePdfjsAssetUrls,
} from "@/lib/documents/pdfjs-options";

function endsWithDirSeparator(url: string): boolean {
  return url.endsWith("/");
}

describe("pdfjs asset URLs", () => {
  it("resolvePdfjsAssetUrls dizin yollarını ayırıcı ile bitirir", () => {
    const urls = resolvePdfjsAssetUrls();
    for (const value of Object.values(urls)) {
      expect(endsWithDirSeparator(value)).toBe(true);
      expect(value.length).toBeGreaterThan(5);
    }
  });

  it("pdfjsDocumentOptions wasm, font ve cmap yollarını ayırıcı ile bitirir", () => {
    const opts = pdfjsDocumentOptions(new Uint8Array([1, 2, 3]));
    expect(endsWithDirSeparator(opts.wasmUrl)).toBe(true);
    expect(endsWithDirSeparator(opts.standardFontDataUrl)).toBe(true);
    expect(endsWithDirSeparator(opts.cMapUrl)).toBe(true);
    expect(opts.cMapPacked).toBe(true);
    expect(opts.useSystemFonts).toBe(true);
  });

  it("override edilen wasm yolu da ayırıcı ile biter", () => {
    const custom = path.join("/tmp", "wasm") + path.sep;
    const opts = pdfjsDocumentOptions(new Uint8Array(0), { wasmUrl: custom });
    expect(opts.wasmUrl).toBe(custom.replace(/\\/g, "/"));
    expect(endsWithDirSeparator(opts.wasmUrl)).toBe(true);
  });
});

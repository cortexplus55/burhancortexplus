import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractText } from "@/lib/documents/extract-text";

function compressedPdf() {
  const stream = (text: string) => {
    const data = deflateSync(Buffer.from(`BT /F1 12 Tf 30 100 Td (${text}) Tj ET`));
    return Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, Buffer.from("\nendstream")]);
  };
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>"),
    ...[5, 6].map((id) => Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 7 0 R >> >> /Contents ${id} 0 R >>`)),
    stream("sin x = 5/13"), stream("cos x = -12/13"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  const parts = [Buffer.from("%PDF-1.7\n")];
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
  }
  const xref = Buffer.concat(parts).length;
  parts.push(Buffer.from(`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(parts);
}

describe("PDF extraction", () => {
  it("decodes compressed streams and preserves physical page numbers", async () => {
    const result = await extractText(compressedPdf(), "application/pdf");
    expect(result.ok).toBe(true);
    expect(result.pages).toEqual(["sin x = 5/13", "cos x = -12/13"]);
  });
  it("rejects malformed PDFs rather than storing metadata as lesson text", async () => {
    await expect(extractText(Buffer.from("(fake PDF metadata)"), "application/pdf")).rejects.toThrow();
  });
});

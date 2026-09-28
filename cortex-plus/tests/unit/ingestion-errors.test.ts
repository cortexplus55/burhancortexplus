import { describe, expect, it } from "vitest";
import {
  getIngestionError,
  isRetryableIngestionCode,
  isTerminalDocumentCode,
  userFacingIngestionMessage,
} from "@/lib/documents/ingestion-errors";

describe("ingestion error taxonomy", () => {
  it("geçici kodlar yeniden denenebilir", () => {
    for (const code of ["download_failed", "ingestion_lease_lost"]) {
      expect(isRetryableIngestionCode(code)).toBe(true);
      expect(getIngestionError(code).retryable).toBe(true);
      expect(isTerminalDocumentCode(code)).toBe(false);
    }
  });

  it("terminal belge kodları yeniden denenmez", () => {
    for (const code of ["encrypted_pdf", "empty_content"]) {
      expect(isRetryableIngestionCode(code)).toBe(false);
      expect(getIngestionError(code).retryable).toBe(false);
      expect(isTerminalDocumentCode(code)).toBe(true);
    }
  });

  it("userFacingIngestionMessage Türkçe birleşik cümle döner", () => {
    const msg = userFacingIngestionMessage("download_failed");
    expect(msg).toMatch(/Belge sunucudan alınamadı/);
    expect(msg).toMatch(/Devam et/);
    expect(msg).not.toMatch(/download_failed/);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadDocumentFile } from "@/lib/documents/upload-client";

const storageUpload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: storageUpload }) },
  }),
}));

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  storageUpload.mockReset();
});

describe("private signed document upload", () => {
  it("sends the file to Storage and only metadata to Next, then confirms its real size", async () => {
    const calls: string[] = [];
    storageUpload.mockImplementation(async (path: string, token: string, file: File) => {
      calls.push("storage");
      expect(path).toBe("user/doc/notlar.pdf");
      expect(token).toBe("signed-token");
      expect(file.name).toBe("notlar.pdf");
      return { error: null };
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      if (url.endsWith("/prepare")) {
        expect(JSON.parse(String(init.body))).toMatchObject({ fileName: "notlar.pdf", sizeBytes: 15 });
        return response(200, {
          documentId: "doc", path: "user/doc/notlar.pdf", token: "signed-token",
          mimeType: "application/pdf",
        });
      }
      if (url.endsWith("/complete")) return response(200, { documentId: "doc" });
      throw new Error(`unexpected ${url}`);
    }));
    const file = new File(["%PDF-1.4 sample"], "notlar.pdf", { type: "application/pdf" });
    await expect(uploadDocumentFile(file)).resolves.toEqual({ documentId: "doc" });
    expect(calls).toEqual([
      "/api/documents/upload/prepare", "storage", "/api/documents/upload/complete",
    ]);
  });

  it("accepts a lost Storage response when the server confirms the file exists", async () => {
    storageUpload.mockResolvedValue({ error: new Error("network response lost") });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/prepare")
      ? response(200, { documentId: "doc", path: "user/doc/notlar.pdf", token: "token", mimeType: "application/pdf" })
      : response(200, { documentId: "doc" })));
    await expect(uploadDocumentFile(new File(["pdf"], "notlar.pdf", { type: "application/pdf" })))
      .resolves.toEqual({ documentId: "doc" });
  });

  it("aborts an unconfirmed upload so a pending row does not consume quota", async () => {
    storageUpload.mockResolvedValue({ error: new Error("network") });
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(url);
      if (url.endsWith("/prepare")) return response(200, {
        documentId: "doc", path: "user/doc/notlar.pdf", token: "token", mimeType: "application/pdf",
      });
      if (url.endsWith("/complete")) return response(422, { error: "Dosya bulunamadı." });
      return response(200, { ok: true });
    }));
    await expect(uploadDocumentFile(new File(["pdf"], "notlar.pdf", { type: "application/pdf" })))
      .rejects.toThrow("Dosya bulunamadı.");
    expect(seen).toContain("/api/documents/upload/abort");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentUpload } from "@/components/documents/document-upload";

/**
 * Live production report: a student uploads a PDF, sees a "Belge hazır"
 * success toast, but the page behind it never shows the new document —
 * looks to them like the upload silently did nothing. Reproduced on
 * cortexplus.app: router.push (to the new document's page, the pdf_learning_v2
 * success path) and router.refresh (unconditional in the submit() finally
 * block) both start a Next.js router transition in the same tick; refresh
 * interrupts the pending push, so the app never lands on the document page
 * and the list page behind it keeps rendering stale (pre-upload) data.
 */
const pushMock = vi.fn();
const refreshMock = vi.fn();
const uploadFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/documents/upload-client", () => ({ uploadDocumentFile: uploadFileMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushMock.mockClear();
  refreshMock.mockClear();
  uploadFileMock.mockReset();
});

describe("document upload — post-success navigation", () => {
  it("navigates to the new document once and does not also fire a competing router.refresh (pdf_learning_v2 path)", async () => {
    uploadFileMock.mockResolvedValue({ documentId: "doc-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/documents/process")) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<DocumentUpload creditCost={1} variant="parity" learningV2 />);

    const file = new File(["%PDF-1.4 test"], "notlarim.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Dosya") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dokumanlar/doc-1"));

    expect(pushMock).toHaveBeenCalledTimes(1);
    // The regression: refresh() used to fire unconditionally in `finally`
    // right after push(), interrupting the pending navigation.
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("still refreshes the current page on the non-learningV2 success path (no navigation to race with)", async () => {
    uploadFileMock.mockResolvedValue({ documentId: "doc-2" });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/documents/process")) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<DocumentUpload creditCost={1} variant="parity" learningV2={false} />);

    const file = new File(["%PDF-1.4 test"], "notlarim.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Dosya") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });
});

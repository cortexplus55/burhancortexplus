// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { DocumentStatusPoller } from "@/components/documents/document-status-poller";

const refresh = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/documents/process-session", () => ({ postDocumentProcess: post }));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  post.mockReset();
});

describe("document processing resumes after a reload", () => {
  it("advances a durable processing job when its page is visible", async () => {
    post.mockResolvedValue({ status: 202, body: { phase: "extract", nextPage: 7 } });
    render(<DocumentStatusPoller documentIds={["doc-99"]} />);
    await waitFor(() => expect(post).toHaveBeenCalledWith({ documentId: "doc-99" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not request processing for a pending upload", async () => {
    render(<DocumentStatusPoller documentIds={[]} />);
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
  });
});

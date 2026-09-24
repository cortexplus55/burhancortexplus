// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { ExamPrepStudySession } from "@/components/parity/exam-prep-study-session";
import type { PrepTopic } from "@/lib/learning/exam-prep-progress";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const topicA = "11111111-1111-4111-8111-111111111111";
const topicB = "22222222-2222-4222-8222-222222222222";

const topics: PrepTopic[] = [
  { id: topicA, label: "Limit", sortOrder: 0, status: "ready", lessonId: null },
  { id: topicB, label: "Türev", sortOrder: 1, status: "ready", lessonId: null },
];

function walkToCreate() {
  fireEvent.click(screen.getByRole("button", { name: /Bu benim için yeni/ }));
  fireEvent.click(screen.getByRole("button", { name: "Hazırım" }));
  fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
}

describe("exam lesson generation race", () => {
  it("ignores a stale lesson response and does not start a second billed create", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { topicId?: string };
        calls.push(body.topicId ?? "");
        if (calls.length === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, lessonId: "lesson-b" }), { status: 200 }),
        );
      }),
    );

    render(
      <ExamPrepStudySession
        prepId="33333333-3333-4333-8333-333333333333"
        prepTitle="TYT Matematik"
        topics={topics}
        initialTopicId={topicA}
        lessonsByTopic={{}}
      />,
    );

    walkToCreate();
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    await waitFor(() => expect(calls).toEqual([topicA]));

    fireEvent.click(screen.getByRole("button", { name: /TürevDersi aç/ }));
    expect(screen.getByRole("heading", { name: "Türev" })).toBeTruthy();
    walkToCreate();
    const waiting = screen.getByRole("button", { name: "Hazırlanıyor…" });
    expect(waiting).toHaveProperty("disabled", true);
    fireEvent.click(waiting);
    expect(calls).toEqual([topicA]);

    resolveFirst(
      new Response(JSON.stringify({ error: "Eski konu üretilemedi." }), { status: 500 }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ders oluştur" })).toBeTruthy(),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    await waitFor(() => expect(calls).toEqual([topicA, topicB]));
  });
});

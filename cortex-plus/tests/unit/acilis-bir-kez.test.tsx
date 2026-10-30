// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

/*
  30 Ekim 2026, canlı tur: "Tekrar incele" ile açılan dersin sonunda "Devam et" sonuç ekranı yerine dersi 1. adımdan
  yeniden açtı. Ders bitince `router.refresh()` sunucu özelliklerini yeniliyor; `openAttempt` (açık oturum var mı) ve
  bitmiş dersin düz adresinde `reviewSaved` değişince açılış etkisi yeniden koşup `start({ review: true })` diyordu.
  Açılış düğüm başına bir kez koşar.
*/

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Props = ComponentProps<typeof ExamNodeSession>;

function setup(base: Partial<Props>) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, resumed: false }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const props: Props = {
    prepId: "prep-1",
    nodeId: "node-1",
    kind: "lesson",
    prepTitle: "KPSS Tarih",
    topicLabel: "Osmanlı Kuruluş Dönemi",
    todayMood: "ready",
    initialFamiliarity: "basics",
    ...base,
  } as Props;
  const view = render(<ExamNodeSession {...props} />);
  const opens = () =>
    fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body ?? "{}")) as { action?: string; review?: boolean; replay?: boolean })
      .filter((body) => body.review === true || body.replay === true || body.action === "resume");
  return { view, props, opens };
}

describe("açılış düğüm başına bir kez", () => {
  it("tekrar incele: sunucu özellikleri yenilenince ders baştan açılmaz", async () => {
    const { view, props, opens } = setup({ reviewSaved: true, resumeEnabled: true, openAttempt: false });
    await waitFor(() => expect(opens().length).toBe(1));
    // Oturum açıldı (refresh → açık oturum var), sonra ders bitti (refresh → açık oturum yok).
    view.rerender(<ExamNodeSession {...props} openAttempt />);
    view.rerender(<ExamNodeSession {...props} openAttempt={false} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opens().length).toBe(1);
  });

  it("ilk kez biten ders: bitmiş dersin düz adresi kayıtlı derse dönünce sonuç ekranı korunur", async () => {
    const { view, props, opens } = setup({ reviewSaved: false, resumeEnabled: true, openAttempt: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opens().length).toBe(0);
    view.rerender(<ExamNodeSession {...props} reviewSaved />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opens().length).toBe(0);
  });

  it("özellik kapalıyken de: reviewSaved sonradan açılırsa kayıtlı ders başlamaz", async () => {
    const { view, props, opens } = setup({ reviewSaved: false, resumeEnabled: false });
    view.rerender(<ExamNodeSession {...props} reviewSaved />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(opens().length).toBe(0);
  });

  it("başka düğüme geçince açılış yeniden koşar", async () => {
    const { view, props, opens } = setup({ reviewSaved: true, resumeEnabled: true, openAttempt: false });
    await waitFor(() => expect(opens().length).toBe(1));
    view.rerender(<ExamNodeSession {...props} nodeId="node-2" />);
    await waitFor(() => expect(opens().length).toBe(2));
  });
});

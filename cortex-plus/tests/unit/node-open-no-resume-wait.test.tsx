// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

/*
  20 Ekim 2026, sınav setiyle kurulan yeni hazırlık: hiç açılmamış ilk derste önce ~5 sn
  "Kaldığın yer açılıyor… Kaydedilmiş cevapların yükleniyor. Yeniden ücret alınmaz" yazdı. Açılış
  her seferinde "kayıtlı oturum var mı" diye sunucuya soruyordu. Sayfa açık oturumu sunucuda okur;
  yoksa sorgu ve ekran atlanır.
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

function renderLesson(openAttempt: boolean) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, resumed: false }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ExamNodeSession
      prepId="prep-1"
      nodeId="node-1"
      kind="lesson"
      prepTitle="AYT Biyoloji"
      topicLabel="Homeostazi Döngüsü"
      todayMood="ready"
      initialFamiliarity="basics"
      resumeEnabled
      openAttempt={openAttempt}
    />,
  );
  const actions = () =>
    fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body ?? "{}")) as { action?: string }).action);
  return { fetchMock, actions };
}

describe("ders açılışı: açık oturum yoksa 'kaldığın yer' beklemesi yok", () => {
  it("açık oturum yoksa bekleme ekranı ve resume sorgusu yok", async () => {
    const { actions } = renderLesson(false);
    expect(screen.queryByText("Kaldığın yer açılıyor…")).toBeNull();
    await Promise.resolve();
    expect(actions()).not.toContain("resume");
  });

  it("açık oturum varsa kaldığı yerden sürer", async () => {
    const { actions } = renderLesson(true);
    expect(screen.getByText("Kaldığın yer açılıyor…")).toBeTruthy();
    await vi.waitFor(() => expect(actions()).toContain("resume"));
  });

  it("sayfa açık oturumu sunucuda okur; yazılı denemede inceleme için hep sorar", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain('node.kind !== "written_exam"');
    expect(page).toContain('.eq("status", "active")');
    expect(page).toContain("openAttempt={openAttempt}");
  });
});

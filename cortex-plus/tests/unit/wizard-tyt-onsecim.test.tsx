// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { listProgramSummaries, getProgram, programSources } from "@/lib/curriculum/registry";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/deneme-sinavlari/olustur",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/student/student-shell-context", () => ({
  useStudentShellAccount: () => ({ audience: "plus" }),
  useDocumentLimits: () => ({ isAdmin: false }),
  useIsFounder: () => true,
}));

import { ExamCreateWizard } from "@/components/parity/exam-create-wizard";

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.endsWith("/api/curriculum")) return json({ programs: listProgramSummaries() });
    const m = /\/api\/curriculum\/([^/?]+)$/.exec(url);
    if (m) {
      const program = getProgram(decodeURIComponent(m[1]!))!;
      return json({ program, sources: programSources(program) });
    }
    return json({});
  }) as typeof fetch;
});

describe("sihirbaz: sınav türü profil sınıfını yener", () => {
  it("TYT → Matematik → tarih → hedef → resmî müfredat: YKS + Matematik seçili (profil 10. sınıf)", async () => {
    render(<ExamCreateWizard gradeLevel="10. sınıf" onUseChat={() => undefined} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Sınav türü" })).getByRole("button", { name: "TYT" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Matematik$/ })[0]!);
    const tyt = await screen.findAllByRole("button", { name: /TYT/ });
    fireEvent.click(tyt[0]!);
    const next = screen.queryAllByRole("button", { name: /Devam/ });
    if (next.length) fireEvent.click(next[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /Devam/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dosyam Yok/ }));
    // 2 Kasım 2026: sınav seçildiyse diğer düzeyler gizli; "Başka sınıf/sınav" ile açılır.
    await screen.findByRole("radio", { name: /^YKS/ });
    expect(screen.queryByRole("radio", { name: "10. sınıf" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("radio", { name: /^YKS/ }).getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Matematik" }).getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(screen.getByTestId("official-other-levels"));
    expect(screen.getByRole("radio", { name: "10. sınıf" }).getAttribute("aria-checked")).toBe("false");
  });
});

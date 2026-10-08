// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PrepBasicsPanel } from "@/components/parity/prep-basics-panel";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

function stubFetch() {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: String(init?.method), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );
  return calls;
}

/* Astra'daki hazırlık Ayarlar'ı (1 Ekim 2026): ad, hedef puan, sil. */
describe("hazırlık ayarları", () => {
  it("adı yerinde düzenler", async () => {
    const calls = stubFetch();
    render(<PrepBasicsPanel prepId="p1" title="Trigonometri" targetScore={null} />);
    expect(screen.getByText("Belirlenmedi")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[0]);
    fireEvent.change(screen.getByLabelText("Hazırlık adı"), { target: { value: "  TYT Trigonometri  " } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: "PATCH", body: { prepId: "p1", title: "TYT Trigonometri" } });
  });

  it("hedef puan 1–100 dışında kaydetmez, boş bırakılırsa kaldırır", async () => {
    const calls = stubFetch();
    render(<PrepBasicsPanel prepId="p1" title="Trigonometri" targetScore={75} />);
    expect(screen.getByText("%75")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[1]);
    const input = screen.getByLabelText("Hedef puan (1–100)");
    fireEvent.change(input, { target: { value: "150" } });
    expect((screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ prepId: "p1", targetScore: null });
  });

  it("silme onay ister; onaylanınca siler ve listeye döner", async () => {
    const calls = stubFetch();
    render(<PrepBasicsPanel prepId="p1" title="Trigonometri" targetScore={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlığı sil" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("alertdialog").textContent).toContain("Belgeler'de kalır");
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari"));
    expect(calls[0]).toEqual({ method: "DELETE", body: { prepId: "p1" } });
  });

  it("silme fonksiyonu başkasının kopyasını silmez, yalnız sunucuya açık", () => {
    const sql = readFileSync("supabase/migrations/20261001220000_delete_exam_prep.sql", "utf8");
    expect(sql).toContain("UPDATE public.exam_preps SET forked_from = NULL WHERE forked_from = p_prep_id");
    expect(sql).toContain("UPDATE public.flashcard_reviews SET exam_prep_id = NULL");
    expect(sql).toContain("DELETE FROM public.practice_exams WHERE exam_prep_id = p_prep_id");
    expect(sql).toContain("DELETE FROM public.exam_preps WHERE id = p_prep_id AND user_id = p_user_id");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.delete_exam_prep(uuid, uuid) FROM anon, authenticated");
    const route = readFileSync("src/app/api/learning/exam-prep/details/route.ts", "utf8");
    expect(route).toContain('.eq("user_id", userId)');
    expect(route).toContain("p_user_id: userId");
  });
});

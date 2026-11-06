// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
  Kullanıcı yönetimi, ekran tarafı (6 Kasım 2026): kalıcı silme iki adımlı (seçilenlerin adları + "SİL"); yönetici
  seçim kutusu görmez; iptal ve cihaz sıfırlama sayfa içinde ikinci tıklamayla onaylanır.
*/

const calls = vi.hoisted(() => ({ preps: [] as unknown[], docs: [] as unknown[], cancel: 0, reset: 0 }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/admin/actions", () => ({ adjustCredits: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/app/admin/kullanicilar/actions", () => ({
  deleteUserPreps: vi.fn(async (input: unknown) => {
    calls.preps.push(input);
    return { ok: true, message: "silindi" };
  }),
  deleteUserDocuments: vi.fn(async (input: unknown) => {
    calls.docs.push(input);
    return { ok: true, message: "silindi" };
  }),
  cancelUserPlan: vi.fn(async () => {
    calls.cancel += 1;
    return { ok: true, message: "iptal" };
  }),
  resetUserDevices: vi.fn(async () => {
    calls.reset += 1;
    return { ok: true, message: "sıfır" };
  }),
  grantUserPlan: vi.fn(async () => ({ ok: true, message: "tamam" })),
  adjustUserStars: vi.fn(async () => ({ ok: true, message: "tamam" })),
  confirmUserEmail: vi.fn(async () => ({ ok: true, message: "tamam" })),
}));

import { UserContentDelete } from "@/components/admin/user-content-delete";
import { UserAccountTools, UserPlanTools } from "@/components/admin/user-manage-tools";

const USER = "55555555-5555-4555-8555-555555555555";
const preps = [
  { id: "p1", title: "Fizik Vize", type: "Fizik 101", created: "1 Kas", topics: 4, steps: 12, done: 3, href: "/x" },
  { id: "p2", title: "Kimya Final", type: null, created: "2 Kas", topics: 2, steps: 6, done: 0, href: "/y" },
];
const documents = [
  {
    id: "d1",
    name: "notlar.pdf",
    pages: 12,
    size: "1,2 MB",
    status: "Hazır",
    statusTone: "ok" as const,
    created: "1 Kas",
    linkedPreps: ["Fizik Vize"],
  },
];

beforeEach(() => {
  calls.preps = [];
  calls.docs = [];
  calls.cancel = 0;
  calls.reset = 0;
});
afterEach(cleanup);

describe("kalıcı silme ekranı", () => {
  it("yönetici listeyi görür, seçim kutusu ve silme düğmesi yok", () => {
    render(<UserContentDelete userId={USER} preps={preps} documents={documents} canDelete={false} />);
    expect(screen.getByText("Fizik Vize")).toBeTruthy();
    expect(screen.getByText("notlar.pdf")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("Kalıcı silme yalnız kurucuya açık.")).toBeTruthy();
  });

  it("onay paneli seçilenlerin adlarını gösterir; SİL yazılmadan düğme kapalı", async () => {
    render(<UserContentDelete userId={USER} preps={preps} documents={documents} canDelete />);
    fireEvent.click(screen.getByLabelText("Kimya Final seç"));
    fireEvent.click(screen.getByText("Seçilen 1 hazırlığı sil"));
    const panel = screen.getByRole("alertdialog");
    expect(panel.textContent).toContain("Kimya Final");
    expect(panel.textContent).not.toContain("Fizik Vize");
    const button = screen.getByText("Kalıcı olarak sil") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const input = panel.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "evet" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "SİL" } });
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(calls.preps).toEqual([{ userId: USER, ids: ["p2"], confirm: "SİL" }]);
  });

  it("belge silmede bağlı hazırlıklar da adıyla söylenir", () => {
    render(<UserContentDelete userId={USER} preps={preps} documents={documents} canDelete />);
    fireEvent.click(screen.getByLabelText("notlar.pdf seç"));
    fireEvent.click(screen.getByText("Seçilen 1 belgeyi sil"));
    expect(screen.getByRole("alertdialog").textContent).toContain("Bu belgelerle kurulmuş şu hazırlıklar da silinir: Fizik Vize");
  });
});

describe("geri alınması zor işlemler sayfa içinde onaylanır", () => {
  it("abonelik iptali ikinci tıklamayla", async () => {
    render(<UserPlanTools userId={USER} plans={[{ id: "pl", label: "Plus (aylık)" }]} activePlanLabel="Plus (aylık)" />);
    fireEvent.click(screen.getByText("Aboneliği iptal et"));
    expect(calls.cancel).toBe(0);
    await act(async () => {
      fireEvent.click(screen.getByText("Evet, iptal et"));
    });
    expect(calls.cancel).toBe(1);
  });

  it("cihaz sıfırlama ikinci tıklamayla; kendi hesabında uyarır", async () => {
    render(<UserAccountTools userId={USER} emailState="verified" openDevices={2} isSelf />);
    expect(screen.queryByText("E-postayı onaylı işaretle")).toBeNull();
    fireEvent.click(screen.getByText("Cihaz oturumlarını sıfırla"));
    expect(screen.getByRole("alertdialog").textContent).toContain("sen de çıkış yaparsın");
    await act(async () => {
      fireEvent.click(screen.getByText("Evet, sıfırla"));
    });
    expect(calls.reset).toBe(1);
  });
});

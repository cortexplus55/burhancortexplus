// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
  Elle bakım düğmesi, ekran tarafı (6 Kasım 2026): yönetici düğmeyi hiç görmez; kurucu iki adımda onaylar,
  "Vazgeç" hiçbir şey çalıştırmaz, sonuç cümlesi ekranda kalır.
*/

const run = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/sistem/actions", () => ({ runSystemMaintenance: run }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MaintenanceButton } from "@/components/admin/maintenance-button";
import { MAINTENANCE_CONFIRM } from "@/lib/admin/maintenance";

afterEach(() => {
  cleanup();
  run.mockReset();
});

describe("elle bakım düğmesi", () => {
  it("yönetici: düğme yok, kilit notu", () => {
    render(<MaintenanceButton founder={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/yalnız kurucu çalıştırabilir/)).toBeTruthy();
  });

  it("kurucu: ilk tık yalnız onay sorar, Vazgeç çalıştırmaz", () => {
    render(<MaintenanceButton founder />);
    fireEvent.click(screen.getByRole("button", { name: /Yetim yüklemeleri ve soğuk vektörleri temizle/ }));
    expect(screen.getByText(/Emin misin\?/)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByText(/Emin misin\?/)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("kurucu: ikinci adımda onay sözcüğüyle çalışır, sonucu yazar", async () => {
    run.mockResolvedValue({ ok: true, message: "Yetim yüklemeler: 2 yarım kalmış yükleme silindi." });
    render(<MaintenanceButton founder />);
    fireEvent.click(screen.getByRole("button", { name: /temizle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Evet, şimdi temizle" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("2 yarım kalmış yükleme silindi"));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(MAINTENANCE_CONFIRM);
  });

  it("sunucu reddederse hata cümlesi görünür", async () => {
    run.mockResolvedValue({ ok: false, error: "Bu işlem yalnız kurucuya açık." });
    render(<MaintenanceButton founder />);
    fireEvent.click(screen.getByRole("button", { name: /temizle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Evet, şimdi temizle" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Bu işlem yalnız kurucuya açık."));
  });
});

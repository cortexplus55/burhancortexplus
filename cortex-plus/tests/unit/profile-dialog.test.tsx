// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));

import { ProfileDialog } from "@/components/parity/profile-dialog";

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith("/api/schools/search")) {
        return new Response(
          JSON.stringify({
            results: [{ id: "8f0c1a52-0000-4000-8000-000000000001", name: "Bafra Anadolu Lisesi", city: "Samsun" }],
            schools: ["Bafra Anadolu Lisesi"],
          }),
        );
      }
      if (url === "/api/profile/me" && method === "GET") {
        return new Response(
          JSON.stringify({ learning_role: "student", daily_goal_minutes: 30, today_minutes: 12, full_name: "Ada" }),
        );
      }
      return new Response("{}");
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const patches = () => calls.filter((c) => c.method === "PATCH").map((c) => c.body);

describe("profil penceresi", () => {
  it("offers no parent role (the product is student-only)", () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    expect(screen.queryByText("Veli")).toBeNull();
    expect(screen.getByText("Öğrenci")).toBeTruthy();
  });

  it("saves the role as soon as it is picked", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    fireEvent.click(screen.getByText("Mezun"));
    await waitFor(() => expect(patches()).toContainEqual({ learning_role: "graduate" }));
  });

  it("saves the picked school with its id, not just a free-text name", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Okulum" }));
    fireEvent.change(screen.getByPlaceholderText("Okul adı ara"), { target: { value: "Bafra" } });
    const option = await screen.findByRole("button", { name: /Bafra Anadolu Lisesi \(Samsun\)/ });
    fireEvent.click(option);
    await waitFor(() =>
      expect(patches()).toContainEqual({
        school_name: "Bafra Anadolu Lisesi",
        school_id: "8f0c1a52-0000-4000-8000-000000000001",
      }),
    );
  });

  /*
    1 Ekim 2026: Astra'nın "Öğrenme tercihleri" sekmesi. Günlük hedef artık
    dakika ("Bugün 12 / 30 dk"); her ayar seçildiği anda kaydediliyor.
  */
  it("günlük çalışma hedefini dakika olarak kaydeder ve bugünü gösterir", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Öğrenme tercihleri" }));
    await screen.findByText("Bugün 12 / 30 dk");
    fireEvent.click(screen.getByRole("radio", { name: "45 dk" }));
    await waitFor(() => expect(patches()).toContainEqual({ daily_goal_minutes: 45 }));
  });

  it("önerilen sorular, disleksi dostu okuma ve öğretmen sesi kaydedilir ve hemen uygulanır", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Öğrenme tercihleri" }));
    await screen.findByText("Bugün 12 / 30 dk");
    fireEvent.click(screen.getByRole("switch", { name: /Önerilen sorular/ }));
    await waitFor(() => expect(patches()).toContainEqual({ show_suggestions: false }));
    fireEvent.click(screen.getByRole("switch", { name: /Disleksi dostu okuma/ }));
    await waitFor(() => expect(patches()).toContainEqual({ readable_font: true }));
    await waitFor(() => expect(document.documentElement.dataset.readable).toBe("1"));
    fireEvent.click(screen.getByRole("radio", { name: "Erkek sesi" }));
    await waitFor(() => expect(patches()).toContainEqual({ tutor_voice: "male" }));
    const stored = JSON.parse(window.localStorage.getItem("cortex-learning-prefs") ?? "{}");
    expect(stored).toMatchObject({ suggestions: false, readable: true, voice: "male" });
  });

  it("Hesabım ismi, Okulum seviyeyi kaydeder", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    const name = await screen.findByDisplayValue("Ada");
    fireEvent.change(name, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "İsmi kaydet" }));
    await waitFor(() => expect(patches()).toContainEqual({ full_name: "Ada Lovelace" }));
    fireEvent.click(screen.getByRole("button", { name: "Okulum" }));
    fireEvent.change(screen.getByPlaceholderText(/11\. sınıf/), { target: { value: "12. sınıf" } });
    fireEvent.click(screen.getByRole("button", { name: "Seviyeyi kaydet" }));
    await waitFor(() => expect(patches()).toContainEqual({ grade_level: "12. sınıf" }));
  });
});

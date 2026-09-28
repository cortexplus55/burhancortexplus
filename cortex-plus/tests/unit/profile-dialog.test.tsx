// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
        return new Response(JSON.stringify({ learning_role: "student" }));
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

  it("sends only the daily goal from the learning tab", async () => {
    render(<ProfileDialog open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Öğrenme" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(patches()).toContainEqual({ daily_goal_minutes: 3 }));
  });
});

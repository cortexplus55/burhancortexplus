// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  mergeSearchRows,
  newestPreps,
  popularPreps,
  searchOwners,
  searchPreps,
  searchSubjects,
  toSearchRows,
  type PrepSearchRow,
} from "@/lib/parity/prep-search";
import { PrepSearchView } from "@/components/parity/prep-search-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

afterEach(cleanup);

/* Astra'daki "Sınav hazırlıklarında ara" (1 Ekim 2026). */
const shared = toSearchRows([
  { id: "a", title: "Kan Fizyolojisi", exam_type: "Tıp", view_count: 2, owner_name: "Ayşe", owner_key: "k1", is_own: false, topic_count: 4, created_at: "2026-09-30T10:00:00Z" },
  { id: "b", title: "Enzim Kinetiği", exam_type: "Biyoloji", view_count: 3, owner_name: "Berat", owner_key: "k2", is_own: false, topic_count: 5, created_at: "2026-09-20T10:00:00Z" },
  { id: "c", title: "İntegral", exam_type: "Matematik", view_count: 0, owner_name: "Ece", owner_key: "k3", is_own: false, topic_count: 3, created_at: "2026-09-25T10:00:00Z" },
  { id: "d", title: "Alt Ekstremite", exam_type: "Tıp", view_count: 1, owner_name: "Ayşe", owner_key: "k1", is_own: false, topic_count: 2, created_at: "2026-09-10T10:00:00Z" },
]);
const own: PrepSearchRow = {
  id: "m", title: "Trigonometri", examType: "Matematik", ownerName: "Sen", ownerKey: "me", isOwn: true,
  joinCount: 0, topicCount: 0, createdAt: "2026-10-01T10:00:00Z",
};
const rows = mergeSearchRows(shared, [own]);

describe("hazırlık araması", () => {
  it("başlık, ders ve oluşturanda Türkçe katlamayla arar", () => {
    expect(searchPreps(rows, "integral").map((row) => row.id)).toEqual(["c"]);
    expect(searchPreps(rows, "tip").map((row) => row.id)).toEqual(["a", "d"]);
    expect(searchPreps(rows, "ayse").map((row) => row.id)).toEqual(["a", "d"]);
    expect(searchPreps(rows, "sen").map((row) => row.id)).toEqual(["m"]);
    expect(searchPreps(rows, "  ")).toHaveLength(5);
  });

  it("dersler çoktan aza, oluşturanlarda önce sen", () => {
    expect(searchSubjects(rows).slice(0, 2)).toEqual(["Matematik", "Tıp"]);
    const owners = searchOwners(rows);
    expect(owners[0]).toMatchObject({ key: "me", name: "Sen" });
    expect(owners[1]).toMatchObject({ key: "k1", name: "Ayşe", count: 2 });
  });

  it("popüler katılımı olanlar, yeni eklenenler tarihe göre; kendi hazırlığın ikisinde de yok", () => {
    expect(popularPreps(rows).map((row) => row.id)).toEqual(["b", "a", "d"]);
    expect(newestPreps(rows).map((row) => row.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("aynı hazırlık iki kaynaktan gelirse bir kez", () => {
    expect(mergeSearchRows([...shared, { ...own }], [own]).filter((row) => row.id === "m")).toHaveLength(1);
  });

  it("sayfa: arama sonuç listesine geçer, oluşturana göre süzer, kendi hazırlığında Aç", () => {
    render(<PrepSearchView rows={rows} hasSchool />);
    expect(screen.getByRole("heading", { name: "Okulunda popüler" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yeni eklenenler" })).toBeTruthy();
    expect(screen.getAllByText("3 katılım").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Hazırlıklarda ara"), { target: { value: "trigo" } });
    expect(screen.getByRole("heading", { name: "Sonuçlar (1)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Aç" }).getAttribute("href")).toBe("/deneme-sinavlari/m");

    fireEvent.change(screen.getByLabelText("Hazırlıklarda ara"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Ayşe/ }));
    expect(screen.getByRole("heading", { name: "Sonuçlar (2)" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Katıl" })).toHaveLength(2);
  });

  it("okul seçilmemişse ve paylaşım yoksa okul seçmeye yönlendirir", () => {
    render(<PrepSearchView rows={[own]} hasSchool={false} />);
    expect(screen.getByRole("link", { name: "Okulunu seç" }).getAttribute("href")).toBe("/deneme-sinavlari");
  });

  it("göç kimliği değil özetini döndürür ve yalnız kendi okulunu okur", () => {
    const sql = readFileSync("supabase/migrations/20261001210000_school_feed_search.sql", "utf8");
    expect(sql).toContain("md5(e.user_id::text) AS owner_key");
    expect(sql).toContain("e.visibility = 'school'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.school_feed_search(integer) TO authenticated");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.school_feed_search(integer) FROM anon");
  });
});

/**
 * Yol iskeleti eşzamanlı yazımı (19 Kasım 2026, Faz 2 denetimi): iki sayfa açılışı aynı anda "düğüm yok" görünce yol
 * iki kez yazılabiliyordu (tekil kısıt yok); yazım hataları yutuluyordu. Hazırlık başına kısa kilit; hata kaydı.
 */
import { describe, expect, it, vi } from "vitest";
import { ensurePrepNodes } from "@/lib/learning/exam-prep-insert";

function fakeService(delayMs: number) {
  const inserts: unknown[] = [];
  let written = false;
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "update"]) builder[name] = () => builder;
    builder.limit = async () => ({ data: written ? [{ id: "n1" }] : [], error: null });
    builder.insert = async (rows: unknown) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      inserts.push({ table, rows });
      written = true;
      return { error: null };
    };
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
    return builder;
  };
  return { service: { from: make } as never, inserts };
}

describe("yol yazımı: hazırlık başına tek yazıcı", () => {
  it("aynı anda iki açılış yolu bir kez yazar", async () => {
    const { service, inserts } = fakeService(40);
    await Promise.all([
      ensurePrepNodes(service, { id: "prep-kilit-1", exam_date: "2026-12-01" }),
      ensurePrepNodes(service, { id: "prep-kilit-1", exam_date: "2026-12-01" }),
    ]);
    expect(inserts.filter((item) => (item as { table: string }).table === "exam_prep_nodes")).toHaveLength(1);
  });

  it("yazım hatası yutulmaz: kodlu kayıt düşer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "update"]) builder[name] = () => builder;
    builder.limit = async () => ({ data: [], error: null });
    builder.insert = async () => ({ error: { code: "23505", message: "duplicate key" } });
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
    await ensurePrepNodes({ from: () => builder } as never, { id: "prep-kilit-2", exam_date: "2026-12-01" });
    expect(error).toHaveBeenCalledWith("exam_path_write_failed", expect.objectContaining({ stage: "plan_insert", code: "23505" }));
    error.mockRestore();
  });
});

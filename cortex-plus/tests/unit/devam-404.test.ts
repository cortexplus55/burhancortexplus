/**
 * H1 (15 Kasım 2026): hazırlık sayfasında "Devam et" ilk tıklamada 404. Kök neden kanıtlandı: sayfa yanıttan sonra planı
 * yeniden dağıtıyor (`maybeRescheduleMissedDays` `after()` içinde), `replace_exam_prep_schedule` başlanmamış adımları yeni
 * kimlikle yazıyor; ekrandaki bağlantı silinmiş kimliği taşıyor. Bulunamayan adım artık güncel sıradaki adıma yönlenir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/node-free-meter", () => ({
  pathSkipKinds: vi.fn(async () => new Set<string>(["podcast"])),
}));

const { staleNodeTarget } = await import("@/lib/learning/stale-node");

function serviceWith(rows: Record<string, unknown>[] | null, error = false) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => (error ? { data: null, error: { message: "x" } } : { data: rows, error: null }),
      }),
    }),
  } as never;
}

describe("silinmiş adım bağlantısı", () => {
  it("güncel sıradaki adıma yönlenir; ücretsizde Plus adımı atlanır", async () => {
    const target = await staleNodeTarget(
      serviceWith([
        { id: "n-done", kind: "lesson", status: "done", sort_order: 1, title: "Ders" },
        { id: "n-pod", kind: "podcast", status: "ready", sort_order: 2, title: "Podcast" },
        { id: "n-quiz", kind: "quiz", status: "ready", sort_order: 3, title: "Konu testi" },
      ]),
      { prepId: "p1", userId: "u1" },
    );
    expect(target).toBe("/deneme-sinavlari/p1/dugum/n-quiz");
  });

  it("sıradaki adım yoksa ya da okuma düşerse hazırlık sayfası", async () => {
    expect(await staleNodeTarget(serviceWith([{ id: "a", kind: "lesson", status: "done", sort_order: 1 }]), { prepId: "p1", userId: "u1" })).toBe(
      "/deneme-sinavlari/p1",
    );
    expect(await staleNodeTarget(serviceWith(null, true), { prepId: "p1", userId: "u1" })).toBe("/deneme-sinavlari/p1");
  });

  it("adım sayfası bulunamayan adımda 404 değil yönlendirme; hazırlık yoksa yine 404", () => {
    const page = readFileSync(join(process.cwd(), "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx"), "utf8");
    expect(page).toContain("if (!prep) notFound();");
    expect(page).toContain("const target = await staleNodeTarget(service, { prepId, userId: user.id });");
    expect(page).not.toContain("if (!prep || !node) notFound();");
  });

  it("kök neden yerinde: plan yanıttan sonra yeniden kuruluyor (yönlendirme bu yüzden gerekli)", () => {
    const prepPage = readFileSync(join(process.cwd(), "src/app/deneme-sinavlari/[prepId]/page.tsx"), "utf8");
    expect(prepPage).toContain('maybeRescheduleMissedDays(service, user.id, { prepId, reason: "missed_day" })');
    const apply = readFileSync(join(process.cwd(), "src/lib/learning/exam-prep-reschedule-apply.ts"), "utf8");
    expect(apply).toContain("p_preserved_ids: protectedNodes.map((n) => n.id)");
  });
});

/**
 * Kayıtlı konu düğümlerini değiştirme sırası.
 *
 * Eski satırlar, yenileri yazılana kadar durur. İkinci istek aynı
 * `updatedAt` ile hak iddia edemez. Ekleme yarıda kalırsa yalnızca yeni
 * satırlar silinir; belge sıfır konuya düşmez.
 */

export type RefoldWriter = {
  /** Yalnızca okunan `updatedAt` hâlâ duruyorsa true. */
  claim(observedAt: string | null): Promise<boolean>;
  insert(index: number): Promise<string>;
  deleteIds(ids: string[]): Promise<void>;
  /**
   * Yeni satırlar duruyor, eskiler henüz duruyor.
   * "commit" eskileri siler. "rollback" yenileri siler. "keep" ikisine de dokunmaz.
   */
  beforeDeleteOld?: () => Promise<"commit" | "rollback" | "keep">;
};

export type RefoldWriteResult = "skipped-claim" | "replaced" | "rolled-back" | "kept-both";

export async function replaceTopicNodes(
  writer: RefoldWriter,
  plan: { observedAt: string | null; oldIds: string[]; count: number },
): Promise<RefoldWriteResult> {
  if (plan.count < 1) return "rolled-back";
  const claimed = await writer.claim(plan.observedAt);
  if (!claimed) return "skipped-claim";

  const created: string[] = [];
  try {
    for (let index = 0; index < plan.count; index += 1) {
      created.push(await writer.insert(index));
    }
  } catch {
    if (created.length) await writer.deleteIds(created);
    return "rolled-back";
  }

  const decision = (await writer.beforeDeleteOld?.()) ?? "commit";
  if (decision === "keep") return "kept-both";
  if (decision === "rollback") {
    if (created.length) await writer.deleteIds(created);
    return "rolled-back";
  }
  if (plan.oldIds.length) await writer.deleteIds(plan.oldIds);
  return "replaced";
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { missingRelation } from "@/lib/learning/missing-column";
import {
  founderApiGuard,
  jsonError,
  NO_STORE,
} from "@/lib/founder-cockpit/api-guard";
import { VENDORS } from "@/lib/founder-cockpit/vendors";

/**
 * Yurt dışı API ve bulut faturaları (Faz 13): ekle (POST), "mali müşavire gönderildi" ve KDV 2 işaretini değiştir (PATCH),
 * yanlış girilen satırı sil (DELETE). Yalnız kurucu.
 */

const TABLE = "founder_cloud_expenses";
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const createSchema = z
  .object({
    periodMonth: monthKey,
    vendor: z.enum(VENDORS),
    amountUsd: z.number().finite().min(0).max(1_000_000),
    amountTry: z.number().finite().min(0).max(100_000_000),
    invoiceNumber: optionalText(120),
    kdv2: z.boolean().default(true),
    notes: optionalText(500),
  })
  .strict()
  .refine((value) => value.amountUsd > 0 || value.amountTry > 0, {
    message: "amount_required",
  });

const patchSchema = z
  .object({
    id: z.string().uuid(),
    sentToAccountant: z.boolean().optional(),
    kdv2: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.sentToAccountant != null || value.kdv2 != null);

const deleteSchema = z.object({ id: z.string().uuid() }).strict();

function tableResult(error: { message?: string; code?: string } | null) {
  if (!error) return null;
  return missingRelation(error)
    ? jsonError(
        409,
        "migration_pending",
        "Fatura tablosu henüz yok: veritabanı değişikliği uygulanınca eklenir.",
      )
    : jsonError(500, "save_failed", "Fatura kaydedilemedi.");
}

export async function POST(request: Request) {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      "invalid_input",
      "Ay, sağlayıcı ve dolar ya da TL tutarı gerekli.",
    );
  const input = parsed.data;
  const { data, error } = await guard.service
    .from(TABLE)
    .insert({
      period_month: input.periodMonth,
      vendor: input.vendor,
      amount_usd: input.amountUsd,
      amount_try: input.amountTry,
      invoice_number: input.invoiceNumber,
      is_kdv2_applicable: input.kdv2,
      notes: input.notes,
    })
    .select("id")
    .maybeSingle();
  const failure = tableResult(error);
  if (failure) return failure;
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.expense.added",
    entityType: TABLE,
    entityId: String((data as { id?: string } | null)?.id ?? ""),
    metadata: {
      periodMonth: input.periodMonth,
      vendor: input.vendor,
      amountUsd: input.amountUsd,
      amountTry: input.amountTry,
    },
  });
  revalidatePath("/admin/kokpit");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, "invalid_input", "Geçersiz istek.");
  const update: Record<string, boolean> = {};
  if (parsed.data.sentToAccountant != null)
    update.sent_to_accountant = parsed.data.sentToAccountant;
  if (parsed.data.kdv2 != null) update.is_kdv2_applicable = parsed.data.kdv2;
  const { error } = await guard.service
    .from(TABLE)
    .update(update)
    .eq("id", parsed.data.id);
  const failure = tableResult(error);
  if (failure) return failure;
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.expense.updated",
    entityType: TABLE,
    entityId: parsed.data.id,
    metadata: update,
  });
  revalidatePath("/admin/kokpit");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, "invalid_input", "Geçersiz istek.");
  const { error } = await guard.service
    .from(TABLE)
    .delete()
    .eq("id", parsed.data.id);
  const failure = tableResult(error);
  if (failure) return failure;
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.expense.deleted",
    entityType: TABLE,
    entityId: parsed.data.id,
  });
  revalidatePath("/admin/kokpit");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

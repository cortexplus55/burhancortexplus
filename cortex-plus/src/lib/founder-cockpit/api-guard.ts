import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkFounderActor, FOUNDER_ONLY_ERROR } from "@/lib/auth/admin-actor";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * `/api/admin/kokpit/*` uçlarının kapısı (Faz 13). Yalnız kurucu ve PIN kapısı geçilmiş oturum (yönetim panelinin mevcut
 * kurucu denetimi, `checkFounderActor`). Kurucu değilse 404 (yönetim yüzeyinin varlığı görünmez); kurucu ama PIN kapısı
 * geçilmemişse 403 ve nedeni.
 */

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function founderApiGuard(): Promise<
  | { ok: true; userId: string; service: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const result = await checkFounderActor();
  if (!result.ok) {
    const notFounder = result.error === FOUNDER_ONLY_ERROR;
    return {
      ok: false,
      response: NextResponse.json(
        notFounder
          ? { error: "not_found" }
          : { error: "gate_required", message: result.error },
        { status: notFounder ? 404 : 403, headers: NO_STORE },
      ),
    };
  }
  return { ok: true, userId: result.userId, service: createServiceClient() };
}

export function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

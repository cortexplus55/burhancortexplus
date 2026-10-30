import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAbuse } from "@/lib/abuse/record";
import { phoneSessionOpen, type PhoneSessionRow } from "@/lib/documents/phone-session";

/**
 * Telefon oturumunu koddan bulur ve açık mı bakar (31 Ekim 2026: imzalı yüklemenin iki ucu da aynı kapıdan geçer).
 * Bilinmeyen kod kötüye kullanım kaydı bırakır; süresi dolmuş 410, kapanmış 409.
 */
export async function openPhoneSession(
  service: SupabaseClient,
  request: Request,
  token: string,
  scope: string,
): Promise<{ ok: true; row: PhoneSessionRow & { id: string; user_id: string } } | { ok: false; response: NextResponse }> {
  const { data: session } = await service
    .from("phone_upload_sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!session) {
    void recordAbuse({
      signal: "token_bruteforce",
      severity: "medium",
      scope,
      request,
      metadata: { reason: "unknown_token" },
    });
    return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  const row = session as PhoneSessionRow & { id: string; user_id: string };
  const state = phoneSessionOpen(row);
  if (state.reason === "expired") return { ok: false, response: NextResponse.json({ error: "expired" }, { status: 410 }) };
  if (!state.open) return { ok: false, response: NextResponse.json({ error: "used" }, { status: 409 }) };
  return { ok: true, row };
}

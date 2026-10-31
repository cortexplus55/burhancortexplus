import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits } from "@/lib/credits/service";
import { chargeNow } from "@/lib/credits/charge-now";
import {
  DOCUMENT_RESERVATION_PREFIX,
  parseDocumentReservationKey,
} from "@/lib/documents/document-reservation-key";

/*
  Belgenin sayfa ücreti (DOCUMENT_PAGE_PROCESS). Okuma ilk adımda belgenin kalan sayfaları kadar ayırma yapar
  (`document_process_<belge>`), belge bitince kesinleşir. Büyük taranmış kitapta okuma öğrenci ilerledikçe sürer
  (31 Ekim 2026, pencereli işleme): duraklarken ayırma bırakılır, okunan sayfalar kesilir; okuma yeniden başlayınca
  kalan sayfalar için yeni ayırma açılır (`document_process_<belge>_p<ilk sayfa>`). Okunamayan sayfanın ücreti alınmaz.
*/

/** Belgenin süren (kesinleşmemiş) ayırması: en yeni olan. */
export async function documentReservation(
  service: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<{ id: string; status: string; firstPage: number } | null> {
  // Kullanıcının süren sayfa ayırmaları azdır (okunmakta olan belgeler); anahtar ayrıştırılarak bu belgeninki seçilir.
  const { data } = await service
    .from("credit_reservations")
    .select("id, status, idempotency_key, created_at")
    .eq("user_id", userId)
    .eq("action_code", "DOCUMENT_PAGE_PROCESS")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);
  for (const row of data ?? []) {
    if (!String(row.idempotency_key ?? "").startsWith(`${DOCUMENT_RESERVATION_PREFIX}${documentId}`)) continue;
    const parsed = parseDocumentReservationKey(String(row.idempotency_key ?? ""));
    if (parsed?.documentId === documentId) {
      return { id: String(row.id), status: String(row.status), firstPage: parsed.firstPage };
    }
  }
  return null;
}

async function readablePages(
  service: SupabaseClient,
  documentId: string,
  range: { from: number; to?: number },
): Promise<{ total: number; unreadable: number } | null> {
  let all = service.from("document_pages").select("id", { count: "exact", head: true })
    .eq("document_id", documentId).gte("page_number", range.from);
  let bad = service.from("document_pages").select("id", { count: "exact", head: true })
    .eq("document_id", documentId).eq("page_kind", "unreadable").gte("page_number", range.from);
  if (range.to != null) {
    all = all.lte("page_number", range.to);
    bad = bad.lte("page_number", range.to);
  }
  const [{ count: total, error }, { count: unreadable, error: badError }] = await Promise.all([all, bad]);
  if (error || badError) return null;
  return { total: total ?? 0, unreadable: unreadable ?? 0 };
}

/**
 * Belgenin sayfa ücretini kesinleştirir. Okunamayan sayfa (31 Ekim 2026, ürün sahibi: "okunmayan sayfanın kredisi
 * düşmesin"): ayrılan ücret iade edilir, yalnız okunan sayfa kadar kesilir (anahtar aynı aralıkta bir kez). Taranmış
 * sayfa ücreti zaten yalnız okunan sayfadan alınıyor.
 */
export async function commitDocumentCredits(service: SupabaseClient, userId: string, documentId: string) {
  const reservation = await documentReservation(service, userId, documentId);
  if (!reservation) return;
  const pages = await readablePages(service, documentId, { from: reservation.firstPage });
  if (!pages || !pages.unreadable || !pages.total) {
    await commitCredits(service, reservation.id);
    return;
  }
  await refundCredits(service, reservation.id);
  const suffix = reservation.firstPage > 1 ? `_${reservation.firstPage}` : "";
  await chargeNow(
    service, userId, "DOCUMENT_PAGE_PROCESS", `document_pages_read_${documentId}${suffix}`,
    Math.max(0, pages.total - pages.unreadable),
  );
}

/** Harita kalıcı olarak düşünce: süren ayırma iade. */
export async function refundDocumentCredits(service: SupabaseClient, userId: string, documentId: string) {
  const reservation = await documentReservation(service, userId, documentId);
  if (reservation) await refundCredits(service, reservation.id).catch(() => {});
}

/**
 * Okuma duraklıyor (taranmış kitap, öğrenci ilerledikçe okunur): süren ayırma bırakılır, şimdiye kadar okunan
 * (okunabilen) sayfalar kesilir. Okuma sürerken (kira dolu) dokunulmaz. Okuma yeniden başlayınca `pdf-ingestion`
 * kalan sayfalar için yeni ayırma açar.
 */
export async function settleDocumentHold(
  service: SupabaseClient,
  input: { userId: string; documentId: string; readThrough: number },
): Promise<boolean> {
  const { data: state } = await service
    .from("document_ingestion_state")
    .select("lease_until, reservation_id")
    .eq("document_id", input.documentId)
    .maybeSingle();
  if (!state?.reservation_id) return false;
  if (state.lease_until && Date.parse(String(state.lease_until)) > Date.now()) return false;
  const reservation = await documentReservation(service, input.userId, input.documentId);
  if (!reservation || reservation.id !== state.reservation_id || input.readThrough < reservation.firstPage) return false;
  const pages = await readablePages(service, input.documentId, { from: reservation.firstPage, to: input.readThrough });
  if (!pages) return false;
  const { data: released } = await service
    .from("document_ingestion_state")
    .update({ reservation_id: null })
    .eq("document_id", input.documentId)
    .eq("reservation_id", reservation.id)
    .is("lease_token", null)
    .select("document_id");
  if (!released?.length) return false;
  await refundCredits(service, reservation.id);
  const readable = Math.max(0, pages.total - pages.unreadable);
  if (readable > 0) {
    await chargeNow(
      service, input.userId, "DOCUMENT_PAGE_PROCESS",
      `document_pages_read_${input.documentId}_${reservation.firstPage}_${input.readThrough}`, readable,
    );
  }
  return true;
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Telefondan yükleme oturumu (QR) — çok dosya (31 Ekim 2026).
 *
 * Kod tek dosyadan sonra "kullanıldı" oluyordu; masaüstünde hazırlık kurup fotoğrafları telefondan gönderen öğrenci
 * her fotoğraf için yeni kod okutmak zorundaydı. Oturum artık süresi bitene kadar dosya alır (göç
 * `20261031120000_phone_upload_many.sql`). Göç uygulanmamışsa eski tek dosyalı davranış sürer: satırda
 * `document_ids` yoktur, ilk dosyadan sonra kod kullanılmış sayılır.
 */

/** Bir oturumun alabileceği en çok dosya (teknik tavan; öğrenciyi sayfa ve fotoğraf hakkı sınırlar). */
export const PHONE_SESSION_MAX_FILES = 1000;

export type PhoneSessionRow = {
  id?: string;
  user_id?: string;
  document_id?: string | null;
  file_name?: string | null;
  document_ids?: string[] | null;
  file_names?: string[] | null;
  expires_at: string;
};

/** Oturum çok dosya alabiliyor mu (göç uygulandı mı). */
export function supportsManyFiles(row: PhoneSessionRow): boolean {
  return Array.isArray(row.document_ids);
}

/** Oturumda gelen dosyalar, geliş sırasıyla. Eski satırda yalnız ilk dosya. */
export function phoneSessionDocuments(row: PhoneSessionRow): { documentId: string; fileName: string }[] {
  if (Array.isArray(row.document_ids) && row.document_ids.length) {
    return row.document_ids.map((documentId, index) => ({
      documentId,
      fileName: row.file_names?.[index] || "Telefon yüklemesi",
    }));
  }
  return row.document_id ? [{ documentId: row.document_id, fileName: row.file_name || "Telefon yüklemesi" }] : [];
}

/** Telefon sayfası yeni dosya gönderebilir mi: süre dolmadı; eski satırda henüz dosya gelmedi. */
export function phoneSessionOpen(row: PhoneSessionRow, now = Date.now()): { open: boolean; reason?: "expired" | "used" | "full" } {
  if (new Date(row.expires_at).getTime() < now) return { open: false, reason: "expired" };
  if (!supportsManyFiles(row)) return row.document_id ? { open: false, reason: "used" } : { open: true };
  if ((row.document_ids?.length ?? 0) >= PHONE_SESSION_MAX_FILES) return { open: false, reason: "full" };
  return { open: true };
}

/**
 * Gelen dosyayı oturuma ekler. Çok dosyalı oturumda tek adımlı SQL (`append_phone_upload`), eski satırda ilk dosya
 * yazılır. Eklenemediyse (süre doldu, tavan, ikinci dosya eski oturumda) false.
 */
export async function appendPhoneUpload(
  service: SupabaseClient,
  row: PhoneSessionRow & { id: string },
  documentId: string,
  fileName: string,
): Promise<boolean> {
  if (supportsManyFiles(row)) {
    const { data, error } = await service.rpc("append_phone_upload", {
      p_session_id: row.id,
      p_document_id: documentId,
      p_file_name: fileName,
      p_max: PHONE_SESSION_MAX_FILES,
    });
    if (!error) return typeof data === "number" && data > 0;
    console.warn("phone_upload_append_failed", { cause: error.message.slice(0, 160) });
  }
  const { data, error } = await service
    .from("phone_upload_sessions")
    .update({ document_id: documentId, file_name: fileName })
    .eq("id", row.id)
    .is("document_id", null)
    .select("id");
  return !error && Boolean(data?.length);
}

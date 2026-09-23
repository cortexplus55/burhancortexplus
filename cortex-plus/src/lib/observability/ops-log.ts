import "server-only";

/** Yapılandırılmış operasyon günlüğü — parola, token veya belge gövdesi loglanmaz. */
export function logOpsEvent(
  name:
    | "document_upload_failed"
    | "document_parse_failed"
    | "generation_failed"
    | "credit_transaction_failed"
    | "subscription_sync_failed"
    | "payment_webhook_failed"
    | "exam_autosave_failed",
  fields: Record<string, string | number | boolean | null | undefined> = {},
) {
  console.error(JSON.stringify({ event: name, at: new Date().toISOString(), ...fields }));
}

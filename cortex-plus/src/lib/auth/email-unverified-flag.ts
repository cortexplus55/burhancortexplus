/** `app_metadata.email_unverified` okuyucusu (istemci ve sunucu ortak; Paket J takip #3). */
export function emailUnverifiedFromMetadata(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).email_unverified === true);
}

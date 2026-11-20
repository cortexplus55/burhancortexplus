import { after } from "next/server";

/**
 * Bildirimi yanıttan sonra yaz (Faz 6, 20 Kasım 2026). `after` yalnız bir isteğin içinde kurulur; rotayı doğrudan çağıran
 * birim testlerinde ya da istek dışında bildirim atlanır (bildirim hiçbir zaman asıl işi durdurmaz).
 */
export function notifyAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(() => task().catch((error: unknown) => console.error("in_app_notification_failed", { error: String(error) })));
  } catch {
    // İstek dışı: yazılacak bildirim yok.
  }
}

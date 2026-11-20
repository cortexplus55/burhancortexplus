/**
 * Tarayıcı içi bildirim olayı (Faz 6, 20 Kasım 2026): /bildirimler sayfası okundu işaretleyince çan rozeti aynı anda
 * güncellensin. Ayrıntıda sunucunun döndürdüğü güncel okunmamış sayısı taşınır.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "cp:notifications-changed";

export type NotificationsChangedDetail = { unread: number };

export function announceUnread(unread: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsChangedDetail>(NOTIFICATIONS_CHANGED_EVENT, { detail: { unread: Math.max(0, unread) } }),
  );
}

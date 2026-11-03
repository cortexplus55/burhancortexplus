/**
 * Küçük süreç içi önbellek (3 Kasım 2026): sıcak sunucu örneğinde aynı hazırlığın havuz ders
 * özetini her sohbet mesajında yeniden okumamak için. Söz (promise) saklanır: eşzamanlı istekler tek
 * okumayı paylaşır; reddedilen söz hemen silinir (hata önbelleğe girmez).
 */
export function ttlMemo<T>(ttlMs: number, max = 200, now: () => number = Date.now) {
  const store = new Map<string, { at: number; value: Promise<T> }>();
  return function get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = load();
    store.set(key, { at: now(), value });
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });
    if (store.size > max) store.delete(store.keys().next().value as string);
    return value;
  };
}
